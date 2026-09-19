import { expect, test } from "bun:test";

import { handleReputationRequest } from "../server/reputation/http";

const LIVE_GITHUB_SUBJECT = "did:ckb:4kiidiczwthgxj7dltzkzopgbwu3v6jc";

test("scores a live Testnet GitHub claim without wallet state", async () => {
  const response = await handleReputationRequest(
    new Request(`https://dashboard.usevellum.xyz/api/reputation/${LIVE_GITHUB_SUBJECT}`),
  );
  const result = (await response.json()) as {
    status: "available" | "unavailable";
    policyVersion: string;
    overall?: { score: number };
    evidence?: Array<{ schemaId: string; account: { platform: string; handle: string } }>;
    error?: { message: string };
  };

  expect(response.status).toBe(200);
  expect(result.status).toBe("available");
  if (result.status !== "available") throw new Error(result.error?.message);
  expect(result.policyVersion).toBe("vellum.reputation.v1");
  expect(result.evidence).toHaveLength(1);
  expect(result.evidence?.[0]).toMatchObject({
    schemaId: "vellum.social.github.v1",
    account: { platform: "github", handle: "truthixify" },
  });
  expect(result.overall?.score).toBeGreaterThan(0);
}, 60_000);
