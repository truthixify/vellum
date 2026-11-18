import { expect, test } from "bun:test";

import governanceHandler from "../../api/governance";

test("governance API entry ignores the Vercel runtime context", async () => {
  const response = await Reflect.apply(governanceHandler.fetch, governanceHandler, [
    new Request("https://dashboard.usevellum.xyz/api/governance/proposal"),
    { waitUntil: () => undefined },
  ]);

  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ ok: true, network: "ckb_testnet" });
});
