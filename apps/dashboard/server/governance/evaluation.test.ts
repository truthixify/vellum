import { describe, expect, test } from "bun:test";
import { ccc } from "@ckb-ccc/core";
import { didToArgs } from "@ckb-ccc/did-ckb";
import type { Claim, ReadClaimsProps, ReadClaimsResult } from "@usevellum/sdk";

import { GOVERNANCE_PROPOSAL } from "../../src/lib/governance-contracts";
import {
  evaluateGovernanceSubject,
  GovernanceEvaluationUnavailableError,
  GovernanceSubjectNotFoundError,
  InvalidGovernanceSubjectError,
  type GovernanceEvaluationDependencies,
} from "./evaluation";

const SUBJECT_DID = "did:ckb:4kiidiczwthgxj7dltzkzopgbwu3v6jc";
const NOW = 1_800_000_000;
const CLIENT = {} as ccc.Client;

function hex(byte: string): ccc.Hex {
  return `0x${byte.repeat(64)}` as ccc.Hex;
}

function githubClaim(overrides: Partial<Claim> = {}): Claim {
  const lock = ccc.Script.from({
    codeHash: hex("1"),
    hashType: "type",
    args: `0x${"22".repeat(20)}`,
  });
  return {
    version: "v1",
    claimId: hex("3"),
    issuerDid: GOVERNANCE_PROPOSAL.eligibilityPolicy.issuerDid,
    issuerId: ccc.hexFrom(didToArgs(GOVERNANCE_PROPOSAL.eligibilityPolicy.issuerDid)),
    issuerType: lock,
    issuerState: { status: "active", cell: {} as ccc.Cell, controller: lock },
    subjectLock: lock,
    subjectLockHash: lock.hash(),
    schemaHash: GOVERNANCE_PROPOSAL.eligibilityPolicy.schemaHash,
    nonce: hex("5"),
    issuedAt: 1_700_000_000n,
    payload: {},
    payloadBytes: "0xa0",
    cell: ccc.Cell.from({
      outPoint: { txHash: hex("6"), index: 2 },
      cellOutput: { capacity: 20_000_000_000n, lock },
      outputData: "0x",
    }),
    duplicateCells: [],
    verification: {
      inclusion: "live",
      issuerAuthorization: "accepted-by-configured-claim-type",
      time: { status: "active", evaluatedAt: BigInt(NOW) },
    },
    ...overrides,
  };
}

function dependencies(
  overrides: Partial<GovernanceEvaluationDependencies> = {},
): GovernanceEvaluationDependencies {
  return {
    createClient: () => CLIENT,
    now: () => NOW,
    resolveDid: async () => ({}) as never,
    readClaims: async () => ({ claims: [], invalid: [] }),
    scoreClaims: () => ({
      status: "available",
      policyVersion: "vellum.reputation.v7",
      evaluatedAt: NOW,
      overall: { score: 500, maximum: 1_000 },
      categories: [],
      evidence: [],
      excludedEvidence: [],
    }),
    ...overrides,
  };
}

describe("governance evaluation", () => {
  test("uses exact gate and complete scoring reads at one checkpoint", async () => {
    const calls: ReadClaimsProps[] = [];
    const claim = githubClaim();
    const result = await evaluateGovernanceSubject(
      SUBJECT_DID,
      { CKB_RPC_URL: "https://rpc.example.test" },
      dependencies({
        readClaims: async (props) => {
          calls.push(props);
          return props.filter.schemaHash
            ? { claims: [claim], invalid: [] }
            : { claims: [], invalid: [] };
        },
      }),
    );

    expect(calls).toHaveLength(2);
    expect(calls[0]?.filter).toMatchObject({
      subject: { did: SUBJECT_DID },
      issuerDid: GOVERNANCE_PROPOSAL.eligibilityPolicy.issuerDid,
      schemaHash: GOVERNANCE_PROPOSAL.eligibilityPolicy.schemaHash,
      evaluationTime: NOW,
    });
    expect(calls[1]?.filter).toEqual({
      subject: { did: SUBJECT_DID },
      evaluationTime: NOW,
      order: "asc",
    });
    expect(result).toMatchObject({
      status: "eligible",
      subjectDid: SUBJECT_DID,
      participationWeight: 3,
      reputation: { score: 500, maximum: 1_000 },
      evidence: [
        { claimId: claim.claimId, transactionHash: claim.cell.outPoint.txHash, outputIndex: 2 },
      ],
    });
  });

  test("returns a negative decision only from a complete valid read", async () => {
    await expect(evaluateGovernanceSubject(SUBJECT_DID, {}, dependencies())).resolves.toMatchObject(
      {
        status: "ineligible",
        participationWeight: null,
        evidence: [],
      },
    );
  });

  test("lets valid evidence take precedence over an extra malformed filtered cell", async () => {
    const invalidEvidence = githubClaim({
      claimId: hex("7"),
      issuedAt: BigInt(NOW + 1),
    });
    const result = await evaluateGovernanceSubject(
      SUBJECT_DID,
      {},
      dependencies({
        readClaims: async (props): Promise<ReadClaimsResult> =>
          props.filter.schemaHash
            ? {
                claims: [githubClaim(), invalidEvidence],
                invalid: [{} as ReadClaimsResult["invalid"][number]],
              }
            : { claims: [], invalid: [] },
      }),
    );
    expect(result.status).toBe("eligible");
    expect(result.evidence).toHaveLength(1);
    expect(result.evidence[0]?.claimId).not.toBe(invalidEvidence.claimId);
  });

  test("records only the newest accepted gate claim as receipt evidence", async () => {
    const olderClaim = githubClaim({ claimId: hex("8"), issuedAt: BigInt(NOW - 2) });
    const newerClaim = githubClaim({ claimId: hex("9"), issuedAt: BigInt(NOW - 1) });
    const result = await evaluateGovernanceSubject(
      SUBJECT_DID,
      {},
      dependencies({
        readClaims: async (props) =>
          props.filter.schemaHash
            ? { claims: [olderClaim, newerClaim], invalid: [] }
            : { claims: [], invalid: [] },
      }),
    );

    expect(result.evidence).toHaveLength(1);
    expect(result.evidence[0]?.claimId).toBe(newerClaim.claimId);
  });

  test("fails closed for incomplete gate, score, or identity state", async () => {
    const invalidGate = dependencies({
      readClaims: async (props) =>
        props.filter.schemaHash
          ? { claims: [], invalid: [{} as ReadClaimsResult["invalid"][number]] }
          : { claims: [], invalid: [] },
    });
    const unavailableIssuer = dependencies({
      readClaims: async (props) =>
        props.filter.schemaHash
          ? {
              claims: [githubClaim({ issuerState: { status: "unavailable", reason: "timeout" } })],
              invalid: [],
            }
          : { claims: [], invalid: [] },
    });
    const unavailableScore = dependencies({
      scoreClaims: () => ({
        status: "unavailable",
        policyVersion: "vellum.reputation.v7",
        evaluatedAt: NOW,
        error: { code: "claim-read-unavailable", message: "unavailable" },
      }),
    });

    for (const candidate of [invalidGate, unavailableIssuer, unavailableScore]) {
      await expect(evaluateGovernanceSubject(SUBJECT_DID, {}, candidate)).rejects.toBeInstanceOf(
        GovernanceEvaluationUnavailableError,
      );
    }
    await expect(
      evaluateGovernanceSubject(
        SUBJECT_DID,
        {},
        dependencies({ resolveDid: async () => undefined }),
      ),
    ).rejects.toBeInstanceOf(GovernanceSubjectNotFoundError);
  });

  test("rejects non-canonical subjects before reading chain state", async () => {
    await expect(
      evaluateGovernanceSubject("did:ckb:not-canonical", {}, dependencies()),
    ).rejects.toBeInstanceOf(InvalidGovernanceSubjectError);
  });
});
