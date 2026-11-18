import { describe, expect, test } from "bun:test";

import {
  GOVERNANCE_PROPOSAL,
  governanceParticipationWeight,
  governanceProposalStatus,
  isGovernanceChoice,
} from "./governance-contracts";

describe("governance contract", () => {
  test("uses explicit inclusive-open and exclusive-close boundaries", () => {
    expect(governanceProposalStatus(GOVERNANCE_PROPOSAL.opensAt - 1)).toBe("upcoming");
    expect(governanceProposalStatus(GOVERNANCE_PROPOSAL.opensAt)).toBe("open");
    expect(governanceProposalStatus(GOVERNANCE_PROPOSAL.closesAt - 1)).toBe("open");
    expect(governanceProposalStatus(GOVERNANCE_PROPOSAL.closesAt)).toBe("closed");
  });

  test("maps every reputation boundary to a bounded vote weight", () => {
    expect(
      [0, 249, 250, 499, 500, 749, 750, 999, 1_000].map(governanceParticipationWeight),
    ).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5]);
    expect(() => governanceParticipationWeight(-1)).toThrow();
    expect(() => governanceParticipationWeight(1_001)).toThrow();
    expect(() => governanceParticipationWeight(1.5)).toThrow();
  });

  test("accepts only the two published choices", () => {
    expect(isGovernanceChoice("yes")).toBe(true);
    expect(isGovernanceChoice("no")).toBe(true);
    expect(isGovernanceChoice("abstain")).toBe(false);
  });
});
