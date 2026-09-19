import {
  GITHUB_CLAIM_SCHEMA_HASH,
  GITHUB_CLAIM_SCHEMA_ID,
  parseGithubClaimPayload,
} from "@vellum/schemas";

import type { VerifiedClaim } from "./contracts";
import { GithubOAuthError, OAuthConfigurationError } from "./errors";

const GITHUB_API_VERSION = "2026-03-10";
const GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
const GITHUB_ACCESS_TOKEN_URL = "https://github.com/login/oauth/access_token";
const GITHUB_USER_URL = "https://api.github.com/user";
const PROVIDER_TIMEOUT_MS = 10_000;

export type GithubOAuthEnvironment = {
  [key: string]: string | undefined;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  GITHUB_OAUTH_CALLBACK_URL?: string;
  VELLUM_OAUTH_STATE_SECRET?: string;
};

export type GithubOAuthConfig = {
  callbackUrl: URL;
  clientId: string;
  clientSecret: string;
  stateSecret: string;
};

export type GithubFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export type GithubVerifierDependencies = {
  fetch: GithubFetch;
  now: () => number;
};

const defaultDependencies: GithubVerifierDependencies = {
  fetch: globalThis.fetch,
  now: () => Math.floor(Date.now() / 1_000),
};

type GithubCredentials = {
  accessToken: string;
  hasRefreshToken: boolean;
  hasUnexpectedScopes: boolean;
  valid: boolean;
};

type GithubAccount = {
  createdAt: number;
  id: number;
  login: string;
};

function requiredValue(
  value: string | undefined,
  name: "client ID" | "client secret" | "callback URL" | "state secret",
): string {
  if (!value || value.trim() !== value) {
    throw new OAuthConfigurationError(`The GitHub OAuth ${name} is not configured.`);
  }
  return value;
}

function isLoopback(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

export function githubOAuthConfig(
  environment: GithubOAuthEnvironment = process.env,
): GithubOAuthConfig {
  const clientId = requiredValue(environment.GITHUB_CLIENT_ID, "client ID");
  const clientSecret = requiredValue(environment.GITHUB_CLIENT_SECRET, "client secret");
  const callbackValue = requiredValue(environment.GITHUB_OAUTH_CALLBACK_URL, "callback URL");
  const stateSecret = requiredValue(environment.VELLUM_OAUTH_STATE_SECRET, "state secret");

  if (
    !/^[A-Za-z0-9_.-]{8,128}$/.test(clientId) ||
    clientSecret.length < 20 ||
    clientSecret.length > 256
  ) {
    throw new OAuthConfigurationError("The GitHub OAuth credentials are invalid.");
  }
  if (
    Buffer.byteLength(stateSecret, "utf8") < 32 ||
    Buffer.byteLength(stateSecret, "utf8") > 1_024
  ) {
    throw new OAuthConfigurationError("The OAuth state secret is not configured securely.");
  }

  let callbackUrl: URL;
  try {
    callbackUrl = new URL(callbackValue);
  } catch {
    throw new OAuthConfigurationError("The GitHub OAuth callback URL is invalid.");
  }
  if (
    (callbackUrl.protocol !== "https:" &&
      !(callbackUrl.protocol === "http:" && isLoopback(callbackUrl.hostname))) ||
    callbackUrl.username ||
    callbackUrl.password ||
    callbackUrl.pathname !== "/api/verify/github/callback" ||
    callbackUrl.search ||
    callbackUrl.hash
  ) {
    throw new OAuthConfigurationError("The GitHub OAuth callback URL is invalid.");
  }

  return { callbackUrl, clientId, clientSecret, stateSecret };
}

export function githubAuthorizationUrl(
  config: GithubOAuthConfig,
  state: string,
  codeChallenge: string,
): string {
  const url = new URL(GITHUB_AUTHORIZE_URL);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.callbackUrl.toString());
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

function timeoutSignal(): AbortSignal {
  return AbortSignal.timeout(PROVIDER_TIMEOUT_MS);
}

async function providerFetch(
  fetchImplementation: GithubFetch,
  input: string | URL,
  init: RequestInit,
): Promise<Response> {
  try {
    return await fetchImplementation(input, { ...init, signal: timeoutSignal() });
  } catch {
    throw new GithubOAuthError(
      "provider_unavailable",
      502,
      "GitHub did not respond. Try connecting again.",
    );
  }
}

function retryTimestamp(response: Response, now: number): number | undefined {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter && /^\d+$/.test(retryAfter)) {
    return now + Number(retryAfter);
  }
  const reset = response.headers.get("x-ratelimit-reset");
  if (reset && /^\d+$/.test(reset)) {
    const timestamp = Number(reset);
    if (Number.isSafeInteger(timestamp) && timestamp > now) return timestamp;
  }
  return undefined;
}

function throwProviderResponse(response: Response, now: number): never {
  if (
    response.status === 429 ||
    (response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0")
  ) {
    throw new GithubOAuthError(
      "provider_rate_limited",
      429,
      "GitHub is rate limiting verification. Try again after the reset time.",
      retryTimestamp(response, now),
    );
  }
  throw new GithubOAuthError(
    "provider_unavailable",
    502,
    "GitHub could not complete verification. Try connecting again.",
  );
}

async function jsonBody(response: Response): Promise<Record<string, unknown>> {
  try {
    const value: unknown = await response.json();
    if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw new GithubOAuthError(
      "provider_unavailable",
      502,
      "GitHub returned an invalid response. Try connecting again.",
    );
  }
}

async function exchangeGithubCode(
  code: string,
  codeVerifier: string,
  config: GithubOAuthConfig,
  dependencies: GithubVerifierDependencies,
): Promise<GithubCredentials> {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    code_verifier: codeVerifier,
    redirect_uri: config.callbackUrl.toString(),
  });
  const response = await providerFetch(dependencies.fetch, GITHUB_ACCESS_TOKEN_URL, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded",
      "user-agent": "Vellum GitHub verifier",
    },
    body,
  });
  if (!response.ok) throwProviderResponse(response, dependencies.now());

  const value = await jsonBody(response);
  if (
    typeof value.access_token !== "string" ||
    value.access_token.length < 1 ||
    value.access_token.length > 1_024
  ) {
    throw new GithubOAuthError(
      "provider_unavailable",
      502,
      "GitHub returned an invalid authorization response. Try connecting again.",
    );
  }

  const hasUnexpectedScopes = value.scope !== "";
  return {
    accessToken: value.access_token,
    hasRefreshToken: typeof value.refresh_token === "string" && value.refresh_token.length > 0,
    hasUnexpectedScopes,
    valid:
      typeof value.error !== "string" &&
      !hasUnexpectedScopes &&
      typeof value.token_type === "string" &&
      value.token_type.toLowerCase() === "bearer",
  };
}

async function fetchGithubAccount(
  accessToken: string,
  dependencies: GithubVerifierDependencies,
): Promise<GithubAccount> {
  const response = await providerFetch(dependencies.fetch, GITHUB_USER_URL, {
    method: "GET",
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${accessToken}`,
      "user-agent": "Vellum GitHub verifier",
      "x-github-api-version": GITHUB_API_VERSION,
    },
  });
  if (!response.ok) throwProviderResponse(response, dependencies.now());

  const value = await jsonBody(response);
  const createdAt =
    typeof value.created_at === "string" ? Date.parse(value.created_at) : Number.NaN;
  if (
    typeof value.login !== "string" ||
    !Number.isSafeInteger(value.id) ||
    typeof value.id !== "number" ||
    value.id <= 0 ||
    value.type !== "User" ||
    !Number.isFinite(createdAt)
  ) {
    throw new GithubOAuthError(
      "provider_unavailable",
      502,
      "GitHub returned incomplete account data. Try connecting again.",
    );
  }

  return { login: value.login, id: value.id, createdAt: Math.floor(createdAt / 1_000) };
}

async function revokeGithubCredentials(
  accessToken: string,
  revokeGrant: boolean,
  config: GithubOAuthConfig,
  dependencies: GithubVerifierDependencies,
): Promise<void> {
  const kind = revokeGrant ? "grant" : "token";
  const response = await providerFetch(
    dependencies.fetch,
    `https://api.github.com/applications/${encodeURIComponent(config.clientId)}/${kind}`,
    {
      method: "DELETE",
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`, "utf8").toString("base64")}`,
        "content-type": "application/json",
        "user-agent": "Vellum GitHub verifier",
        "x-github-api-version": GITHUB_API_VERSION,
      },
      body: JSON.stringify({ access_token: accessToken }),
    },
  );
  if (response.status === 204 || response.status === 404) return;
  if (
    response.status === 429 ||
    (response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0")
  ) {
    throw new GithubOAuthError(
      "credential_revocation_failed",
      502,
      "GitHub access could not be released. Remove Vellum from GitHub Authorized OAuth Apps before retrying.",
      retryTimestamp(response, dependencies.now()),
    );
  }
  throw new GithubOAuthError(
    "credential_revocation_failed",
    502,
    "GitHub access could not be released. Remove Vellum from GitHub Authorized OAuth Apps before retrying.",
  );
}

export async function verifyGithubAuthorization(
  code: string,
  codeVerifier: string,
  config: GithubOAuthConfig,
  dependencies: GithubVerifierDependencies = defaultDependencies,
): Promise<VerifiedClaim> {
  let accessToken: string | undefined;
  let revokeGrant = false;
  let account: GithubAccount;
  let verifiedAt: number;

  try {
    if (!/^[A-Za-z0-9_-]{43}$/.test(codeVerifier)) {
      throw new GithubOAuthError(
        "oauth_state_invalid",
        400,
        "The GitHub verification session is invalid.",
      );
    }
    const credentials = await exchangeGithubCode(code, codeVerifier, config, dependencies);
    accessToken = credentials.accessToken;
    revokeGrant = credentials.hasRefreshToken || credentials.hasUnexpectedScopes;
    if (!credentials.valid) {
      throw new GithubOAuthError(
        "provider_unavailable",
        502,
        "GitHub authorization expired or was already used. Start verification again.",
      );
    }
    account = await fetchGithubAccount(accessToken, dependencies);
    verifiedAt = dependencies.now();
  } finally {
    if (accessToken) {
      await revokeGithubCredentials(accessToken, revokeGrant, config, dependencies);
      accessToken = undefined;
    }
  }

  let payload;
  try {
    payload = parseGithubClaimPayload({
      user_id: account.id,
      login: account.login,
      profile_url: `https://github.com/${account.login}`,
      account_created_at: account.createdAt,
      verified_at: verifiedAt,
    });
  } catch {
    throw new GithubOAuthError(
      "provider_unavailable",
      502,
      "GitHub returned account data that cannot be verified.",
    );
  }

  return {
    schema: { id: GITHUB_CLAIM_SCHEMA_ID, hash: GITHUB_CLAIM_SCHEMA_HASH },
    payload,
    issuedAt: verifiedAt,
  };
}
