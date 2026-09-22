import { expect, test } from "bun:test";

import telegramHandler from "./telegram";

const ENVIRONMENT = {
  TELEGRAM_CLIENT_ID: "123456789012345678",
  TELEGRAM_CLIENT_SECRET: "telegram-client-secret-with-enough-bytes",
  TELEGRAM_BOT_TOKEN: "987654321:telegram-bot-token-for-tests-only",
  TELEGRAM_OAUTH_CALLBACK_URL: "https://dashboard.usevellum.xyz/api/verify/telegram/callback",
  TELEGRAM_TRUSTED_COMMUNITIES: JSON.stringify([
    { chatId: "-1001111111111111", name: "Nervos Network", type: "supergroup" },
  ]),
  UPSTASH_REDIS_REST_TOKEN: "redis-token-for-tests",
  UPSTASH_REDIS_REST_URL: "https://redis.example.test",
  VELLUM_OAUTH_STATE_SECRET: "oauth-state-secret-with-at-least-32-bytes",
} as const;

test("Telegram API entry ignores the Vercel runtime context", async () => {
  const previous = Object.fromEntries(
    Object.keys(ENVIRONMENT).map((name) => [name, process.env[name]]),
  );
  Object.assign(process.env, ENVIRONMENT);

  try {
    const request = new Request("https://dashboard.usevellum.xyz/api/verify/telegram/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ version: "1", subject: { did: "not-a-did" } }),
    });
    const response = await Reflect.apply(telegramHandler.fetch, telegramHandler, [
      request,
      { waitUntil: () => undefined },
    ]);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: "invalid_request" },
      ok: false,
      version: "1",
    });
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});
