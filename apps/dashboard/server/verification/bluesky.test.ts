import { describe, expect, mock, test } from "bun:test";

import { BlueskyVerificationError, OAuthConfigurationError } from "./errors";
import {
  blueskyVerificationConfig,
  normalizeBlueskyHandle,
  verifyBlueskyCredentials,
  type BlueskyFetch,
} from "./bluesky";

const NOW = 1_800_000_000;
const HANDLE = "builder.bsky.social";
const DID = "did:plc:ewvi7nxzyoun6zhxrhs64oiz";
const APP_PASSWORD = "abcd-efgh-ijkl-mnop";
const ACCESS_TOKEN = "access-token-for-tests-only";
const REFRESH_TOKEN = "refresh-token-for-tests-only";

function dependencies(
  overrides: { active?: boolean; resolvedDid?: string; deleteStatus?: number } = {},
) {
  const fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/com.atproto.server.createSession")) {
      return Response.json({
        accessJwt: ACCESS_TOKEN,
        refreshJwt: REFRESH_TOKEN,
        handle: HANDLE,
        did: DID,
        active: overrides.active ?? true,
      });
    }
    if (url.includes("/com.atproto.identity.resolveHandle")) {
      return Response.json({ did: overrides.resolvedDid ?? DID });
    }
    if (url.endsWith("/com.atproto.server.deleteSession")) {
      return new Response(null, { status: overrides.deleteStatus ?? 200 });
    }
    throw new Error(`Unexpected Bluesky request: ${url} ${init?.method}`);
  });
  return { fetch, now: () => NOW };
}

describe("Bluesky verifier", () => {
  test("authenticates, resolves the stable DID, closes the session, and builds a public claim", async () => {
    const deps = dependencies();
    const verified = await verifyBlueskyCredentials(
      { handle: HANDLE, appPassword: APP_PASSWORD },
      deps,
    );

    expect(verified).toEqual({
      account: {
        did: DID,
        handle: HANDLE,
        profileUrl: `https://bsky.app/profile/${DID}`,
      },
      claim: {
        schema: {
          id: "vellum.social.bluesky.v1",
          hash: "0x60bfe9263501d3d17513463b9a3163793690dcf2b614ecc17d7dd52688a083f6",
        },
        payload: {
          did: DID,
          handle: HANDLE,
          profile_url: `https://bsky.app/profile/${DID}`,
          verified_at: NOW,
        },
        issuedAt: NOW,
      },
    });
    expect(deps.fetch).toHaveBeenCalledTimes(3);
    const [loginUrl, loginInit] = deps.fetch.mock.calls[0];
    expect(String(loginUrl)).toBe("https://bsky.social/xrpc/com.atproto.server.createSession");
    expect(JSON.parse(String(loginInit?.body))).toEqual({
      identifier: HANDLE,
      password: APP_PASSWORD,
    });
    expect(String(deps.fetch.mock.calls[1][0])).toContain(`handle=${HANDLE}`);
    expect(deps.fetch.mock.calls[2][1]?.headers).toEqual({
      authorization: `Bearer ${REFRESH_TOKEN}`,
    });
    expect(JSON.stringify(verified)).not.toContain(APP_PASSWORD);
    expect(JSON.stringify(verified)).not.toContain(ACCESS_TOKEN);
    expect(JSON.stringify(verified)).not.toContain(REFRESH_TOKEN);
  });

  test("normalizes user-entered handles before authentication", async () => {
    expect(normalizeBlueskyHandle(" @Builder.Bsky.Social ")).toBe(HANDLE);
    expect(() => normalizeBlueskyHandle("not-a-handle")).toThrow(BlueskyVerificationError);

    const deps = dependencies();
    await verifyBlueskyCredentials(
      { handle: "Builder.Bsky.Social", appPassword: APP_PASSWORD },
      deps,
    );
    expect(JSON.parse(String(deps.fetch.mock.calls[0][1]?.body)).identifier).toBe(HANDLE);
  });

  test("rejects invalid credentials without exposing provider details", async () => {
    const fetch = mock(async () =>
      Response.json(
        { error: "AuthenticationRequired", message: `bad password ${APP_PASSWORD}` },
        { status: 401 },
      ),
    );

    await expect(
      verifyBlueskyCredentials(
        { handle: HANDLE, appPassword: APP_PASSWORD },
        { fetch, now: () => NOW },
      ),
    ).rejects.toMatchObject({
      code: "verification_failed",
      status: 401,
      message: "The Bluesky handle or app password was not accepted.",
    });
  });

  test("rejects primary-password-shaped credentials before contacting Bluesky", async () => {
    const deps = dependencies();
    await expect(
      verifyBlueskyCredentials({ handle: HANDLE, appPassword: "primary-password-example" }, deps),
    ).rejects.toMatchObject({ code: "verification_failed", status: 400 });
    expect(deps.fetch).not.toHaveBeenCalled();
  });

  test("closes an authenticated session even when handle resolution does not match", async () => {
    const deps = dependencies({ resolvedDid: "did:plc:aaaaaaaaaaaaaaaaaaaaaaaa" });
    await expect(
      verifyBlueskyCredentials({ handle: HANDLE, appPassword: APP_PASSWORD }, deps),
    ).rejects.toMatchObject({ code: "verification_failed", status: 409 });
    expect(deps.fetch).toHaveBeenCalledTimes(3);
    expect(String(deps.fetch.mock.calls[2][0])).toContain("deleteSession");
  });

  test("closes an authenticated session before rejecting an inactive account", async () => {
    const deps = dependencies({ active: false });
    await expect(
      verifyBlueskyCredentials({ handle: HANDLE, appPassword: APP_PASSWORD }, deps),
    ).rejects.toMatchObject({ code: "verification_failed", status: 401 });
    expect(deps.fetch).toHaveBeenCalledTimes(2);
    expect(String(deps.fetch.mock.calls[1][0])).toContain("deleteSession");
  });

  test("fails closed when the temporary provider session cannot be deleted", async () => {
    const deps = dependencies({ deleteStatus: 503 });
    await expect(
      verifyBlueskyCredentials({ handle: HANDLE, appPassword: APP_PASSWORD }, deps),
    ).rejects.toMatchObject({ code: "credential_revocation_failed", status: 502 });
  });

  test("returns provider rate limits with a retry timestamp", async () => {
    const fetch: BlueskyFetch = mock(async () =>
      Response.json(
        { error: "RateLimitExceeded" },
        { status: 429, headers: { "ratelimit-reset": String(NOW + 120) } },
      ),
    );
    await expect(
      verifyBlueskyCredentials(
        { handle: HANDLE, appPassword: APP_PASSWORD },
        { fetch, now: () => NOW },
      ),
    ).rejects.toMatchObject({
      code: "provider_rate_limited",
      status: 429,
      retryAt: NOW + 120,
    });
  });

  test("requires the existing state secret for wallet-bound submissions", () => {
    expect(blueskyVerificationConfig({ VELLUM_OAUTH_STATE_SECRET: "x".repeat(32) })).toEqual({
      stateSecret: "x".repeat(32),
    });
    expect(() => blueskyVerificationConfig({})).toThrow(OAuthConfigurationError);
    expect(() => blueskyVerificationConfig({ VELLUM_OAUTH_STATE_SECRET: "too-short" })).toThrow(
      OAuthConfigurationError,
    );
  });
});
