import { expect, test } from "bun:test";

import discordHandler from "./discord";

const ENVIRONMENT = {
  DISCORD_CLIENT_ID: "123456789012345678",
  DISCORD_CLIENT_SECRET: "discord-client-secret-with-enough-bytes",
  DISCORD_OAUTH_CALLBACK_URL: "https://dashboard.usevellum.xyz/api/verify/discord/callback",
  DISCORD_TRUSTED_COMMUNITIES: JSON.stringify([
    { guildId: "111111111111111111", name: "Nervos Community", roles: [] },
  ]),
  VELLUM_OAUTH_STATE_SECRET: "oauth-state-secret-with-at-least-32-bytes",
} as const;

test("Discord API entry ignores the Vercel runtime context", async () => {
  const previous = Object.fromEntries(
    Object.keys(ENVIRONMENT).map((name) => [name, process.env[name]]),
  );
  Object.assign(process.env, ENVIRONMENT);

  try {
    const request = new Request("https://dashboard.usevellum.xyz/api/verify/discord/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        version: "1",
        subject: { did: "did:ckb:hlvxrdt3e7iwvuxdmbvejp6hc4yoo3no" },
      }),
    });
    const response = await Reflect.apply(discordHandler.fetch, discordHandler, [
      request,
      { waitUntil: () => undefined },
    ]);

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("vellum_discord_oauth=");
    expect(await response.json()).toMatchObject({ ok: true, platform: "discord", version: "1" });
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});
