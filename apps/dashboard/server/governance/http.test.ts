import { describe, expect, test } from "bun:test";

import {
  GOVERNANCE_PROPOSAL,
  type GovernanceProposalSnapshot,
} from "../../src/lib/governance-contracts";
import { GovernanceServiceError } from "./errors";
import { handleGovernanceRequest, governanceActionFromUrl } from "./http";
import type { GovernanceService } from "./service";

const DID = "did:ckb:4kiidiczwthgxj7dltzkzopgbwu3v6jc";

function service(overrides: Partial<GovernanceService> = {}): GovernanceService {
  const snapshot: GovernanceProposalSnapshot = {
    version: "1",
    network: "ckb_testnet",
    proposal: GOVERNANCE_PROPOSAL,
    proposalStatus: "open",
    serverTime: 1_800_000_000,
    results: {
      status: "available",
      results: {
        voterCount: 0,
        totalWeight: 0,
        tallies: [
          { choice: "yes", voterCount: 0, weight: 0 },
          { choice: "no", voterCount: 0, weight: 0 },
        ],
      },
    },
  };
  return {
    proposal: async () => snapshot,
    evaluate: async (subjectDid) => ({
      status: "ineligible",
      network: "ckb_testnet",
      subjectDid,
      evaluatedAt: snapshot.serverTime,
      eligibilityPolicyVersion: GOVERNANCE_PROPOSAL.eligibilityPolicy.version,
      reputation: { policyVersion: "vellum.reputation.v7", score: 0, maximum: 1_000 },
      participationWeight: null,
      evidence: [],
    }),
    challenge: async () => ({
      challenge: "challenge",
      message: "message",
      expiresAt: 1_800_000_300,
    }),
    vote: async () => {
      throw new Error("unused");
    },
    receipt: async () => {
      throw new Error("unused");
    },
    ...overrides,
  };
}

describe("governance HTTP boundary", () => {
  test("serves the public proposal and evaluates one DID", async () => {
    const proposal = await handleGovernanceRequest(
      new Request("https://dashboard.usevellum.xyz/api/governance/proposal"),
      service(),
    );
    const evaluation = await handleGovernanceRequest(
      new Request(`https://dashboard.usevellum.xyz/api/governance/evaluate?did=${DID}`),
      service(),
    );
    expect(proposal.status).toBe(200);
    expect(await proposal.json()).toMatchObject({
      ok: true,
      proposal: { id: GOVERNANCE_PROPOSAL.id },
    });
    expect(evaluation.status).toBe(200);
    expect(await evaluation.json()).toMatchObject({
      ok: true,
      evaluation: { subjectDid: DID, status: "ineligible" },
    });
  });

  test("validates methods, action paths, repeated queries, and bounded JSON", async () => {
    const wrongMethod = await handleGovernanceRequest(
      new Request("https://dashboard.usevellum.xyz/api/governance/proposal", { method: "POST" }),
      service(),
    );
    const unknown = await handleGovernanceRequest(
      new Request("https://dashboard.usevellum.xyz/api/governance/unknown"),
      service(),
    );
    const repeated = await handleGovernanceRequest(
      new Request(`https://dashboard.usevellum.xyz/api/governance/evaluate?did=${DID}&did=${DID}`),
      service(),
    );
    const invalidBody = await handleGovernanceRequest(
      new Request("https://dashboard.usevellum.xyz/api/governance/challenge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
      service(),
    );

    expect(wrongMethod.status).toBe(405);
    expect(wrongMethod.headers.get("allow")).toBe("GET");
    expect(unknown.status).toBe(404);
    expect(repeated.status).toBe(400);
    expect(invalidBody.status).toBe(400);
  });

  test("accepts a strict challenge body and maps service errors", async () => {
    const challenge = await handleGovernanceRequest(
      new Request("https://dashboard.usevellum.xyz/api/governance/challenge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          version: "1",
          proposalId: GOVERNANCE_PROPOSAL.id,
          choice: "yes",
          subject: { did: DID },
        }),
      }),
      service(),
    );
    expect(challenge.status).toBe(200);
    expect(await challenge.json()).toMatchObject({ ok: true, challenge: { message: "message" } });

    const unavailable = await handleGovernanceRequest(
      new Request(`https://dashboard.usevellum.xyz/api/governance/evaluate?did=${DID}`),
      service({
        evaluate: async () => {
          throw new GovernanceServiceError("service_unavailable", 503, "Public failure");
        },
      }),
    );
    expect(unavailable.status).toBe(503);
    expect(await unavailable.json()).toMatchObject({
      ok: false,
      error: { code: "service_unavailable", message: "Public failure" },
    });
  });

  test("does not expose unexpected server errors", async () => {
    const response = await handleGovernanceRequest(
      new Request("https://dashboard.usevellum.xyz/api/governance/proposal"),
      service({
        proposal: async () => {
          throw new Error("private Redis detail");
        },
      }),
    );
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private Redis detail");
  });

  test("extracts only supported complete action routes", () => {
    expect(
      governanceActionFromUrl(new Request("https://dashboard.usevellum.xyz/api/governance/vote")),
    ).toBe("vote");
    expect(
      governanceActionFromUrl(
        new Request("https://dashboard.usevellum.xyz/api/governance/vote/extra"),
      ),
    ).toBeUndefined();
  });
});
