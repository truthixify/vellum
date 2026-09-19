import { describe, expect, mock, test } from "bun:test";

import { GithubOAuthError, OAuthConfigurationError } from "./errors";
import {
  githubAuthorizationUrl,
  githubOAuthConfig,
  verifyGithubAuthorization,
  type GithubFetch,
  type GithubOAuthEnvironment,
} from "./github";

const NOW = 1_800_000_000;
const ACCESS_TOKEN = "provider-token-for-tests-only";
const CODE_VERIFIER = "V".repeat(43);
const CODE_CHALLENGE = "C".repeat(43);
const ENVIRONMENT = {
  GITHUB_CLIENT_ID: "client-id-for-tests",
  GITHUB_CLIENT_SECRET: "client-secret-for-tests-only",
  GITHUB_OAUTH_CALLBACK_URL: "https://dashboard.usevellum.xyz/api/verify/github/callback",
  VELLUM_OAUTH_STATE_SECRET: "state-secret-for-tests-only".repeat(2),
} satisfies GithubOAuthEnvironment;

function sequence(...responses: Response[]) {
  return mock(async (_input: string | URL | Request, _init?: RequestInit) => {
    const response = responses.shift();
    if (!response) throw new Error("Unexpected provider request");
    return response;
  });
}

function tokenResponse(extra: Record<string, unknown> = {}): Response {
  return Response.json({ access_token: ACCESS_TOKEN, scope: "", token_type: "bearer", ...extra });
}

function userResponse(overrides: Record<string, unknown> = {}): Response {
  return Response.json({
    login: "truthixify",
    id: 5_830_913,
    type: "User",
    created_at: "2022-04-15T05:20:00Z",
    ...overrides,
  });
}

describe("GitHub OAuth verifier", () => {
  test("validates configuration and requests no profile scopes", () => {
    const config = githubOAuthConfig(ENVIRONMENT);
    const url = new URL(githubAuthorizationUrl(config, "state-value", CODE_CHALLENGE));

    expect(url.origin + url.pathname).toBe("https://github.com/login/oauth/authorize");
    expect(url.searchParams.has("scope")).toBe(false);
    expect(url.searchParams.get("code_challenge")).toBe(CODE_CHALLENGE);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("redirect_uri")).toBe(ENVIRONMENT.GITHUB_OAUTH_CALLBACK_URL);
    expect(() => githubOAuthConfig({ ...ENVIRONMENT, GITHUB_CLIENT_SECRET: "short" })).toThrow(
      OAuthConfigurationError,
    );
    expect(() =>
      githubOAuthConfig({
        ...ENVIRONMENT,
        GITHUB_OAUTH_CALLBACK_URL: "http://example.com/api/verify/github/callback",
      }),
    ).toThrow(OAuthConfigurationError);
  });

  test("fetches the authenticated account, revokes the token, and returns the canonical claim", async () => {
    const fetch = sequence(tokenResponse(), userResponse(), new Response(null, { status: 204 }));
    const claim = await verifyGithubAuthorization(
      "one-time-code",
      CODE_VERIFIER,
      githubOAuthConfig(ENVIRONMENT),
      {
        fetch,
        now: () => NOW,
      },
    );

    expect(claim).toEqual({
      schema: {
        id: "vellum.social.github.v1",
        hash: "0x25980dec7f198c7b228a621c61b911b8a20c55b340f398e495c4be65aa399f3c",
      },
      payload: {
        user_id: 5_830_913,
        login: "truthixify",
        profile_url: "https://github.com/truthixify",
        account_created_at: 1_650_000_000,
        verified_at: NOW,
      },
      issuedAt: NOW,
    });
    expect(fetch).toHaveBeenCalledTimes(3);

    const calls = fetch.mock.calls;
    expect(String(calls[0][0])).toBe("https://github.com/login/oauth/access_token");
    expect(String(calls[0][1]?.body)).toContain(`code_verifier=${CODE_VERIFIER}`);
    expect(String(calls[1][0])).toBe("https://api.github.com/user");
    expect(String(calls[2][0])).toContain("/applications/client-id-for-tests/token");
    expect((calls[1][1]?.headers as Record<string, string>).authorization).toBe(
      `Bearer ${ACCESS_TOKEN}`,
    );
    expect(String(calls[2][1]?.body)).toContain(ACCESS_TOKEN);
    expect(JSON.stringify(claim)).not.toContain(ACCESS_TOKEN);
  });

  test("revokes a token after provider failure and exposes an actionable reset time", async () => {
    const fetch = sequence(
      tokenResponse(),
      new Response(null, {
        status: 429,
        headers: { "retry-after": "60" },
      }),
      new Response(null, { status: 204 }),
    );

    try {
      await verifyGithubAuthorization(
        "one-time-code",
        CODE_VERIFIER,
        githubOAuthConfig(ENVIRONMENT),
        {
          fetch,
          now: () => NOW,
        },
      );
      throw new Error("Expected verification to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(GithubOAuthError);
      expect((error as GithubOAuthError).code).toBe("provider_rate_limited");
      expect((error as GithubOAuthError).retryAt).toBe(NOW + 60);
      expect(String(error)).not.toContain(ACCESS_TOKEN);
    }
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  test("fails before issuance when GitHub credentials cannot be revoked", async () => {
    const fetch = sequence(tokenResponse(), userResponse(), new Response(null, { status: 500 }));

    await expect(
      verifyGithubAuthorization("one-time-code", CODE_VERIFIER, githubOAuthConfig(ENVIRONMENT), {
        fetch,
        now: () => NOW,
      }),
    ).rejects.toMatchObject({ code: "credential_revocation_failed" });
  });

  test("revokes a returned token before rejecting a malformed authorization response", async () => {
    const fetch = sequence(
      tokenResponse({ token_type: "mac" }),
      new Response(null, { status: 204 }),
    );

    await expect(
      verifyGithubAuthorization("one-time-code", CODE_VERIFIER, githubOAuthConfig(ENVIRONMENT), {
        fetch,
        now: () => NOW,
      }),
    ).rejects.toMatchObject({ code: "provider_unavailable" });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(String(fetch.mock.calls[1][0])).toContain("/applications/client-id-for-tests/token");
  });

  test("revokes the complete grant if GitHub unexpectedly returns a refresh token", async () => {
    const fetch = sequence(
      tokenResponse({ refresh_token: "refresh-token-for-tests-only" }),
      userResponse(),
      new Response(null, { status: 204 }),
    );

    await verifyGithubAuthorization(
      "one-time-code",
      CODE_VERIFIER,
      githubOAuthConfig(ENVIRONMENT),
      {
        fetch,
        now: () => NOW,
      },
    );

    expect(String(fetch.mock.calls[2][0])).toContain("/grant");
  });

  test("rejects and revokes a token with broader scopes", async () => {
    const fetch = sequence(
      tokenResponse({ scope: "read:user" }),
      new Response(null, { status: 204 }),
    );

    await expect(
      verifyGithubAuthorization("one-time-code", CODE_VERIFIER, githubOAuthConfig(ENVIRONMENT), {
        fetch,
        now: () => NOW,
      }),
    ).rejects.toMatchObject({ code: "provider_unavailable" });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(String(fetch.mock.calls[1][0])).toContain("/applications/client-id-for-tests/grant");
  });
});
