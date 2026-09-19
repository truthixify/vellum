import {
  VERIFICATION_API_VERSION,
  githubOAuthStartRequestSchema,
  type VerificationErrorCode,
} from "./contracts";
import { GithubOAuthError, OAuthConfigurationError } from "./errors";
import {
  githubAuthorizationUrl,
  githubOAuthConfig,
  verifyGithubAuthorization,
  type GithubFetch,
  type GithubOAuthEnvironment,
} from "./github";
import { issueVerifiedClaim } from "./issuer";
import { jsonResponse, parseJsonBody, RequestBodyError } from "./http";
import {
  clearGithubOAuthCookie,
  consumeGithubOAuthState,
  createGithubOAuthState,
} from "./oauth-state";
import { issuePlatformClaim, type ClaimIssuer } from "./service";

type GithubAction = "start" | "callback";

export type GithubOAuthHttpDependencies = {
  environment: GithubOAuthEnvironment;
  fetch: GithubFetch;
  issueClaim: ClaimIssuer;
  nonceBytes?: () => Uint8Array;
  now: () => number;
};

const defaultDependencies: GithubOAuthHttpDependencies = {
  environment: process.env,
  fetch: globalThis.fetch,
  issueClaim: issueVerifiedClaim,
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
  return value === "start" || value === "callback" ? value : undefined;
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
  const state = createGithubOAuthState(
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

    const claim = await verifyGithubAuthorization(code, oauthState.codeVerifier, config, {
      fetch: dependencies.fetch,
      now: dependencies.now,
    });
    const issued = await issuePlatformClaim(
      "github",
      oauthState.subject,
      claim,
      dependencies.issueClaim,
    );
    if (!issued.body.ok) {
      return callbackRedirect(request, config.callbackUrl, secure, {
        status: "error",
        code: issued.body.error.code,
      });
    }

    const login = claim.payload.login;
    return callbackRedirect(request, config.callbackUrl, secure, {
      status: "submitted",
      subject: oauthState.subject.did,
      transaction: issued.body.issuance.transactionHash,
      claim: issued.body.issuance.claimId,
      output: issued.body.issuance.outputIndex,
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
  if (action === "start") return handleStart(request, dependencies);
  if (action === "callback") return handleCallback(request, dependencies);
  return errorResponse(404, "invalid_request", "The GitHub verification endpoint was not found.");
}
