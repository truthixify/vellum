import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { GovernanceExistingVote } from "@/components/governance/GovernanceExistingVote";
import {
  GOVERNANCE_API_VERSION,
  GOVERNANCE_NETWORK,
  GOVERNANCE_PROPOSAL,
  type GovernanceVoteReceipt,
} from "@/lib/governance-contracts";

const RECEIPT: GovernanceVoteReceipt = {
  version: GOVERNANCE_API_VERSION,
  receiptId: `0x${"11".repeat(32)}`,
  network: GOVERNANCE_NETWORK,
  proposalId: GOVERNANCE_PROPOSAL.id,
  subjectDid: "did:ckb:4kiidiczwthgxj7dltzkzopgbwu3v6jc",
  choice: "yes",
  participationWeight: 3,
  eligibilityPolicyVersion: GOVERNANCE_PROPOSAL.eligibilityPolicy.version,
  reputation: { policyVersion: "vellum.reputation.v7", score: 500, maximum: 1_000 },
  evaluatedAt: 1_800_000_000,
  recordedAt: 1_800_000_000,
  controllerLockHash: `0x${"22".repeat(32)}`,
  evidence: [
    {
      claimId: `0x${"33".repeat(32)}`,
      transactionHash: `0x${"44".repeat(32)}`,
      outputIndex: 0,
      issuerDid: GOVERNANCE_PROPOSAL.eligibilityPolicy.issuerDid,
      schemaHash: GOVERNANCE_PROPOSAL.eligibilityPolicy.schemaHash,
      issuedAt: 1_799_999_900,
    },
  ],
};

describe("GovernanceExistingVote", () => {
  test("explains the recorded choice, immutable weight, and future reputation behavior", () => {
    const markup = renderToStaticMarkup(<GovernanceExistingVote receipt={RECEIPT} />);

    expect(markup).toContain("Already voted");
    expect(markup).toContain("Yes");
    expect(markup).toContain("Recorded weight");
    expect(markup).toContain(">3<");
    expect(markup).toContain("fixed for this proposal");
    expect(markup).toContain("Reputation changes apply to future proposals");
  });
});
