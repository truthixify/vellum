import { StatusMark } from "@vellum/ui";
import { AlertCircle, RefreshCw } from "lucide-react";

import { GovernanceRequestError } from "@/lib/governance";
import {
  GOVERNANCE_PROPOSAL,
  type GovernanceProposalSnapshot,
  type GovernanceProposalStatus,
  type GovernanceResults,
} from "@/lib/governance-contracts";

function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(timestamp * 1_000));
}

function resultErrorMessage(error: unknown): string {
  return error instanceof GovernanceRequestError
    ? error.message
    : "The governance service is temporarily unavailable.";
}

export function GovernanceOverview({
  snapshot,
  proposalStatus,
  loading,
  error,
  onRetry,
}: {
  snapshot: GovernanceProposalSnapshot | undefined;
  proposalStatus: GovernanceProposalStatus;
  loading: boolean;
  error: unknown;
  onRetry: () => Promise<unknown>;
}) {
  return (
    <div className="governance-stage-inner governance-overview">
      <div className="issuance-stage-heading">
        <span className="mono-caps">Proposal overview</span>
        <h2>{GOVERNANCE_PROPOSAL.question}</h2>
        <p>{GOVERNANCE_PROPOSAL.summary}</p>
      </div>

      <dl className="governance-overview__meta">
        <div>
          <dt>Status</dt>
          <dd>
            <StatusMark tone={proposalStatus === "open" ? "positive" : "neutral"} icon={false}>
              {proposalStatus}
            </StatusMark>
          </dd>
        </div>
        <div>
          <dt>Closes</dt>
          <dd>{formatTime(GOVERNANCE_PROPOSAL.closesAt)} UTC</dd>
        </div>
        <div>
          <dt>Execution</dt>
          <dd>Off-chain signalling</dd>
        </div>
      </dl>

      <ResultsSection snapshot={snapshot} loading={loading} error={error} onRetry={onRetry} />

      <section className="governance-process" aria-labelledby="governance-process-title">
        <div className="governance-section-heading">
          <span>Voting process</span>
          <h3 id="governance-process-title">How participation works</h3>
        </div>
        <ol>
          <ProcessStep
            number="01"
            title="Check eligibility"
            body="An active Vellum GitHub verification from the published issuer is required."
          />
          <ProcessStep
            number="02"
            title="Calculate weight"
            body="Current reputation maps to a bounded participation weight from 1 to 5."
          />
          <ProcessStep
            number="03"
            title="Authorize the ballot"
            body="The DID controller signs the exact choice. No CKB transaction or fee is required."
          />
          <ProcessStep
            number="04"
            title="Record the signal"
            body="The server rechecks evidence, then fixes one choice and weight per DID for this proposal."
          />
        </ol>
      </section>
    </div>
  );
}

function ProcessStep({ number, title, body }: { number: string; title: string; body: string }) {
  return (
    <li>
      <span className="mono">{number}</span>
      <div>
        <strong>{title}</strong>
        <p>{body}</p>
      </div>
    </li>
  );
}

function ResultsSection({
  snapshot,
  loading,
  error,
  onRetry,
}: {
  snapshot: GovernanceProposalSnapshot | undefined;
  loading: boolean;
  error: unknown;
  onRetry: () => Promise<unknown>;
}) {
  let content;
  if (loading) {
    content = (
      <div className="governance-results__loading" role="status">
        <span className="pulse-dot" aria-hidden="true" /> Loading tally
      </div>
    );
  } else if (error || snapshot?.results.status === "unavailable") {
    content = (
      <div className="governance-inline-alert" role="status">
        <AlertCircle size={17} aria-hidden="true" />
        <div>
          <strong>Results unavailable</strong>
          <p>
            {snapshot?.results.status === "unavailable"
              ? snapshot.results.message
              : resultErrorMessage(error)}
          </p>
        </div>
        <button className="v-button v-button--quiet" type="button" onClick={() => void onRetry()}>
          <RefreshCw size={14} aria-hidden="true" /> Retry
        </button>
      </div>
    );
  } else {
    content = <WeightedResults results={snapshot?.results.results} />;
  }

  return (
    <section className="governance-results-section" aria-labelledby="governance-results-title">
      <div className="governance-section-heading governance-section-heading--row">
        <div>
          <span>Voting progress</span>
          <h3 id="governance-results-title">Current signal</h3>
        </div>
        {snapshot?.results.status === "available" && (
          <p>
            {snapshot.results.results.voterCount} voter
            {snapshot.results.results.voterCount === 1 ? "" : "s"} ·{" "}
            {snapshot.results.results.totalWeight} weight
          </p>
        )}
      </div>
      {content}
    </section>
  );
}

function WeightedResults({ results }: { results: GovernanceResults | undefined }) {
  const empty: GovernanceResults = {
    voterCount: 0,
    totalWeight: 0,
    tallies: [
      { choice: "yes", voterCount: 0, weight: 0 },
      { choice: "no", voterCount: 0, weight: 0 },
    ],
  };
  const value = results ?? empty;

  return (
    <div className="governance-tallies">
      {value.tallies.map((tally) => {
        const share = value.totalWeight === 0 ? 0 : (tally.weight / value.totalWeight) * 100;
        return (
          <div className="governance-tally" key={tally.choice}>
            <div className="governance-tally__label">
              <strong>{tally.choice === "yes" ? "Yes" : "No"}</strong>
              <span>{share.toFixed(0)}%</span>
            </div>
            <div className="governance-tally__track" aria-hidden="true">
              <span style={{ width: `${share}%` }} />
            </div>
            <div className="governance-tally__details">
              <span>{tally.weight} weight</span>
              <span>
                {tally.voterCount} voter{tally.voterCount === 1 ? "" : "s"}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
