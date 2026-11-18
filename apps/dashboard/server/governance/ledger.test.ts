import { describe, expect, mock, test } from "bun:test";

import {
  GOVERNANCE_API_VERSION,
  GOVERNANCE_NETWORK,
  GOVERNANCE_PROPOSAL,
  type GovernanceChoice,
  type GovernanceVoteReceipt,
} from "../../src/lib/governance-contracts";
import {
  governanceReceiptId,
  GovernanceStorageUnavailableError,
  MemoryGovernanceLedger,
  RedisGovernanceLedger,
} from "./ledger";

const DID = "did:ckb:4kiidiczwthgxj7dltzkzopgbwu3v6jc";
const OTHER_DID = "did:ckb:lzvdgadum4cnatdhs2xzqkm6m7zyqlib";
const NOW = 1_800_000_000;

function receipt(subjectDid = DID, choice: GovernanceChoice = "yes"): GovernanceVoteReceipt {
  return {
    version: GOVERNANCE_API_VERSION,
    receiptId: governanceReceiptId(GOVERNANCE_PROPOSAL.id, subjectDid),
    network: GOVERNANCE_NETWORK,
    proposalId: GOVERNANCE_PROPOSAL.id,
    subjectDid,
    choice,
    participationWeight: 3,
    eligibilityPolicyVersion: GOVERNANCE_PROPOSAL.eligibilityPolicy.version,
    reputation: { policyVersion: "vellum.reputation.v7", score: 500, maximum: 1_000 },
    evaluatedAt: NOW,
    recordedAt: NOW,
    controllerLockHash: `0x${"11".repeat(32)}`,
    evidence: [
      {
        claimId: `0x${"22".repeat(32)}`,
        transactionHash: `0x${"33".repeat(32)}`,
        outputIndex: 0,
        issuerDid: GOVERNANCE_PROPOSAL.eligibilityPolicy.issuerDid,
        schemaHash: GOVERNANCE_PROPOSAL.eligibilityPolicy.schemaHash,
        issuedAt: NOW - 100,
      },
    ],
  };
}

describe("governance ledger", () => {
  test("records one durable vote and returns the same receipt for duplicates", async () => {
    const ledger = new MemoryGovernanceLedger();
    const first = await ledger.recordVote(receipt(), "first-nonce", NOW + 300, NOW);
    const duplicate = await ledger.recordVote(receipt(DID, "no"), "second-nonce", NOW + 300, NOW);

    expect(first).toMatchObject({ status: "recorded" });
    expect(duplicate).toEqual({ status: "existing", receipt: receipt() });
    await expect(ledger.getVote(GOVERNANCE_PROPOSAL.id, DID)).resolves.toEqual(receipt());
    await expect(ledger.getReceipt(receipt().receiptId)).resolves.toEqual(receipt());
    await expect(ledger.getResults(GOVERNANCE_PROPOSAL.id)).resolves.toEqual({
      voterCount: 1,
      totalWeight: 3,
      tallies: [
        { choice: "yes", voterCount: 1, weight: 3 },
        { choice: "no", voterCount: 0, weight: 0 },
      ],
    });
  });

  test("allows only one concurrent first vote per DID", async () => {
    const ledger = new MemoryGovernanceLedger();
    const [yes, no] = await Promise.all([
      ledger.recordVote(receipt(DID, "yes"), "yes-nonce", NOW + 300, NOW),
      ledger.recordVote(receipt(DID, "no"), "no-nonce", NOW + 300, NOW),
    ]);
    expect([yes.status, no.status].sort()).toEqual(["existing", "recorded"]);
    const results = await ledger.getResults(GOVERNANCE_PROPOSAL.id);
    expect(results.voterCount).toBe(1);
    expect(results.totalWeight).toBe(3);
  });

  test("consumes a challenge nonce once across subjects", async () => {
    const ledger = new MemoryGovernanceLedger();
    await expect(
      ledger.recordVote(receipt(), "shared-nonce", NOW + 300, NOW),
    ).resolves.toMatchObject({ status: "recorded" });
    await expect(
      ledger.recordVote(receipt(OTHER_DID), "shared-nonce", NOW + 300, NOW),
    ).resolves.toEqual({ status: "challenge-replayed" });
  });

  test("uses one Redis script for challenge consumption, receipt, vote, and tallies", async () => {
    const fetch = mock(async (_input: string | URL | Request, init?: RequestInit) => {
      const command = JSON.parse(String(init?.body)) as unknown[];
      return Response.json({ result: [1, command[7]] });
    });
    const ledger = new RedisGovernanceLedger(
      {
        UPSTASH_REDIS_REST_TOKEN: "test-token",
        UPSTASH_REDIS_REST_URL: "https://redis.example.test",
      },
      fetch,
    );
    await expect(
      ledger.recordVote(receipt(), "private-nonce", NOW + 300, NOW),
    ).resolves.toMatchObject({ status: "recorded" });
    const command = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body)) as unknown[];
    expect(command.slice(0, 3)).toEqual(["EVAL", expect.any(String), 4]);
    expect(String(command[3])).not.toContain(DID);
    expect(String(command[5])).not.toContain("private-nonce");
    expect(String(command[7])).toContain(`"subjectDid":"${DID}"`);
  });

  test("fails closed for missing configuration and malformed storage data", async () => {
    expect(() => new RedisGovernanceLedger({})).toThrow(GovernanceStorageUnavailableError);
    const ledger = new RedisGovernanceLedger(
      {
        UPSTASH_REDIS_REST_TOKEN: "test-token",
        UPSTASH_REDIS_REST_URL: "https://redis.example.test",
      },
      async () => Response.json({ result: "not-json" }),
    );
    await expect(ledger.getReceipt(receipt().receiptId)).rejects.toBeInstanceOf(
      GovernanceStorageUnavailableError,
    );
  });
});
