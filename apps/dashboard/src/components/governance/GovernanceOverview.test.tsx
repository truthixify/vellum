import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { GovernanceOverview } from "@/components/governance/GovernanceOverview";
import { GOVERNANCE_PROPOSAL, type GovernanceProposalSnapshot } from "@/lib/governance-contracts";

const SNAPSHOT: GovernanceProposalSnapshot = {
  version: "1",
  network: "ckb_testnet",
  proposal: GOVERNANCE_PROPOSAL,
  proposalStatus: "open",
  serverTime: GOVERNANCE_PROPOSAL.opensAt + 1,
  results: {
    status: "available",
    results: {
      voterCount: 3,
      totalWeight: 8,
      tallies: [
        { choice: "yes", voterCount: 2, weight: 6 },
        { choice: "no", voterCount: 1, weight: 2 },
      ],
    },
  },
};

describe("GovernanceOverview", () => {
  test("shows proposal context, current progress, and the complete voting process", () => {
    const markup = renderToStaticMarkup(
      <GovernanceOverview
        snapshot={SNAPSHOT}
        proposalStatus="open"
        loading={false}
        error={null}
        onRetry={async () => undefined}
      />,
    );

    expect(markup).toContain(GOVERNANCE_PROPOSAL.question);
    expect(markup).toContain("3 voters · 8 weight");
    expect(markup).toContain("75%");
    expect(markup).toContain("How participation works");
    expect(markup).toContain("No CKB transaction or fee is required");
    expect(markup).toContain("records one vote per DID");
  });

  test("keeps tally failures recoverable before the voting flow starts", () => {
    const markup = renderToStaticMarkup(
      <GovernanceOverview
        snapshot={{
          ...SNAPSHOT,
          results: { status: "unavailable", message: "The tally could not be loaded." },
        }}
        proposalStatus="open"
        loading={false}
        error={null}
        onRetry={async () => undefined}
      />,
    );

    expect(markup).toContain("Results unavailable");
    expect(markup).toContain("The tally could not be loaded.");
    expect(markup).toContain("Retry");
    expect(markup).toContain("How participation works");
  });
});
