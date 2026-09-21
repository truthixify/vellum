import {
  DISCORD_CLAIM_SCHEMA_HASH,
  DISCORD_CLAIM_SCHEMA_ID,
  DISCORD_COMMUNITY_CLAIM_SCHEMA_HASH,
  DISCORD_COMMUNITY_CLAIM_SCHEMA_ID,
} from "@vellum/schemas";

import {
  VERIFICATION_API_VERSION,
  claimIssuanceResultSchema,
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
import { DiscordOAuthError, IssuerConfigurationError, OAuthConfigurationError } from "./errors.js";
import { issueVerifiedClaims } from "./issuer.js";
import { jsonResponse, parseJsonBody, RequestBodyError } from "./http.js";
import {
  clearDiscordOAuthCookie,
  consumeDiscordOAuthState,
  createDiscordOAuthState,
} from "./oauth-state.js";

type DiscordAction = "start" | "callback";

export type DiscordClaimIssuer = (
  subject: VerificationSubject,
  claims: readonly VerifiedClaim[],
) => Promise<ClaimIssuanceResult[]>;

export type DiscordOAuthHttpDependencies = {
  environment: DiscordOAuthEnvironment;
  fetch: DiscordFetch;
  issueClaims: DiscordClaimIssuer;
  nonceBytes?: () => Uint8Array;
  now: () => number;
};

const defaultDependencies: DiscordOAuthHttpDependencies = {
  environment: process.env,
  fetch: globalThis.fetch,
  issueClaims: (subject, claims) => issueVerifiedClaims(subject, claims),
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
  return value === "start" || value === "callback" ? value : undefined;
}

function callbackRedirect(
  request: Request,
  callbackUrl: URL | undefined,
  secure: boolean,
  parameters: Record<string, string | number | undefined>,
): Response {
  const url = new URL("/verify/discord", callbackUrl ?? new URL(request.url));
  for (const [name, value] of Object.entries(parameters)) {
    if (value !== undefined) url.searchParams.set(name, String(value));
  }
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
  const state = createDiscordOAuthState(
    parsed.data.subject,
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
    identity.schema.id !== DISCORD_CLAIM_SCHEMA_ID ||
    identity.schema.hash !== DISCORD_CLAIM_SCHEMA_HASH
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
    (community.schema.id !== DISCORD_COMMUNITY_CLAIM_SCHEMA_ID ||
      community.schema.hash !== DISCORD_COMMUNITY_CLAIM_SCHEMA_HASH)
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

    const verified = await verifyDiscordAuthorization(code, config, {
      fetch: dependencies.fetch,
      now: dependencies.now,
    });
    const claims = validateClaims(verified.claims);

    let issuance: ClaimIssuanceResult[];
    try {
      issuance = (await dependencies.issueClaims(oauthState.subject, claims)).map((result) =>
        claimIssuanceResultSchema.parse(result),
      );
      if (
        issuance.length !== claims.length ||
        issuance.some((result) => result.transactionHash !== issuance[0].transactionHash) ||
        new Set(issuance.map((result) => result.claimId)).size !== issuance.length ||
        new Set(issuance.map((result) => result.outputIndex)).size !== issuance.length
      ) {
        throw new Error("Discord claim issuance returned inconsistent results");
      }
    } catch (error) {
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
  if (action === "start") return handleStart(request, dependencies);
  if (action === "callback") return handleCallback(request, dependencies);
  return errorResponse(404, "invalid_request", "The Discord verification endpoint was not found.");
}
