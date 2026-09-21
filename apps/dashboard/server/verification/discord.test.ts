import { describe, expect, mock, test } from "bun:test";

import { DiscordOAuthError, OAuthConfigurationError } from "./errors";
import {
  discordAuthorizationUrl,
  discordOAuthConfig,
  parseTrustedDiscordCommunities,
  verifyDiscordAuthorization,
  type DiscordOAuthEnvironment,
} from "./discord";

const NOW = 1_800_000_000;
const ACCESS_TOKEN = "discord-provider-token-for-tests-only";
const USER_ID = "80351110224678912";
const GUILD_ID = "111111111111111111";
const OTHER_GUILD_ID = "444444444444444444";
const ROLE_ID = "222222222222222222";
const ENVIRONMENT = {
  DISCORD_CLIENT_ID: "123456789012345678",
  DISCORD_CLIENT_SECRET: "discord-client-secret-for-tests-only",
  DISCORD_OAUTH_CALLBACK_URL: "https://dashboard.usevellum.xyz/api/verify/discord/callback",
  DISCORD_TRUSTED_COMMUNITIES: JSON.stringify([
    {
      guildId: GUILD_ID,
      name: "Nervos Community",
      roles: [{ roleId: ROLE_ID, name: "Builder" }],
    },
    { guildId: OTHER_GUILD_ID, name: "CKB Dev", roles: [] },
  ]),
  VELLUM_OAUTH_STATE_SECRET: "state-secret-for-tests-only".repeat(2),
} satisfies DiscordOAuthEnvironment;

function sequence(...responses: Response[]) {
  return mock(async (_input: string | URL | Request, _init?: RequestInit) => {
    const response = responses.shift();
    if (!response) throw new Error("Unexpected provider request");
    return response;
  });
}

function tokenResponse(overrides: Record<string, unknown> = {}): Response {
  return Response.json({
    access_token: ACCESS_TOKEN,
    token_type: "Bearer",
    expires_in: 604_800,
    refresh_token: "discord-refresh-token-for-tests-only",
    scope: "identify guilds.members.read",
    ...overrides,
  });
}

function userResponse(overrides: Record<string, unknown> = {}): Response {
  return Response.json({ id: USER_ID, username: "truthixify", ...overrides });
}

function memberResponse(overrides: Record<string, unknown> = {}): Response {
  return Response.json({
    joined_at: "2023-11-14T22:13:20.000Z",
    roles: [ROLE_ID, "333333333333333333"],
    ...overrides,
  });
}

describe("Discord OAuth verifier", () => {
  test("validates configuration and requests only identity and member scopes", () => {
    const config = discordOAuthConfig(ENVIRONMENT);
    const url = new URL(discordAuthorizationUrl(config, "state-value"));

    expect(url.origin + url.pathname).toBe("https://discord.com/oauth2/authorize");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe("guilds.members.read identify");
    expect(url.searchParams.get("state")).toBe("state-value");
    expect(url.searchParams.get("redirect_uri")).toBe(ENVIRONMENT.DISCORD_OAUTH_CALLBACK_URL);
    expect(config.trustedCommunities).toHaveLength(2);
    expect(() => discordOAuthConfig({ ...ENVIRONMENT, DISCORD_CLIENT_SECRET: "short" })).toThrow(
      OAuthConfigurationError,
    );
  });

  test("sorts and validates the trusted community allowlist", () => {
    const parsed = parseTrustedDiscordCommunities(
      JSON.stringify([
        { guildId: OTHER_GUILD_ID, name: "CKB Dev", roles: [] },
        {
          guildId: GUILD_ID,
          name: "Nervos Community",
          roles: [
            { roleId: "333333333333333333", name: "Contributor" },
            { roleId: ROLE_ID, name: "Builder" },
          ],
        },
      ]),
    );

    expect(parsed.map(({ guildId }) => guildId)).toEqual([GUILD_ID, OTHER_GUILD_ID]);
    expect(parsed[0].roles.map(({ roleId }) => roleId)).toEqual([ROLE_ID, "333333333333333333"]);
    expect(() =>
      parseTrustedDiscordCommunities(
        JSON.stringify([
          { guildId: GUILD_ID, name: "Nervos", roles: [] },
          { guildId: GUILD_ID, name: "Duplicate", roles: [] },
        ]),
      ),
    ).toThrow(OAuthConfigurationError);
    expect(() => parseTrustedDiscordCommunities("[]")).toThrow(OAuthConfigurationError);
    expect(() => parseTrustedDiscordCommunities(undefined)).toThrow(OAuthConfigurationError);
  });

  test("returns separate identity and fresh CKB community claims, then revokes access", async () => {
    const fetch = sequence(
      tokenResponse(),
      userResponse(),
      memberResponse(),
      new Response(null, { status: 404 }),
      new Response(null, { status: 200 }),
    );
    const verified = await verifyDiscordAuthorization(
      "one-time-code",
      discordOAuthConfig(ENVIRONMENT),
      { fetch, now: () => NOW },
    );

    expect(verified.account).toEqual({ id: USER_ID, username: "truthixify" });
    expect(verified.memberships).toEqual([
      {
        guild_id: GUILD_ID,
        community_name: "Nervos Community",
        joined_at: 1_700_000_000,
        recognized_roles: [{ role_id: ROLE_ID, role_name: "Builder" }],
      },
    ]);
    expect(verified.claims).toEqual([
      {
        schema: {
          id: "vellum.social.discord.v1",
          hash: "0x1d0169167b6c34b7818ba6932974679f8fd5284e4d5d79319da12f7d79df8b69",
        },
        payload: {
          user_id: USER_ID,
          username: "truthixify",
          profile_url: `https://discord.com/users/${USER_ID}`,
          account_created_at: 1_439_227_597,
          verified_at: NOW,
        },
        issuedAt: NOW,
      },
      {
        schema: {
          id: "vellum.community.discord.v1",
          hash: "0x3cba5b1c2967fee27bbde52d5e609137aa0d2cccaf68e1d8722e9b943e78f550",
        },
        payload: {
          user_id: USER_ID,
          verified_at: NOW,
          memberships: verified.memberships,
        },
        issuedAt: NOW,
        expiresAt: NOW + 30 * 86_400,
      },
    ]);
    expect(fetch).toHaveBeenCalledTimes(5);
    expect(String(fetch.mock.calls[2][0])).toContain(`/guilds/${GUILD_ID}/member`);
    expect(String(fetch.mock.calls[4][0])).toBe("https://discord.com/api/oauth2/token/revoke");
    expect(String(fetch.mock.calls[4][1]?.body)).toContain(ACCESS_TOKEN);
    expect(JSON.stringify(verified)).not.toContain(ACCESS_TOKEN);
  });

  test("issues identity evidence without inventing community membership", async () => {
    const config = discordOAuthConfig(ENVIRONMENT);
    const fetch = sequence(
      tokenResponse(),
      userResponse(),
      new Response(null, { status: 404 }),
      new Response(null, { status: 404 }),
      new Response(null, { status: 200 }),
    );

    const verified = await verifyDiscordAuthorization("one-time-code", config, {
      fetch,
      now: () => NOW,
    });

    expect(verified.memberships).toEqual([]);
    expect(verified.claims).toHaveLength(1);
  });

  test("checks configured communities concurrently", async () => {
    let releaseFirst: ((response: Response) => void) | undefined;
    let call = 0;
    const fetch = mock(async (input: string | URL | Request) => {
      call += 1;
      if (call === 1) return tokenResponse();
      if (call === 2) return userResponse();
      const url = String(input);
      if (url.includes(`/guilds/${GUILD_ID}/member`)) {
        return new Promise<Response>((resolve) => {
          releaseFirst = resolve;
        });
      }
      if (url.includes(`/guilds/${OTHER_GUILD_ID}/member`)) {
        releaseFirst?.(memberResponse());
        return new Response(null, { status: 404 });
      }
      if (url.endsWith("/token/revoke")) return new Response(null, { status: 200 });
      throw new Error("Unexpected Discord request");
    });

    const verified = await verifyDiscordAuthorization(
      "one-time-code",
      discordOAuthConfig(ENVIRONMENT),
      { fetch, now: () => NOW },
    );

    expect(verified.memberships).toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(5);
  });

  test("rejects a membership timestamp before the Discord account existed", async () => {
    const fetch = sequence(
      tokenResponse(),
      userResponse(),
      memberResponse({ joined_at: "2014-01-01T00:00:00.000Z" }),
      new Response(null, { status: 404 }),
      new Response(null, { status: 200 }),
    );

    await expect(
      verifyDiscordAuthorization("one-time-code", discordOAuthConfig(ENVIRONMENT), {
        fetch,
        now: () => NOW,
      }),
    ).rejects.toMatchObject({ code: "provider_unavailable" });
    expect(fetch).toHaveBeenCalledTimes(5);
  });

  test("revokes access before rejecting unexpected scopes", async () => {
    const fetch = sequence(
      tokenResponse({ scope: "identify guilds.members.read email" }),
      new Response(null, { status: 200 }),
    );

    await expect(
      verifyDiscordAuthorization("one-time-code", discordOAuthConfig(ENVIRONMENT), {
        fetch,
        now: () => NOW,
      }),
    ).rejects.toMatchObject({ code: "provider_unavailable" });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(String(fetch.mock.calls[1][0])).toBe("https://discord.com/api/oauth2/token/revoke");
  });

  test("releases credentials after rate limits and fails closed if revocation fails", async () => {
    const limited = sequence(
      tokenResponse(),
      userResponse(),
      new Response(null, { status: 429, headers: { "retry-after": "2.5" } }),
      new Response(null, { status: 404 }),
      new Response(null, { status: 200 }),
    );
    try {
      await verifyDiscordAuthorization("one-time-code", discordOAuthConfig(ENVIRONMENT), {
        fetch: limited,
        now: () => NOW,
      });
      throw new Error("Expected verification to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(DiscordOAuthError);
      expect((error as DiscordOAuthError).code).toBe("provider_rate_limited");
      expect((error as DiscordOAuthError).retryAt).toBe(NOW + 3);
    }
    expect(limited).toHaveBeenCalledTimes(5);

    const revokeFailure = sequence(
      tokenResponse(),
      userResponse(),
      memberResponse(),
      new Response(null, { status: 404 }),
      new Response(null, { status: 500 }),
    );
    await expect(
      verifyDiscordAuthorization("one-time-code", discordOAuthConfig(ENVIRONMENT), {
        fetch: revokeFailure,
        now: () => NOW,
      }),
    ).rejects.toMatchObject({ code: "credential_revocation_failed" });
  });
});
