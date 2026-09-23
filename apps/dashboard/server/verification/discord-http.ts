import { discordCommunitySchema, discordIdentitySchema } from "@vellum/schemas";

import {
  VERIFICATION_API_VERSION,
  claimIssuanceResultSchema,
  oauthChallengeRequestSchema,
  oauthStartRequestSchema,
  verifiedClaimSchema,
  type ClaimIssuanceResult,
  type VerificationErrorCode,
  type VerificationSubject,
  type VerifiedClaim,
} from "./contracts.js";
import {
  discordAuthorizationUrl,
  discordOAuthConfig,
  verifyDiscordAuthorization,
  type DiscordFetch,
  type DiscordOAuthEnvironment,
} from "./discord.js";
import {
  DiscordOAuthError,
  IssuerConfigurationError,
  OAuthConfigurationError,
  VerificationCoordinationError,
  VerificationServiceError,
} from "./errors.js";
import { createVerificationCoordinator, type VerificationCoordinator } from "./coordination.js";
import { issueVerifiedClaims } from "./issuer.js";
import {
  jsonResponse,
  parseJsonBody,
  RequestBodyError,
  setRouterSearchParameters,
} from "./http.js";
import { coordinateIssuance } from "./issuance-control.js";
import { logVerificationFailure, type VerificationFailureLogger } from "./logging.js";
import {
  clearDiscordOAuthCookie,
  consumeDiscordOAuthState,
  createDiscordOAuthState,
} from "./oauth-state.js";
import {
  assertSubjectController,
  createSubjectChallenge,
  verifySubjectProof,
} from "./subject-proof.js";

type DiscordAction = "challenge" | "start" | "callback";

export type DiscordClaimIssuer = (
  subject: VerificationSubject,
  claims: readonly VerifiedClaim[],
) => Promise<ClaimIssuanceResult[]>;

export type DiscordOAuthHttpDependencies = {
  environment: DiscordOAuthEnvironment;
  fetch: DiscordFetch;
  issueClaims: DiscordClaimIssuer;
  createCoordinator: (environment: DiscordOAuthEnvironment) => VerificationCoordinator;
  assertSubjectController: typeof assertSubjectController;
  createSubjectChallenge: typeof createSubjectChallenge;
  verifySubjectProof: typeof verifySubjectProof;
  logFailure: VerificationFailureLogger;
  nonceBytes?: () => Uint8Array;
  now: () => number;
};

const defaultDependencies: DiscordOAuthHttpDependencies = {
  environment: process.env,
  fetch: globalThis.fetch,
  issueClaims: (subject, claims) => issueVerifiedClaims(subject, claims),
  createCoordinator: createVerificationCoordinator,
  assertSubjectController,
  createSubjectChallenge,
  verifySubjectProof,
  logFailure: logVerificationFailure,
  now: () => Math.floor(Date.now() / 1_000),
};

function errorResponse(
  status: number,
  code: VerificationErrorCode,
  message: string,
  headers?: HeadersInit,
): Response {
  return jsonResponse(
    {
      ok: false,
      version: VERIFICATION_API_VERSION,
      error: { code, message },
    },
    status,
    headers,
  );
}

function exactlyOneParameter(url: URL, name: string): string | undefined {
  const values = url.searchParams.getAll(name);
  return values.length === 1 ? values[0] : undefined;
}

export function discordActionFromUrl(request: Request): DiscordAction | undefined {
  const url = new URL(request.url);
  const segments = url.pathname.split("/").filter(Boolean);
  const value =
    segments.length === 4 &&
    segments[0] === "api" &&
    segments[1] === "verify" &&
    segments[2] === "discord"
      ? segments[3]
      : segments.length === 2 && segments[0] === "api" && segments[1] === "discord"
        ? exactlyOneParameter(url, "action")
        : undefined;
  return value === "challenge" || value === "start" || value === "callback" ? value : undefined;
}

function callbackRedirect(
  request: Request,
  callbackUrl: URL | undefined,
  secure: boolean,
  parameters: Record<string, string | number | undefined>,
): Response {
  const url = new URL("/verify/discord", callbackUrl ?? new URL(request.url));
  setRouterSearchParameters(url, parameters);
  return new Response(null, {
    status: 303,
    headers: {
      "cache-control": "no-store",
      location: url.toString(),
      "referrer-policy": "no-referrer",
      "set-cookie": clearDiscordOAuthCookie(secure),
    },
  });
}

async function handleStart(
  request: Request,
  dependencies: DiscordOAuthHttpDependencies,
): Promise<Response> {
  if (request.method !== "POST") {
    return errorResponse(405, "method_not_allowed", "Use POST to start Discord verification.", {
      allow: "POST",
    });
  }

  let config;
  try {
    config = discordOAuthConfig(dependencies.environment);
  } catch (error) {
    if (error instanceof OAuthConfigurationError) {
      return errorResponse(
        503,
        "oauth_configuration_error",
        "Discord verification is not configured. Try again later.",
      );
    }
    throw error;
  }

  let body: unknown;
  try {
    body = await parseJsonBody(request);
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return errorResponse(error.status, "invalid_request", error.message);
    }
    return errorResponse(400, "invalid_request", "The request body must contain valid JSON.");
  }

  const parsed = oauthStartRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      400,
      "invalid_request",
      "Choose a valid did:ckb identity before connecting Discord.",
    );
  }

  const now = dependencies.now();
  try {
    const coordinator = dependencies.createCoordinator(dependencies.environment);
    const controllerLockHash = await dependencies.verifySubjectProof(
      "discord",
      parsed.data.subject,
      parsed.data.proof,
      config.stateSecret,
      now,
      coordinator,
      dependencies.environment,
    );
    const state = createDiscordOAuthState(
      parsed.data.subject,
      controllerLockHash,
      config.stateSecret,
      now,
      config.callbackUrl.protocol === "https:",
      dependencies.nonceBytes,
    );
    return jsonResponse(
      {
        ok: true,
        version: VERIFICATION_API_VERSION,
        platform: "discord",
        authorizationUrl: discordAuthorizationUrl(config, state.state),
        expiresAt: state.expiresAt,
      },
      200,
      {
        "referrer-policy": "no-referrer",
        "set-cookie": state.cookie,
      },
    );
  } catch (error) {
    if (
      error instanceof OAuthConfigurationError ||
      error instanceof VerificationCoordinationError
    ) {
      return errorResponse(
        503,
        "oauth_configuration_error",
        "Discord verification is temporarily unavailable.",
      );
    }
    if (error instanceof VerificationServiceError) {
      return errorResponse(error.status, error.code, error.message);
    }
    dependencies.logFailure({
      error,
      platform: "discord",
      requestId: crypto.randomUUID(),
      stage: "start",
    });
    return errorResponse(
      400,
      "subject_control_invalid",
      "The wallet could not be verified for this identity.",
    );
  }
}

async function handleChallenge(
  request: Request,
  dependencies: DiscordOAuthHttpDependencies,
): Promise<Response> {
  if (request.method !== "POST") {
    return errorResponse(405, "method_not_allowed", "Use POST to request a wallet challenge.", {
      allow: "POST",
    });
  }

  let config;
  try {
    config = discordOAuthConfig(dependencies.environment);
    dependencies.createCoordinator(dependencies.environment);
  } catch (error) {
    if (error instanceof OAuthConfigurationError) {
      return errorResponse(
        503,
        "oauth_configuration_error",
        "Discord verification is not configured. Try again later.",
      );
    }
    throw error;
  }

  let body: unknown;
  try {
    body = await parseJsonBody(request);
  } catch (error) {
    return errorResponse(
      error instanceof RequestBodyError ? error.status : 400,
      "invalid_request",
      error instanceof RequestBodyError
        ? error.message
        : "The request body must contain valid JSON.",
    );
  }
  const parsed = oauthChallengeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      400,
      "invalid_request",
      "Choose a valid did:ckb identity before connecting Discord.",
    );
  }

  try {
    const challenge = await dependencies.createSubjectChallenge(
      "discord",
      parsed.data.subject,
      config.stateSecret,
      dependencies.now(),
      dependencies.environment,
    );
    return jsonResponse({
      ok: true,
      version: VERIFICATION_API_VERSION,
      platform: "discord",
      ...challenge,
    });
  } catch (error) {
    if (error instanceof VerificationServiceError) {
      return errorResponse(error.status, error.code, error.message);
    }
    dependencies.logFailure({
      error,
      platform: "discord",
      requestId: crypto.randomUUID(),
      stage: "challenge",
    });
    return errorResponse(503, "issuer_unavailable", "The selected identity could not be resolved.");
  }
}

function validateClaims(claims: readonly VerifiedClaim[]): readonly VerifiedClaim[] {
  if (claims.length < 1 || claims.length > 2) {
    throw new DiscordOAuthError(
      "provider_unavailable",
      502,
      "Discord returned account data that cannot be verified.",
    );
  }
  const parsed = claims.map((claim) => verifiedClaimSchema.parse(claim));
  const identity = parsed[0];
  if (
    identity.schema.id !== discordIdentitySchema.id ||
    identity.schema.hash !== discordIdentitySchema.hash
  ) {
    throw new DiscordOAuthError(
      "provider_unavailable",
      502,
      "Discord returned account data that cannot be verified.",
    );
  }
  const community = parsed[1];
  if (
    community &&
    (community.schema.id !== discordCommunitySchema.id ||
      community.schema.hash !== discordCommunitySchema.hash)
  ) {
    throw new DiscordOAuthError(
      "provider_unavailable",
      502,
      "Discord returned community data that cannot be verified.",
    );
  }
  return parsed;
}

async function handleCallback(
  request: Request,
  dependencies: DiscordOAuthHttpDependencies,
): Promise<Response> {
  if (request.method !== "GET") {
    return errorResponse(405, "method_not_allowed", "Use GET for the Discord OAuth callback.", {
      allow: "GET",
    });
  }

  let config;
  try {
    config = discordOAuthConfig(dependencies.environment);
  } catch (error) {
    if (!(error instanceof OAuthConfigurationError)) throw error;
    return callbackRedirect(request, undefined, new URL(request.url).protocol === "https:", {
      status: "error",
      code: "oauth_configuration_error",
    });
  }

  const secure = config.callbackUrl.protocol === "https:";
  const requestId = crypto.randomUUID();
  try {
    const url = new URL(request.url);
    const queryState = exactlyOneParameter(url, "state");
    if (!queryState || !/^[A-Za-z0-9_-]{43}$/.test(queryState)) {
      throw new DiscordOAuthError(
        "oauth_state_invalid",
        400,
        "The Discord verification session is invalid.",
      );
    }
    const oauthState = consumeDiscordOAuthState(
      request.headers.get("cookie"),
      queryState,
      config.stateSecret,
      dependencies.now(),
    );

    const providerError = exactlyOneParameter(url, "error");
    if (providerError) {
      throw new DiscordOAuthError(
        providerError === "access_denied" ? "oauth_denied" : "provider_unavailable",
        providerError === "access_denied" ? 400 : 502,
        providerError === "access_denied"
          ? "Discord access was not approved."
          : "Discord could not complete authorization.",
      );
    }

    const code = exactlyOneParameter(url, "code");
    if (!code || !/^[A-Za-z0-9._~-]{1,1024}$/.test(code)) {
      throw new DiscordOAuthError(
        "provider_unavailable",
        502,
        "Discord did not return a usable authorization code.",
      );
    }

    await dependencies.assertSubjectController(
      oauthState.subject,
      oauthState.controllerLockHash,
      dependencies.environment,
    );

    const verified = await verifyDiscordAuthorization(code, config, {
      fetch: dependencies.fetch,
      now: dependencies.now,
    });
    const claims = validateClaims(verified.claims);

    let issuance: ClaimIssuanceResult[];
    try {
      const coordinator = dependencies.createCoordinator(dependencies.environment);
      issuance = await coordinateIssuance({
        accountId: verified.account.id,
        coordinator,
        issue: async () =>
          (await dependencies.issueClaims(oauthState.subject, claims)).map((result) =>
            claimIssuanceResultSchema.parse(result),
          ),
        now: dependencies.now(),
        platform: "discord",
        subjectDid: oauthState.subject.did,
      });
      if (
        issuance.length !== claims.length ||
        issuance.some((result) => result.transactionHash !== issuance[0].transactionHash) ||
        new Set(issuance.map((result) => result.claimId)).size !== issuance.length ||
        new Set(issuance.map((result) => result.outputIndex)).size !== issuance.length
      ) {
        throw new Error("Discord claim issuance returned inconsistent results");
      }
    } catch (error) {
      dependencies.logFailure({ error, platform: "discord", requestId, stage: "issuance" });
      if (error instanceof VerificationServiceError) {
        return callbackRedirect(request, config.callbackUrl, secure, {
          status: "error",
          code: error.code,
          retryAt: error.retryAt,
        });
      }
      if (error instanceof IssuerConfigurationError) {
        return callbackRedirect(request, config.callbackUrl, secure, {
          status: "error",
          code: "issuer_unavailable",
        });
      }
      return callbackRedirect(request, config.callbackUrl, secure, {
        status: "error",
        code: "issuance_failed",
      });
    }

    const identity = issuance[0];
    const community = issuance[1];
    return callbackRedirect(request, config.callbackUrl, secure, {
      status: "submitted",
      subject: oauthState.subject.did,
      transaction: identity.transactionHash,
      claim: identity.claimId,
      output: identity.outputIndex,
      communityClaim: community?.claimId,
      communityOutput: community?.outputIndex,
      username: verified.account.username,
      communities: verified.memberships.length,
    });
  } catch (error) {
    if (error instanceof DiscordOAuthError) {
      return callbackRedirect(request, config.callbackUrl, secure, {
        status: "error",
        code: error.code,
        retryAt: error.retryAt,
      });
    }
    if (error instanceof VerificationServiceError) {
      dependencies.logFailure({ error, platform: "discord", requestId, stage: "callback" });
      return callbackRedirect(request, config.callbackUrl, secure, {
        status: "error",
        code: error.code,
        retryAt: error.retryAt,
      });
    }
    dependencies.logFailure({ error, platform: "discord", requestId, stage: "callback" });
    return callbackRedirect(request, config.callbackUrl, secure, {
      status: "error",
      code: "verification_failed",
    });
  }
}

export async function handleDiscordOAuthRequest(
  request: Request,
  dependencies: DiscordOAuthHttpDependencies = defaultDependencies,
): Promise<Response> {
  const action = discordActionFromUrl(request);
  if (action === "challenge") return handleChallenge(request, dependencies);
  if (action === "start") return handleStart(request, dependencies);
  if (action === "callback") return handleCallback(request, dependencies);
  return errorResponse(404, "invalid_request", "The Discord verification endpoint was not found.");
}
