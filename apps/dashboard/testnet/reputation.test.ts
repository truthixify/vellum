import { expect, test } from "bun:test";
import { ccc } from "@ckb-ccc/core";
import { resolveDidCkb } from "@ckb-ccc/did-ckb";
import { CKBOOST_VERIFIED_PARTNER } from "@vellum/scoring";

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
  expect(result.policyVersion).toBe("vellum.reputation.v7");
  expect(result.evidence).toContainEqual(
    expect.objectContaining({
      schemaId: "vellum.social.github.v1",
      account: expect.objectContaining({ platform: "github", handle: "truthixify" }),
    }),
  );
  expect(result.overall?.score).toBeGreaterThan(0);
}, 60_000);

test("resolves the verified CKBoost issuer and controller snapshot", async () => {
  const record = await resolveDidCkb({
    client: new ccc.ClientPublicTestnet(),
    did: CKBOOST_VERIFIED_PARTNER.issuerDid,
  });

  expect(record?.did).toBe(CKBOOST_VERIFIED_PARTNER.issuerDid);
  expect(record?.cell.outPoint.txHash).toBe(
    CKBOOST_VERIFIED_PARTNER.verificationSnapshot.didOutput.transactionHash,
  );
  expect(Number(record?.cell.outPoint.index)).toBe(
    CKBOOST_VERIFIED_PARTNER.verificationSnapshot.didOutput.outputIndex,
  );
  expect(record?.cell.cellOutput.lock).toMatchObject(
    CKBOOST_VERIFIED_PARTNER.verificationSnapshot.controllerLock,
  );
}, 60_000);
