import { describe, expect, mock, test } from "bun:test";

import type { ClaimIssuanceResult } from "./contracts";
import {
  discordActionFromUrl,
  handleDiscordOAuthRequest,
  type DiscordClaimIssuer,
} from "./discord-http";
import type { DiscordOAuthEnvironment } from "./discord";

const SUBJECT_DID = "did:ckb:fn7u37m7vwerr4ojysgdwwp4mescjtrp";
const NOW = 1_800_000_000;
const USER_ID = "80351110224678912";
const GUILD_ID = "111111111111111111";
const ROLE_ID = "222222222222222222";
const TRANSACTION_HASH = `0x${"11".repeat(32)}`;
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
  ]),
  VELLUM_OAUTH_STATE_SECRET: "state-secret-for-tests-only".repeat(2),
} satisfies DiscordOAuthEnvironment;

const ISSUANCE: ClaimIssuanceResult[] = [
  {
    status: "submitted",
    network: "ckb_testnet",
    payer: "issuer",
    transactionHash: TRANSACTION_HASH,
    claimId: `0x${"22".repeat(32)}`,
    outputIndex: 1,
  },
  {
    status: "submitted",
    network: "ckb_testnet",
    payer: "issuer",
    transactionHash: TRANSACTION_HASH,
    claimId: `0x${"33".repeat(32)}`,
    outputIndex: 2,
  },
];

function providerFetch() {
  const responses = [
    Response.json({
      access_token: "discord-provider-token-for-tests-only",
      token_type: "Bearer",
      expires_in: 604_800,
      refresh_token: "discord-refresh-token-for-tests-only",
      scope: "identify guilds.members.read",
    }),
    Response.json({ id: USER_ID, username: "truthixify" }),
    Response.json({ joined_at: "2023-11-14T22:13:20.000Z", roles: [ROLE_ID] }),
    new Response(null, { status: 200 }),
  ];
  return mock(async (_input: string | URL | Request, _init?: RequestInit) => {
    const response = responses.shift();
    if (!response) throw new Error("Unexpected provider request");
    return response;
  });
}

function dependencies(fetch = providerFetch()) {
  return {
    environment: ENVIRONMENT,
    fetch,
    issueClaims: mock(
      async (
        _subject: Parameters<DiscordClaimIssuer>[0],
        _claims: Parameters<DiscordClaimIssuer>[1],
      ) => ISSUANCE,
    ),
    nonceBytes: () => Uint8Array.from({ length: 32 }, (_, index) => index),
    now: () => NOW,
  };
}

async function start(deps = dependencies()) {
  const response = await handleDiscordOAuthRequest(
    new Request("https://dashboard.usevellum.xyz/api/verify/discord/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ version: "1", subject: { did: SUBJECT_DID } }),
    }),
    deps,
  );
  const body = (await response.json()) as { authorizationUrl: string };
  return { response, body, deps };
}

describe("Discord OAuth HTTP boundary", () => {
  test("starts a short-lived, cookie-bound authorization request", async () => {
    const { response, body } = await start();
    const authorization = new URL(body.authorizationUrl);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("set-cookie")).toContain("vellum_discord_oauth=");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=300");
    expect(authorization.searchParams.get("scope")).toBe("guilds.members.read identify");
    expect(authorization.searchParams.get("state")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(authorization.searchParams.has("code_challenge")).toBe(false);
  });

  test("issues separate identity and community outputs in one transaction", async () => {
    const deps = dependencies();
    const started = await start(deps);
    const state = new URL(started.body.authorizationUrl).searchParams.get("state");
    const cookie = started.response.headers.get("set-cookie")?.split(";", 1)[0];
    const callback = new URL(ENVIRONMENT.DISCORD_OAUTH_CALLBACK_URL);
    callback.searchParams.set("code", "one-time-code");
    callback.searchParams.set("state", state ?? "");

    const response = await handleDiscordOAuthRequest(
      new Request(callback, { headers: { cookie: cookie ?? "" } }),
      deps,
    );
    const location = new URL(response.headers.get("location") ?? "");

    expect(response.status).toBe(303);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(location.pathname).toBe("/verify/discord");
    expect(location.searchParams.get("status")).toBe("submitted");
    expect(location.searchParams.get("subject")).toBe(SUBJECT_DID);
    expect(location.searchParams.get("transaction")).toBe(TRANSACTION_HASH);
    expect(location.searchParams.get("claim")).toBe(ISSUANCE[0].claimId);
    expect(location.searchParams.get("communityClaim")).toBe(ISSUANCE[1].claimId);
    expect(location.searchParams.get("communities")).toBe("1");
    expect(location.searchParams.get("username")).toBe("truthixify");
    expect(deps.issueClaims).toHaveBeenCalledTimes(1);
    expect(deps.issueClaims.mock.calls[0][0]).toEqual({ did: SUBJECT_DID });
    expect(deps.issueClaims.mock.calls[0][1]).toHaveLength(2);
  });

  test("validates state before provider access", async () => {
    const fetch = providerFetch();
    const deps = dependencies(fetch);
    const started = await start(deps);
    const state = new URL(started.body.authorizationUrl).searchParams.get("state");
    const callback = new URL(ENVIRONMENT.DISCORD_OAUTH_CALLBACK_URL);
    callback.searchParams.set("code", "one-time-code");
    callback.searchParams.set("state", state ?? "");

    const response = await handleDiscordOAuthRequest(new Request(callback), deps);
    const location = new URL(response.headers.get("location") ?? "");

    expect(location.searchParams.get("code")).toBe("oauth_state_invalid");
    expect(fetch).not.toHaveBeenCalled();
    expect(deps.issueClaims).not.toHaveBeenCalled();
  });

  test("rejects inconsistent batch issuance references", async () => {
    const deps = dependencies();
    deps.issueClaims = mock(async () => [ISSUANCE[0], { ...ISSUANCE[1], outputIndex: 1 }]);
    const started = await start(deps);
    const state = new URL(started.body.authorizationUrl).searchParams.get("state");
    const cookie = started.response.headers.get("set-cookie")?.split(";", 1)[0];
    const callback = new URL(ENVIRONMENT.DISCORD_OAUTH_CALLBACK_URL);
    callback.searchParams.set("code", "one-time-code");
    callback.searchParams.set("state", state ?? "");

    const response = await handleDiscordOAuthRequest(
      new Request(callback, { headers: { cookie: cookie ?? "" } }),
      deps,
    );

    expect(new URL(response.headers.get("location") ?? "").searchParams.get("code")).toBe(
      "issuance_failed",
    );
  });

  test("returns deterministic method, input, configuration, and route errors", async () => {
    const deps = dependencies();
    const wrongMethod = await handleDiscordOAuthRequest(
      new Request("https://dashboard.usevellum.xyz/api/verify/discord/start"),
      deps,
    );
    expect(wrongMethod.status).toBe(405);
    expect(wrongMethod.headers.get("allow")).toBe("POST");

    const invalid = await handleDiscordOAuthRequest(
      new Request("https://dashboard.usevellum.xyz/api/verify/discord/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ version: "1", subject: { did: "not-a-did" } }),
      }),
      deps,
    );
    expect(invalid.status).toBe(400);

    const unavailable = await handleDiscordOAuthRequest(
      new Request("https://dashboard.usevellum.xyz/api/verify/discord/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ version: "1", subject: { did: SUBJECT_DID } }),
      }),
      { ...deps, environment: {} },
    );
    expect(unavailable.status).toBe(503);

    expect(
      discordActionFromUrl(
        new Request("https://dashboard.usevellum.xyz/api/verify/discord/start/extra"),
      ),
    ).toBeUndefined();
    expect(
      discordActionFromUrl(
        new Request("https://dashboard.usevellum.xyz/api/discord?action=start&action=callback"),
      ),
    ).toBeUndefined();
  });
});
