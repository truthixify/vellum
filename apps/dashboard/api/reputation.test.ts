import { expect, test } from "bun:test";

import reputationHandler from "./reputation";

test("reputation API entry ignores the Vercel runtime context", async () => {
  const response = await Reflect.apply(reputationHandler.fetch, reputationHandler, [
    new Request("https://dashboard.usevellum.xyz/api/reputation", { method: "OPTIONS" }),
    { waitUntil: () => undefined },
  ]);

  expect(response.status).toBe(204);
  expect(response.headers.get("access-control-allow-origin")).toBe("*");
});
