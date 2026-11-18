import { describe, expect, mock, test } from "bun:test";
import { ccc } from "@ckb-ccc/core";

import {
  GOVERNANCE_API_VERSION,
  GOVERNANCE_NETWORK,
  GOVERNANCE_PROPOSAL,
} from "./governance-contracts";
import {
  evaluateGovernanceDid,
  fetchGovernanceProposal,
  GovernanceRequestError,
  submitGovernanceVote,
} from "./governance";

const DID = "did:ckb:4kiidiczwthgxj7dltzkzopgbwu3v6jc";
const NOW = 1_800_000_000;

function results() {
  return {
    status: "available" as const,
    results: {
      voterCount: 0,
      totalWeight: 0,
      tallies: [
        { choice: "yes" as const, voterCount: 0, weight: 0 },
        { choice: "no" as const, voterCount: 0, weight: 0 },
      ],
    },
  };
}

function receipt() {
  return {
    version: GOVERNANCE_API_VERSION,
    receiptId: `0x${"11".repeat(32)}`,
    network: GOVERNANCE_NETWORK,
    proposalId: GOVERNANCE_PROPOSAL.id,
    subjectDid: DID,
    choice: "yes" as const,
    participationWeight: 3,
    eligibilityPolicyVersion: GOVERNANCE_PROPOSAL.eligibilityPolicy.version,
    reputation: { policyVersion: "vellum.reputation.v7", score: 500, maximum: 1_000 as const },
    evaluatedAt: NOW,
    recordedAt: NOW,
    controllerLockHash: `0x${"22".repeat(32)}`,
    evidence: [
      {
        claimId: `0x${"33".repeat(32)}`,
        transactionHash: `0x${"44".repeat(32)}`,
        outputIndex: 0,
        issuerDid: GOVERNANCE_PROPOSAL.eligibilityPolicy.issuerDid,
        schemaHash: GOVERNANCE_PROPOSAL.eligibilityPolicy.schemaHash,
        issuedAt: NOW - 100,
      },
    ],
  };
}

describe("governance client", () => {
  test("parses the fixed public proposal", async () => {
    const fetch = mock(async (_input: string | URL | Request) =>
      Response.json({
        ok: true,
        version: GOVERNANCE_API_VERSION,
        network: GOVERNANCE_NETWORK,
        proposal: GOVERNANCE_PROPOSAL,
        proposalStatus: "open",
        serverTime: NOW,
        results: results(),
      }),
    );
    await expect(fetchGovernanceProposal(fetch)).resolves.toMatchObject({
      proposal: { id: GOVERNANCE_PROPOSAL.id },
      results: { status: "available" },
    });
    expect(fetch).toHaveBeenCalledWith("/api/governance/proposal", {
      credentials: "same-origin",
    });
  });

  test("evaluates an encoded DID and preserves service error states", async () => {
    const fetch = mock(async (_input: string | URL | Request) =>
      Response.json({
        ok: true,
        version: GOVERNANCE_API_VERSION,
        evaluation: {
          status: "ineligible",
          network: GOVERNANCE_NETWORK,
          subjectDid: DID,
          evaluatedAt: NOW,
          eligibilityPolicyVersion: GOVERNANCE_PROPOSAL.eligibilityPolicy.version,
          reputation: { policyVersion: "vellum.reputation.v7", score: 0, maximum: 1_000 },
          participationWeight: null,
          evidence: [],
        },
      }),
    );
    await expect(evaluateGovernanceDid(DID, fetch)).resolves.toMatchObject({
      status: "ineligible",
    });
    expect(fetch.mock.calls[0]?.[0]).toBe(
      `/api/governance/evaluate?did=${encodeURIComponent(DID)}`,
    );

    const unavailable = mock(async () =>
      Response.json(
        {
          ok: false,
          version: GOVERNANCE_API_VERSION,
          error: { code: "service_unavailable", message: "Evaluation unavailable" },
        },
        { status: 503 },
      ),
    );
    await expect(evaluateGovernanceDid(DID, unavailable)).rejects.toEqual(
      new GovernanceRequestError("service_unavailable", "Evaluation unavailable"),
    );
  });

  test("signs the server message and submits the exact vote intent", async () => {
    const signed = new ccc.Signature(
      `0x${"55".repeat(65)}`,
      "identity",
      ccc.SignerSignType.CkbSecp256k1,
    );
    const signer = {
      signMessage: mock(async (message: string) => {
        expect(message).toBe("server-authored-message");
        return signed;
      }),
    };
    const fetch = mock(async (_input: string | URL | Request, init?: RequestInit) => {
      const url = String(_input);
      if (url.endsWith("/challenge")) {
        return Response.json({
          ok: true,
          version: GOVERNANCE_API_VERSION,
          challenge: {
            challenge: "challenge-token",
            message: "server-authored-message",
            expiresAt: NOW + 300,
          },
        });
      }
      const submitted = JSON.parse(String(init?.body));
      expect(submitted).toMatchObject({
        proposalId: GOVERNANCE_PROPOSAL.id,
        choice: "yes",
        subject: { did: DID },
        proof: { challenge: "challenge-token", signature: { identity: "identity" } },
      });
      return Response.json({
        ok: true,
        version: GOVERNANCE_API_VERSION,
        receipt: receipt(),
        recordStatus: "recorded",
        results: results(),
      });
    });

    await expect(submitGovernanceVote(DID, "yes", signer, fetch, () => NOW)).resolves.toMatchObject(
      {
        recordStatus: "recorded",
        receipt: { subjectDid: DID, participationWeight: 3 },
      },
    );
    expect(signer.signMessage).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
