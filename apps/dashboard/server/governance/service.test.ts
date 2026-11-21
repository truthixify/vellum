import { describe, expect, test } from "bun:test";

import {
  GOVERNANCE_PROPOSAL,
  type GovernanceChallenge,
  type GovernanceEvaluation,
} from "../../src/lib/governance-contracts";
import { GovernanceStorageUnavailableError, MemoryGovernanceLedger } from "./ledger";
import { createGovernanceService, type GovernanceServiceDependencies } from "./service";

const DID = "did:ckb:4kiidiczwthgxj7dltzkzopgbwu3v6jc";
const NOW = 1_800_000_000;
const PROOF = {
  challenge: "challenge",
  signature: { signature: "signature", identity: "identity", signType: "CkbSecp256k1" as const },
};

function evaluation(status: "eligible" | "ineligible" = "eligible"): GovernanceEvaluation {
  return {
    status,
    network: "ckb_testnet",
    subjectDid: DID,
    evaluatedAt: NOW,
    eligibilityPolicyVersion: GOVERNANCE_PROPOSAL.eligibilityPolicy.version,
    reputation: { policyVersion: "vellum.reputation.v7", score: 500, maximum: 1_000 },
    participationWeight: status === "eligible" ? 3 : null,
    evidence:
      status === "eligible"
        ? [
            {
              claimId: `0x${"11".repeat(32)}`,
              transactionHash: `0x${"22".repeat(32)}`,
              outputIndex: 0,
              issuerDid: GOVERNANCE_PROPOSAL.eligibilityPolicy.issuerDid,
              schemaHash: GOVERNANCE_PROPOSAL.eligibilityPolicy.schemaHash,
              issuedAt: NOW - 100,
            },
          ]
        : [],
  };
}

function request(choice: "yes" | "no" = "yes") {
  return {
    version: "1" as const,
    proposalId: GOVERNANCE_PROPOSAL.id,
    choice,
    subject: { did: DID },
    proof: PROOF,
  };
}

function dependencies(
  overrides: Partial<GovernanceServiceDependencies> = {},
): GovernanceServiceDependencies {
  const ledger = new MemoryGovernanceLedger();
  return {
    now: () => NOW,
    ledger: () => ledger,
    evaluateSubject: async () => evaluation(),
    createChallenge: async (): Promise<GovernanceChallenge> => ({
      challenge: "challenge",
      message: "message",
      expiresAt: NOW + 300,
    }),
    verifyProof: async () => ({
      controllerLockHash: `0x${"33".repeat(32)}`,
      nonce: "nonce",
      expiresAt: NOW + 300,
    }),
    ...overrides,
  };
}

describe("governance service", () => {
  test("publishes the fixed proposal even when results storage is unavailable", async () => {
    const service = createGovernanceService(
      {},
      dependencies({
        ledger: () => {
          throw new Error();
        },
      }),
    );
    await expect(service.proposal()).resolves.toMatchObject({
      proposal: { id: GOVERNANCE_PROPOSAL.id },
      proposalStatus: "open",
      results: {
        status: "unavailable",
        message: "The current tally could not be loaded. Retry to check the latest result.",
      },
    });
  });

  test("revalidates eligibility, records weight once, and returns a receipt", async () => {
    let evaluations = 0;
    const deps = dependencies({
      evaluateSubject: async () => {
        evaluations += 1;
        return evaluation();
      },
    });
    const service = createGovernanceService({}, deps);
    const first = await service.vote(request());
    const duplicate = await service.vote(request());

    expect(first).toMatchObject({
      recordStatus: "recorded",
      receipt: { subjectDid: DID, choice: "yes", participationWeight: 3 },
      results: { status: "available", results: { voterCount: 1, totalWeight: 3 } },
    });
    expect(duplicate).toMatchObject({
      recordStatus: "duplicate",
      receipt: { receiptId: first.receipt.receiptId },
    });
    expect(evaluations).toBe(1);
    await expect(service.receipt(first.receipt.receiptId)).resolves.toEqual(first.receipt);
  });

  test("reports whether an identity already has an immutable vote", async () => {
    const service = createGovernanceService({}, dependencies());

    await expect(service.voteStatus(DID)).resolves.toEqual({ status: "not_recorded" });
    const recorded = await service.vote(request());
    await expect(service.voteStatus(DID)).resolves.toEqual({
      status: "recorded",
      receipt: recorded.receipt,
    });
    await expect(service.voteStatus("did:ckb:not-canonical")).rejects.toMatchObject({
      code: "invalid_request",
    });
  });

  test("fails closed when prior participation cannot be checked", async () => {
    const service = createGovernanceService(
      {},
      dependencies({
        ledger: () => {
          throw new GovernanceStorageUnavailableError();
        },
      }),
    );

    await expect(service.voteStatus(DID)).rejects.toMatchObject({
      code: "service_unavailable",
    });
  });

  test("rejects ineligible identities and conflicting second choices", async () => {
    const ineligible = createGovernanceService(
      {},
      dependencies({ evaluateSubject: async () => evaluation("ineligible") }),
    );
    await expect(ineligible.vote(request())).rejects.toMatchObject({ code: "ineligible" });

    const service = createGovernanceService({}, dependencies());
    await service.vote(request("yes"));
    await expect(service.vote(request("no"))).rejects.toMatchObject({ code: "already_voted" });
  });

  test("enforces proposal identity and closing time before authorization", async () => {
    const closed = createGovernanceService(
      {},
      dependencies({ now: () => GOVERNANCE_PROPOSAL.closesAt }),
    );
    await expect(
      closed.challenge({ ...request(), proof: undefined } as never),
    ).rejects.toMatchObject({
      code: "proposal_not_open",
    });
    await expect(closed.vote(request())).rejects.toMatchObject({ code: "proposal_not_open" });

    const service = createGovernanceService({}, dependencies());
    await expect(
      service.challenge({
        version: "1",
        proposalId: "unknown",
        choice: "yes",
        subject: { did: DID },
      }),
    ).rejects.toMatchObject({ code: "invalid_request" });
  });

  test("rechecks challenge expiry before recording after evaluation", async () => {
    const timestamps = [NOW, NOW + 300];
    const deps = dependencies({
      now: () => timestamps.shift() ?? NOW + 300,
      verifyProof: async () => ({
        controllerLockHash: `0x${"33".repeat(32)}`,
        nonce: "nonce",
        expiresAt: NOW + 300,
      }),
    });
    const service = createGovernanceService({}, deps);

    await expect(service.vote(request())).rejects.toMatchObject({ code: "challenge_invalid" });
    await expect(deps.ledger().getResults(GOVERNANCE_PROPOSAL.id)).resolves.toMatchObject({
      voterCount: 0,
      totalWeight: 0,
    });
  });
});
