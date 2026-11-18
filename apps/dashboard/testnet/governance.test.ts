import { expect, test } from "bun:test";

import {
  GOVERNANCE_PROPOSAL,
  governanceParticipationWeight,
} from "../src/lib/governance-contracts";
import { evaluateGovernanceSubject } from "../server/governance/evaluation";

const LIVE_GITHUB_SUBJECT = "did:ckb:4kiidiczwthgxj7dltzkzopgbwu3v6jc";

test("derives governance eligibility and weight from a live Testnet claim", async () => {
  const evaluation = await evaluateGovernanceSubject(LIVE_GITHUB_SUBJECT);

  expect(evaluation).toMatchObject({
    status: "eligible",
    network: "ckb_testnet",
    subjectDid: LIVE_GITHUB_SUBJECT,
    eligibilityPolicyVersion: GOVERNANCE_PROPOSAL.eligibilityPolicy.version,
    reputation: {
      policyVersion: GOVERNANCE_PROPOSAL.weightingPolicy.reputationPolicyVersion,
      maximum: 1_000,
    },
  });
  expect(evaluation.reputation.score).toBeGreaterThan(0);
  expect(evaluation.participationWeight).toBe(
    governanceParticipationWeight(evaluation.reputation.score),
  );
  expect(evaluation.evidence).toEqual([
    expect.objectContaining({
      issuerDid: GOVERNANCE_PROPOSAL.eligibilityPolicy.issuerDid,
      schemaHash: GOVERNANCE_PROPOSAL.eligibilityPolicy.schemaHash,
    }),
  ]);
}, 60_000);
