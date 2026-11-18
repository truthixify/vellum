import { Link } from "@tanstack/react-router";
import { StatusMark } from "@vellum/ui";
import { Check, Copy, ExternalLink, FileCheck2 } from "lucide-react";
import { useState } from "react";

import type { GovernanceVoteReceipt } from "@/lib/governance-contracts";

const TESTNET_EXPLORER = "https://testnet.explorer.nervos.org";

function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(timestamp * 1_000));
}

function shortHash(value: string, start = 12, end = 8): string {
  return value.length > start + end + 3 ? `${value.slice(0, start)}...${value.slice(-end)}` : value;
}

export function VoteReceipt({
  receipt,
  linkToReceipt = false,
}: {
  receipt: GovernanceVoteReceipt;
  linkToReceipt?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function copyReceiptUrl() {
    const url = `${window.location.origin}/demo/governance/receipt/${receipt.receiptId}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <article className="governance-receipt">
      <header className="governance-receipt__header">
        <div>
          <span className="governance-receipt__kicker">
            <FileCheck2 size={14} aria-hidden="true" /> Vote receipt
          </span>
          <h2>Choice recorded</h2>
        </div>
        <StatusMark tone="positive" icon={false}>
          <Check size={12} aria-hidden="true" /> {receipt.choice === "yes" ? "Yes" : "No"}
        </StatusMark>
      </header>

      <dl className="governance-receipt__summary">
        <div>
          <dt>Participation weight</dt>
          <dd>{receipt.participationWeight}</dd>
        </div>
        <div>
          <dt>Reputation checkpoint</dt>
          <dd>
            {receipt.reputation.score} / {receipt.reputation.maximum}
          </dd>
        </div>
        <div>
          <dt>Recorded</dt>
          <dd>{formatTime(receipt.recordedAt)} UTC</dd>
        </div>
      </dl>

      <dl className="governance-receipt__record">
        <div>
          <dt>Identity</dt>
          <dd className="mono">{receipt.subjectDid}</dd>
        </div>
        <div>
          <dt>Receipt</dt>
          <dd className="mono" title={receipt.receiptId}>
            {shortHash(receipt.receiptId)}
          </dd>
        </div>
        <div>
          <dt>Eligibility policy</dt>
          <dd className="mono">{receipt.eligibilityPolicyVersion}</dd>
        </div>
        <div>
          <dt>Weight policy</dt>
          <dd className="mono">{receipt.reputation.policyVersion}</dd>
        </div>
      </dl>

      <div className="governance-receipt__evidence">
        <span>Eligibility evidence</span>
        {receipt.evidence.map((evidence) => (
          <a
            key={`${evidence.transactionHash}:${evidence.outputIndex}`}
            href={`${TESTNET_EXPLORER}/transaction/${evidence.transactionHash}`}
            target="_blank"
            rel="noreferrer"
          >
            <span className="mono">{shortHash(evidence.transactionHash)}</span>
            <span>Output {evidence.outputIndex}</span>
            <ExternalLink size={13} aria-hidden="true" />
          </a>
        ))}
      </div>

      <footer className="governance-receipt__actions">
        <button
          className="v-button v-button--secondary"
          type="button"
          onClick={() => void copyReceiptUrl()}
        >
          {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
          {copied ? "Copied" : "Copy receipt link"}
        </button>
        {linkToReceipt && (
          <Link
            className="v-button v-button--quiet"
            to="/demo/governance/receipt/$receiptId"
            params={{ receiptId: receipt.receiptId }}
          >
            Open receipt
          </Link>
        )}
      </footer>
    </article>
  );
}
