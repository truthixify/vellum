import {
  VERIFICATION_API_VERSION,
  claimIssuanceResultSchema,
  oauthChallengeRequestSchema,
  githubOAuthStartRequestSchema,
  type VerificationErrorCode,
} from "./contracts.js";
import {
  GithubOAuthError,
  IssuerConfigurationError,
  OAuthConfigurationError,
  VerificationCoordinationError,
  VerificationServiceError,
} from "./errors.js";
import {
  githubAuthorizationUrl,
  githubOAuthConfig,
  verifyGithubAuthorization,
  type GithubFetch,
  type GithubOAuthEnvironment,
} from "./github.js";
import { issueVerifiedClaim } from "./issuer.js";
import { createVerificationCoordinator, type VerificationCoordinator } from "./coordination.js";
import { jsonResponse, parseJsonBody, RequestBodyError } from "./http.js";
import { coordinateIssuance } from "./issuance-control.js";
import { logVerificationFailure, type VerificationFailureLogger } from "./logging.js";
import {
  clearGithubOAuthCookie,
  consumeGithubOAuthState,
  createGithubOAuthState,
} from "./oauth-state.js";
import type { ClaimIssuer } from "./service.js";
import {
  assertSubjectController,
  createSubjectChallenge,
  verifySubjectProof,
} from "./subject-proof.js";

type GithubAction = "challenge" | "start" | "callback";

export type GithubOAuthHttpDependencies = {
  environment: GithubOAuthEnvironment;
  fetch: GithubFetch;
  issueClaim: ClaimIssuer;
  createCoordinator: (environment: GithubOAuthEnvironment) => VerificationCoordinator;
  assertSubjectController: typeof assertSubjectController;
  createSubjectChallenge: typeof createSubjectChallenge;
  verifySubjectProof: typeof verifySubjectProof;
  logFailure: VerificationFailureLogger;
  nonceBytes?: () => Uint8Array;
  now: () => number;
};

const defaultDependencies: GithubOAuthHttpDependencies = {
  environment: process.env,
  fetch: globalThis.fetch,
  issueClaim: issueVerifiedClaim,
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

export function githubActionFromUrl(request: Request): GithubAction | undefined {
  const url = new URL(request.url);
  const segments = url.pathname.split("/").filter(Boolean);
  const value =
    segments.length === 4 &&
    segments[0] === "api" &&
    segments[1] === "verify" &&
    segments[2] === "github"
      ? segments[3]
      : segments.length === 2 && segments[0] === "api" && segments[1] === "github"
        ? exactlyOneParameter(url, "action")
        : undefined;
  return value === "challenge" || value === "start" || value === "callback" ? value : undefined;
}

function exactlyOneParameter(url: URL, name: string): string | undefined {
  const values = url.searchParams.getAll(name);
  return values.length === 1 ? values[0] : undefined;
}

function callbackRedirect(
  request: Request,
  callbackUrl: URL | undefined,
  secure: boolean,
  parameters: Record<string, string | number | undefined>,
): Response {
  const url = new URL("/verify/github", callbackUrl ?? new URL(request.url));
  for (const [name, value] of Object.entries(parameters)) {
    if (value !== undefined) url.searchParams.set(name, String(value));
  }
  return new Response(null, {
    status: 303,
    headers: {
      "cache-control": "no-store",
      location: url.toString(),
      "referrer-policy": "no-referrer",
      "set-cookie": clearGithubOAuthCookie(secure),
    },
  });
}

async function handleStart(
  request: Request,
  dependencies: GithubOAuthHttpDependencies,
): Promise<Response> {
  if (request.method !== "POST") {
    return errorResponse(405, "method_not_allowed", "Use POST to start GitHub verification.", {
      allow: "POST",
    });
  }

  let config;
  try {
    config = githubOAuthConfig(dependencies.environment);
  } catch (error) {
    if (error instanceof OAuthConfigurationError) {
      return errorResponse(
        503,
        "oauth_configuration_error",
        "GitHub verification is not configured. Try again later.",
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

  const parsed = githubOAuthStartRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      400,
      "invalid_request",
      "Choose a valid did:ckb identity before connecting GitHub.",
    );
  }

  const now = dependencies.now();
  try {
    const coordinator = dependencies.createCoordinator(dependencies.environment);
    const controllerLockHash = await dependencies.verifySubjectProof(
      "github",
      parsed.data.subject,
      parsed.data.proof,
      config.stateSecret,
      now,
      coordinator,
      dependencies.environment,
    );
    const state = createGithubOAuthState(
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
        platform: "github",
        authorizationUrl: githubAuthorizationUrl(config, state.state, state.codeChallenge),
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
        "GitHub verification is temporarily unavailable.",
      );
    }
    if (error instanceof VerificationServiceError) {
      return errorResponse(error.status, error.code, error.message);
    }
    dependencies.logFailure({
      error,
      platform: "github",
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
  dependencies: GithubOAuthHttpDependencies,
): Promise<Response> {
  if (request.method !== "POST") {
    return errorResponse(405, "method_not_allowed", "Use POST to request a wallet challenge.", {
      allow: "POST",
    });
  }

  let config;
  try {
    config = githubOAuthConfig(dependencies.environment);
    dependencies.createCoordinator(dependencies.environment);
  } catch (error) {
    if (error instanceof OAuthConfigurationError) {
      return errorResponse(
        503,
        "oauth_configuration_error",
        "GitHub verification is not configured. Try again later.",
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
      "Choose a valid did:ckb identity before connecting GitHub.",
    );
  }

  try {
    const challenge = await dependencies.createSubjectChallenge(
      "github",
      parsed.data.subject,
      config.stateSecret,
      dependencies.now(),
      dependencies.environment,
    );
    return jsonResponse({
      ok: true,
      version: VERIFICATION_API_VERSION,
      platform: "github",
      ...challenge,
    });
  } catch (error) {
    if (error instanceof VerificationServiceError) {
      return errorResponse(error.status, error.code, error.message);
    }
    dependencies.logFailure({
      error,
      platform: "github",
      requestId: crypto.randomUUID(),
      stage: "challenge",
    });
    return errorResponse(503, "issuer_unavailable", "The selected identity could not be resolved.");
  }
}

async function handleCallback(
  request: Request,
  dependencies: GithubOAuthHttpDependencies,
): Promise<Response> {
  if (request.method !== "GET") {
    return errorResponse(405, "method_not_allowed", "Use GET for the GitHub OAuth callback.", {
      allow: "GET",
    });
  }

  let config;
  try {
    config = githubOAuthConfig(dependencies.environment);
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
      throw new GithubOAuthError(
        "oauth_state_invalid",
        400,
        "The GitHub verification session is invalid.",
      );
    }
    const oauthState = consumeGithubOAuthState(
      request.headers.get("cookie"),
      queryState,
      config.stateSecret,
      dependencies.now(),
    );

    const providerError = exactlyOneParameter(url, "error");
    if (providerError) {
      throw new GithubOAuthError(
        providerError === "access_denied" ? "oauth_denied" : "provider_unavailable",
        providerError === "access_denied" ? 400 : 502,
        providerError === "access_denied"
          ? "GitHub access was not approved."
          : "GitHub could not complete authorization.",
      );
    }

    const code = exactlyOneParameter(url, "code");
    if (!code || !/^[A-Za-z0-9_-]{1,512}$/.test(code)) {
      throw new GithubOAuthError(
        "provider_unavailable",
        502,
        "GitHub did not return a usable authorization code.",
      );
    }

    await dependencies.assertSubjectController(
      oauthState.subject,
      oauthState.controllerLockHash,
      dependencies.environment,
    );

    const claim = await verifyGithubAuthorization(code, oauthState.codeVerifier, config, {
      fetch: dependencies.fetch,
      now: dependencies.now,
    });
    const accountId = claim.payload.user_id;
    if (typeof accountId !== "number" || !Number.isSafeInteger(accountId)) {
      throw new GithubOAuthError(
        "provider_unavailable",
        502,
        "GitHub returned incomplete account data.",
      );
    }
    let issued;
    try {
      const coordinator = dependencies.createCoordinator(dependencies.environment);
      issued = await coordinateIssuance({
        accountId: String(accountId),
        coordinator,
        issue: async () =>
          claimIssuanceResultSchema.parse(await dependencies.issueClaim(oauthState.subject, claim)),
        now: dependencies.now(),
        platform: "github",
        subjectDid: oauthState.subject.did,
      });
    } catch (error) {
      dependencies.logFailure({ error, platform: "github", requestId, stage: "issuance" });
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

    const login = claim.payload.login;
    return callbackRedirect(request, config.callbackUrl, secure, {
      status: "submitted",
      subject: oauthState.subject.did,
      transaction: issued.transactionHash,
      claim: issued.claimId,
      output: issued.outputIndex,
      login: typeof login === "string" ? login : undefined,
    });
  } catch (error) {
    if (error instanceof GithubOAuthError) {
      return callbackRedirect(request, config.callbackUrl, secure, {
        status: "error",
        code: error.code,
        retryAt: error.retryAt,
      });
    }
    if (error instanceof VerificationServiceError) {
      dependencies.logFailure({ error, platform: "github", requestId, stage: "callback" });
      return callbackRedirect(request, config.callbackUrl, secure, {
        status: "error",
        code: error.code,
        retryAt: error.retryAt,
      });
    }
    dependencies.logFailure({ error, platform: "github", requestId, stage: "callback" });
    return callbackRedirect(request, config.callbackUrl, secure, {
      status: "error",
      code: "verification_failed",
    });
  }
}

export async function handleGithubOAuthRequest(
  request: Request,
  dependencies: GithubOAuthHttpDependencies = defaultDependencies,
): Promise<Response> {
  const action = githubActionFromUrl(request);
  if (action === "challenge") return handleChallenge(request, dependencies);
  if (action === "start") return handleStart(request, dependencies);
  if (action === "callback") return handleCallback(request, dependencies);
  return errorResponse(404, "invalid_request", "The GitHub verification endpoint was not found.");
}
