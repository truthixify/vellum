import { StatusMark } from "@vellum/ui";
import { FileCheck2 } from "lucide-react";

import type { GovernanceVoteReceipt } from "@/lib/governance-contracts";

function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(timestamp * 1_000));
}

export function GovernanceExistingVote({ receipt }: { receipt: GovernanceVoteReceipt }) {
  return (
    <div className="governance-evaluation-result governance-existing-vote">
      <StatusMark tone="positive" icon={false}>
        <FileCheck2 size={12} aria-hidden="true" /> Already voted
      </StatusMark>
      <p>
        This vote and its recorded weight are fixed for this proposal. Reputation changes apply to
        future proposals.
      </p>
      <dl>
        <div>
          <dt>Choice</dt>
          <dd>{receipt.choice === "yes" ? "Yes" : "No"}</dd>
        </div>
        <div>
          <dt>Recorded weight</dt>
          <dd>{receipt.participationWeight}</dd>
        </div>
        <div>
          <dt>Recorded</dt>
          <dd>{formatTime(receipt.recordedAt)} UTC</dd>
        </div>
      </dl>
    </div>
  );
}
