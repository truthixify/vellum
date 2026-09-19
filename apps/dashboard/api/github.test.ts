import { expect, test } from "bun:test";

import githubHandler from "./github";

const ENVIRONMENT = {
  GITHUB_CLIENT_ID: "github-client-id",
  GITHUB_CLIENT_SECRET: "github-client-secret-with-enough-bytes",
  GITHUB_OAUTH_CALLBACK_URL: "https://dashboard.usevellum.xyz/api/verify/github/callback",
  VELLUM_OAUTH_STATE_SECRET: "oauth-state-secret-with-at-least-32-bytes",
} as const;

test("GitHub API entry ignores the Vercel runtime context", async () => {
  const previous = Object.fromEntries(
    Object.keys(ENVIRONMENT).map((name) => [name, process.env[name]]),
  );
  Object.assign(process.env, ENVIRONMENT);

  try {
    const request = new Request("https://dashboard.usevellum.xyz/api/verify/github/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        version: "1",
        subject: { did: "did:ckb:hlvxrdt3e7iwvuxdmbvejp6hc4yoo3no" },
      }),
    });
    const response = await Reflect.apply(githubHandler.fetch, githubHandler, [
      request,
      { waitUntil: () => undefined },
    ]);

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("vellum_github_oauth=");
    expect(await response.json()).toMatchObject({ ok: true, platform: "github", version: "1" });
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});
