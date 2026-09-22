import { describe, expect, mock, test } from "bun:test";

import { OAuthConfigurationError, TelegramOAuthError } from "./errors";
import {
  telegramAuthorizationUrl,
  telegramOAuthConfig,
  parseTrustedTelegramCommunities,
  verifyTelegramAuthorization,
  type TelegramOAuthEnvironment,
} from "./telegram";

const NOW = 1_800_000_000;
const CLIENT_ID = "123456789012345678";
const BOT_USER_ID = "987654321";
const OIDC_SUBJECT = "1234123412341234123";
const ACCOUNT_ID = "2468101214";
const BOT_TOKEN = `${BOT_USER_ID}:telegram-bot-token-for-tests-only`;
const CHAT_ID = "-1006577996900705";
const ENVIRONMENT = {
  TELEGRAM_CLIENT_ID: CLIENT_ID,
  TELEGRAM_CLIENT_SECRET: "telegram-client-secret-for-tests-only",
  TELEGRAM_BOT_TOKEN: BOT_TOKEN,
  TELEGRAM_OAUTH_CALLBACK_URL: "https://dashboard.usevellum.xyz/api/verify/telegram/callback",
  TELEGRAM_TRUSTED_COMMUNITIES: JSON.stringify([
    { chatId: CHAT_ID, name: "Nervos Network", type: "supergroup" },
  ]),
  VELLUM_OAUTH_STATE_SECRET: "state-secret-for-tests-only".repeat(2),
} satisfies TelegramOAuthEnvironment;

function tokenResponse(overrides: Record<string, unknown> = {}): Response {
  return Response.json({
    access_token: "telegram-access-token-for-tests-only",
    token_type: "Bearer",
    expires_in: 3_600,
    id_token: "signed-telegram-id-token",
    ...overrides,
  });
}

function dependencies(
  claims: Record<string, unknown> = {
    sub: OIDC_SUBJECT,
    id: Number(ACCOUNT_ID),
    name: "Vellum Builder",
    preferred_username: "vellum_builder",
  },
  membershipStatus: "member" | "left" = "member",
  botStatus: "administrator" | "member" = "administrator",
) {
  return {
    fetch: mock(async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input) === "https://oauth.telegram.org/token") return tokenResponse();
      const body = new URLSearchParams(String(init?.body));
      const userId = body.get("user_id");
      return Response.json({
        ok: true,
        result: {
          status: userId === BOT_USER_ID ? botStatus : membershipStatus,
          user: { id: Number(userId) },
        },
      });
    }),
    now: () => NOW,
    sleep: mock(async () => undefined),
    verifyIdToken: mock(async () => claims),
  };
}

describe("Telegram OAuth verifier", () => {
  test("validates configuration and builds an OIDC request with PKCE", () => {
    const config = telegramOAuthConfig(ENVIRONMENT);
    const url = new URL(
      telegramAuthorizationUrl(
        config,
        "state-value",
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      ),
    );

    expect(url.origin + url.pathname).toBe("https://oauth.telegram.org/auth");
    expect(url.searchParams.get("client_id")).toBe(CLIENT_ID);
    expect(url.searchParams.get("redirect_uri")).toBe(ENVIRONMENT.TELEGRAM_OAUTH_CALLBACK_URL);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe("openid profile");
    expect(url.searchParams.get("state")).toBe("state-value");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(config.botUserId).toBe(BOT_USER_ID);
    expect(config.trustedCommunities).toEqual([
      { chatId: CHAT_ID, name: "Nervos Network", type: "supergroup" },
    ]);
    expect(() => telegramOAuthConfig({ ...ENVIRONMENT, TELEGRAM_CLIENT_SECRET: "short" })).toThrow(
      OAuthConfigurationError,
    );
    expect(() =>
      telegramOAuthConfig({
        ...ENVIRONMENT,
        TELEGRAM_OAUTH_CALLBACK_URL: "https://example.com/wrong",
      }),
    ).toThrow(OAuthConfigurationError);
    expect(() => telegramOAuthConfig({ ...ENVIRONMENT, TELEGRAM_BOT_TOKEN: undefined })).toThrow(
      OAuthConfigurationError,
    );
    expect(() =>
      parseTrustedTelegramCommunities(
        JSON.stringify([
          { chatId: CHAT_ID, name: "One", type: "supergroup" },
          { chatId: CHAT_ID, name: "Two", type: "channel" },
        ]),
      ),
    ).toThrow(OAuthConfigurationError);
  });

  test("returns canonical identity and current Nervos membership claims", async () => {
    const deps = dependencies();
    const verified = await verifyTelegramAuthorization(
      "one-time-code",
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      telegramOAuthConfig(ENVIRONMENT),
      deps,
    );

    expect(verified).toEqual({
      account: {
        id: ACCOUNT_ID,
        displayName: "Vellum Builder",
        username: "vellum_builder",
      },
      claims: [
        {
          schema: {
            id: "vellum.social.telegram.v1",
            hash: "0xe8b7f0ba94a55a5676ab205d9e1a997e1953d1e5cb6b89fd295ad5d69356467f",
          },
          payload: {
            user_id: ACCOUNT_ID,
            display_name: "Vellum Builder",
            username: "vellum_builder",
            profile_url: "https://t.me/vellum_builder",
            verified_at: NOW,
          },
          issuedAt: NOW,
        },
        {
          schema: {
            id: "vellum.community.telegram.v1",
            hash: "0x8f8b0b59997ff96fde030314498c56008cb743006ae53b368339382640f8bd59",
          },
          payload: {
            user_id: ACCOUNT_ID,
            verified_at: NOW,
            memberships: [
              {
                chat_id: CHAT_ID,
                community_name: "Nervos Network",
                community_type: "supergroup",
                member_role: "member",
              },
            ],
          },
          issuedAt: NOW,
          expiresAt: NOW + 30 * 86_400,
        },
      ],
      memberships: [
        {
          chat_id: CHAT_ID,
          community_name: "Nervos Network",
          community_type: "supergroup",
          member_role: "member",
        },
      ],
    });
    const request = deps.fetch.mock.calls[0];
    expect(String(request[0])).toBe("https://oauth.telegram.org/token");
    expect(request[1]?.headers).toMatchObject({
      authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${ENVIRONMENT.TELEGRAM_CLIENT_SECRET}`).toString("base64")}`,
    });
    const body = new URLSearchParams(String(request[1]?.body));
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code_verifier")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(JSON.stringify(verified)).not.toContain("telegram-access-token");
    expect(JSON.stringify(verified)).not.toContain("signed-telegram-id-token");
    expect(deps.fetch).toHaveBeenCalledTimes(3);
    const botRequests = deps.fetch.mock.calls.slice(1);
    expect(botRequests.every(([input]) => String(input).includes("/getChatMember"))).toBe(true);
    expect(new URLSearchParams(String(botRequests[1][1]?.body)).get("user_id")).toBe(ACCOUNT_ID);
  });

  test("supports accounts without a public username", async () => {
    const verified = await verifyTelegramAuthorization(
      "one-time-code",
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      telegramOAuthConfig(ENVIRONMENT),
      dependencies({ sub: OIDC_SUBJECT, id: Number(ACCOUNT_ID), name: "Private Builder" }),
    );

    expect(verified.account).toEqual({
      id: ACCOUNT_ID,
      displayName: "Private Builder",
    });
    expect(verified.claims[0].payload).toEqual({
      user_id: ACCOUNT_ID,
      display_name: "Private Builder",
      verified_at: NOW,
    });
  });

  test("accepts a canonical string user ID from Telegram OIDC", async () => {
    const verified = await verifyTelegramAuthorization(
      "one-time-code",
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      telegramOAuthConfig(ENVIRONMENT),
      dependencies({ sub: OIDC_SUBJECT, id: ACCOUNT_ID, name: "Vellum Builder" }),
    );

    expect(verified.account.id).toBe(ACCOUNT_ID);
    expect(verified.memberships).toHaveLength(1);
  });

  test("issues only identity evidence when the user is not in a trusted community", async () => {
    const verified = await verifyTelegramAuthorization(
      "one-time-code",
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      telegramOAuthConfig(ENVIRONMENT),
      dependencies(undefined, "left"),
    );

    expect(verified.memberships).toEqual([]);
    expect(verified.claims).toHaveLength(1);
    expect(verified.claims[0].schema.id).toBe("vellum.social.telegram.v1");
  });

  test("fails closed when the Vellum bot is not a community administrator", async () => {
    await expect(
      verifyTelegramAuthorization(
        "one-time-code",
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        telegramOAuthConfig(ENVIRONMENT),
        dependencies(undefined, "member", "member"),
      ),
    ).rejects.toMatchObject({ code: "oauth_configuration_error", status: 503 });
  });

  test("fails closed when Telegram cannot return a trusted community member", async () => {
    const deps = dependencies();
    deps.fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input) === "https://oauth.telegram.org/token") return tokenResponse();
      const userId = new URLSearchParams(String(init?.body)).get("user_id");
      if (userId === BOT_USER_ID) {
        return Response.json({
          ok: true,
          result: { status: "administrator", user: { id: Number(BOT_USER_ID) } },
        });
      }
      return Response.json(
        { ok: false, error_code: 400, description: "Bad Request: user not found" },
        { status: 400 },
      );
    });

    await expect(
      verifyTelegramAuthorization(
        "one-time-code",
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        telegramOAuthConfig(ENVIRONMENT),
        deps,
      ),
    ).rejects.toMatchObject({ code: "provider_unavailable", status: 502 });
  });

  test("retries Telegram's transient participant lookup failure", async () => {
    const deps = dependencies();
    let memberAttempts = 0;
    deps.fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input) === "https://oauth.telegram.org/token") return tokenResponse();
      const userId = new URLSearchParams(String(init?.body)).get("user_id");
      if (userId === BOT_USER_ID) {
        return Response.json({
          ok: true,
          result: { status: "administrator", user: { id: Number(BOT_USER_ID) } },
        });
      }
      memberAttempts += 1;
      if (memberAttempts < 3) {
        return Response.json(
          { ok: false, error_code: 400, description: "Bad Request: PARTICIPANT_ID_INVALID" },
          { status: 400 },
        );
      }
      return Response.json({
        ok: true,
        result: { status: "member", user: { id: ACCOUNT_ID } },
      });
    });

    const verified = await verifyTelegramAuthorization(
      "one-time-code",
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      telegramOAuthConfig(ENVIRONMENT),
      deps,
    );

    expect(verified.memberships).toHaveLength(1);
    expect(memberAttempts).toBe(3);
    expect(deps.sleep).toHaveBeenCalledTimes(2);
  });

  test("rejects malformed tokens, account data, and provider failures", async () => {
    const config = telegramOAuthConfig(ENVIRONMENT);
    await expect(
      verifyTelegramAuthorization(
        "one-time-code",
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        config,
        dependencies({ sub: "not-a-telegram-id", id: Number(ACCOUNT_ID), name: "Builder" }),
      ),
    ).rejects.toMatchObject({ code: "provider_unavailable" });
    await expect(
      verifyTelegramAuthorization(
        "one-time-code",
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        config,
        dependencies({ sub: OIDC_SUBJECT, name: "Builder" }),
      ),
    ).rejects.toMatchObject({ code: "provider_unavailable" });

    const invalidToken = dependencies();
    invalidToken.verifyIdToken = mock(async () => {
      throw new Error("invalid signature");
    });
    await expect(
      verifyTelegramAuthorization(
        "one-time-code",
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        config,
        invalidToken,
      ),
    ).rejects.toBeInstanceOf(TelegramOAuthError);

    const limited = dependencies();
    limited.fetch = mock(async () =>
      Response.json(
        { error: "too_many_requests", retry_after: 17 },
        { status: 429, headers: { "retry-after": "12" } },
      ),
    );
    await expect(
      verifyTelegramAuthorization(
        "one-time-code",
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        config,
        limited,
      ),
    ).rejects.toMatchObject({
      code: "provider_rate_limited",
      status: 429,
      retryAt: NOW + 17,
    });

    const malformed = dependencies();
    malformed.fetch = mock(async () => tokenResponse({ token_type: "mac" }));
    await expect(
      verifyTelegramAuthorization(
        "one-time-code",
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        config,
        malformed,
      ),
    ).rejects.toMatchObject({ code: "provider_unavailable" });
  });
});
