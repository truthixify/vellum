import { useCcc, useSigner } from "@ckb-ccc/connector-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { StatusMark } from "@vellum/ui";
import {
  AlertCircle,
  BadgeCheck,
  Check,
  Clock3,
  ExternalLink,
  RefreshCw,
  Search,
  ShieldCheck,
  Vote,
  WalletCards,
} from "lucide-react";
import { useState, type FormEvent } from "react";

import { VoteReceipt } from "@/components/governance/VoteReceipt";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { useActiveIdentity } from "@/lib/active-identity-context";
import {
  evaluateGovernanceDid,
  fetchGovernanceProposal,
  GovernanceRequestError,
  submitGovernanceVote,
} from "@/lib/governance";
import {
  GOVERNANCE_PROPOSAL,
  governanceProposalStatus,
  type GovernanceChoice,
  type GovernanceEvaluation,
  type GovernanceProposalSnapshot,
  type GovernanceResults,
} from "@/lib/governance-contracts";

export const Route = createFileRoute("/demo/governance/")({ component: GovernanceDemoPage });

const PROPOSAL_QUERY_KEY = ["governance-proposal", GOVERNANCE_PROPOSAL.id] as const;

function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(timestamp * 1_000));
}

function errorMessage(error: unknown): string {
  return error instanceof GovernanceRequestError
    ? error.message
    : "The governance service is temporarily unavailable.";
}

function GovernanceDemoPage() {
  useDocumentTitle("Governance demo");
  const proposal = useQuery({
    queryKey: PROPOSAL_QUERY_KEY,
    queryFn: () => fetchGovernanceProposal(),
    retry: false,
    refetchInterval: 15_000,
  });
  const currentStatus =
    proposal.data?.proposalStatus ?? governanceProposalStatus(Math.floor(Date.now() / 1_000));

  return (
    <div className="governance-demo-page">
      <header className="governance-demo-header">
        <div>
          <span className="governance-demo-kicker">
            <Vote size={15} aria-hidden="true" /> CKB Testnet governance demo
          </span>
          <h1>{GOVERNANCE_PROPOSAL.title}</h1>
          <p>{GOVERNANCE_PROPOSAL.question}</p>
        </div>
        <StatusMark tone={currentStatus === "open" ? "positive" : "neutral"} icon={false}>
          {currentStatus === "open" ? <span className="pulse-dot" /> : <Clock3 size={12} />}
          {currentStatus}
        </StatusMark>
      </header>

      <section className="governance-proposal" aria-labelledby="proposal-summary-title">
        <div className="governance-section-heading">
          <span>Proposal</span>
          <h2 id="proposal-summary-title">{GOVERNANCE_PROPOSAL.question}</h2>
          <p>{GOVERNANCE_PROPOSAL.summary}</p>
        </div>
        <dl className="governance-proposal__meta">
          <div>
            <dt>Proposal ID</dt>
            <dd className="mono">{GOVERNANCE_PROPOSAL.id}</dd>
          </div>
          <div>
            <dt>Opens</dt>
            <dd>{formatTime(GOVERNANCE_PROPOSAL.opensAt)} UTC</dd>
          </div>
          <div>
            <dt>Closes</dt>
            <dd>{formatTime(GOVERNANCE_PROPOSAL.closesAt)} UTC</dd>
          </div>
          <div>
            <dt>Execution</dt>
            <dd>Signalling only</dd>
          </div>
        </dl>
        <div className="governance-policy-strip">
          <div>
            <BadgeCheck size={17} aria-hidden="true" />
            <span>
              <small>Eligibility</small>
              <strong>{GOVERNANCE_PROPOSAL.eligibilityPolicy.label}</strong>
              <code>{GOVERNANCE_PROPOSAL.eligibilityPolicy.version}</code>
            </span>
          </div>
          <div>
            <ShieldCheck size={17} aria-hidden="true" />
            <span>
              <small>Weighting</small>
              <strong>{GOVERNANCE_PROPOSAL.weightingPolicy.label}</strong>
              <code>{GOVERNANCE_PROPOSAL.weightingPolicy.version}</code>
            </span>
          </div>
        </div>
      </section>

      <ResultsSection
        proposal={proposal.data}
        loading={proposal.isLoading}
        error={proposal.error}
        onRetry={proposal.refetch}
      />

      <div className="governance-workspace">
        <IdentityEvaluator />
        <VotingPanel proposalStatus={currentStatus} />
      </div>

      <section className="governance-limitations" aria-labelledby="governance-limitations-title">
        <span>Demonstration boundary</span>
        <h2 id="governance-limitations-title">Portable signal, not production governance</h2>
        <div>
          <p>One DID is not evidence of one unique human.</p>
          <p>Votes and results are stored off-chain and do not execute a protocol decision.</p>
          <p>Eligibility uses current Testnet state and is not a historical proof.</p>
          <p>This unaudited demonstration must not be used for production governance.</p>
        </div>
      </section>
    </div>
  );
}

function ResultsSection({
  proposal,
  loading,
  error,
  onRetry,
}: {
  proposal: GovernanceProposalSnapshot | undefined;
  loading: boolean;
  error: unknown;
  onRetry: () => Promise<unknown>;
}) {
  let content;
  if (loading) {
    content = (
      <div className="governance-results__loading" role="status">
        <span className="pulse-dot" aria-hidden="true" /> Loading the current signal
      </div>
    );
  } else if (error || proposal?.results.status === "unavailable") {
    content = (
      <div className="governance-inline-alert" role="status">
        <AlertCircle size={17} aria-hidden="true" />
        <div>
          <strong>Current tally unavailable</strong>
          <p>
            {proposal?.results.status === "unavailable"
              ? proposal.results.message
              : errorMessage(error)}
          </p>
        </div>
        <button className="v-button v-button--quiet" type="button" onClick={() => void onRetry()}>
          <RefreshCw size={14} aria-hidden="true" /> Retry
        </button>
      </div>
    );
  } else {
    content = <WeightedResults results={proposal?.results.results} />;
  }

  return (
    <section className="governance-results" aria-labelledby="governance-results-title">
      <div className="governance-section-heading governance-section-heading--row">
        <div>
          <span>Public result</span>
          <h2 id="governance-results-title">Current signal</h2>
        </div>
        {proposal?.results.status === "available" && (
          <p>
            {proposal.results.results.voterCount} voter
            {proposal.results.results.voterCount === 1 ? "" : "s"} ·{" "}
            {proposal.results.results.totalWeight} total weight
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
              <span>{tally.voterCount} voters</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function IdentityEvaluator() {
  const { activeDid } = useActiveIdentity();
  const [input, setInput] = useState("");
  const [subject, setSubject] = useState("");
  const evaluation = useQuery({
    queryKey: ["governance-evaluation", subject],
    queryFn: () => evaluateGovernanceDid(subject),
    enabled: !!subject,
    retry: false,
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    const next = input.trim();
    if (next === subject && next) void evaluation.refetch();
    else setSubject(next);
  }

  return (
    <section className="governance-evaluator" aria-labelledby="governance-evaluator-title">
      <div className="governance-section-heading">
        <span>Public eligibility</span>
        <h2 id="governance-evaluator-title">Evaluate an identity</h2>
        <p>Evaluation reads current Claim Cells and reputation without requiring a wallet.</p>
      </div>
      <form className="governance-evaluator__form" onSubmit={submit}>
        <label htmlFor="governance-subject">did:ckb identity</label>
        <div>
          <input
            id="governance-subject"
            className="mono"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="did:ckb:..."
            spellCheck={false}
            autoComplete="off"
          />
          <button className="v-button v-button--primary" type="submit" disabled={!input.trim()}>
            <Search size={14} aria-hidden="true" /> Evaluate
          </button>
        </div>
        {activeDid && input !== activeDid && (
          <button
            className="governance-use-active"
            type="button"
            onClick={() => setInput(activeDid)}
          >
            Use active identity
          </button>
        )}
      </form>
      <EvaluationState
        evaluation={evaluation.data}
        loading={evaluation.isLoading || evaluation.isFetching}
        error={evaluation.error}
      />
    </section>
  );
}

function EvaluationState({
  evaluation,
  loading,
  error,
}: {
  evaluation: GovernanceEvaluation | undefined;
  loading: boolean;
  error: unknown;
}) {
  if (loading) {
    return (
      <div className="governance-evaluation-state" role="status">
        <span className="pulse-dot" aria-hidden="true" /> Reading current Testnet evidence
      </div>
    );
  }
  if (error) {
    return (
      <div className="governance-inline-alert" role="alert">
        <AlertCircle size={17} aria-hidden="true" />
        <div>
          <strong>Evaluation unavailable</strong>
          <p>{errorMessage(error)}</p>
        </div>
      </div>
    );
  }
  if (!evaluation) return <div className="governance-evaluation-empty">No identity evaluated.</div>;
  if (evaluation.status === "ineligible") {
    return (
      <div className="governance-evaluation-result governance-evaluation-result--neutral">
        <StatusMark tone="neutral" icon={false}>
          Not eligible
        </StatusMark>
        <p>The identity has no active GitHub verification from the published Vellum issuer.</p>
        <Link className="v-button v-button--secondary" to="/verify/github">
          Verify GitHub
        </Link>
      </div>
    );
  }
  return (
    <div className="governance-evaluation-result governance-evaluation-result--eligible">
      <StatusMark tone="positive" icon={false}>
        <Check size={12} aria-hidden="true" /> Eligible
      </StatusMark>
      <dl>
        <div>
          <dt>Reputation</dt>
          <dd>
            {evaluation.reputation.score} / {evaluation.reputation.maximum}
          </dd>
        </div>
        <div>
          <dt>Participation weight</dt>
          <dd>{evaluation.participationWeight}</dd>
        </div>
        <div>
          <dt>Evidence</dt>
          <dd>
            {evaluation.evidence.length} active claim{evaluation.evidence.length === 1 ? "" : "s"}
          </dd>
        </div>
      </dl>
      <a
        href={`https://usevellum.xyz/profile/${encodeURIComponent(evaluation.subjectDid)}`}
        target="_blank"
        rel="noreferrer"
      >
        Inspect public profile <ExternalLink size={13} aria-hidden="true" />
      </a>
    </div>
  );
}

function VotingPanel({ proposalStatus }: { proposalStatus: "upcoming" | "open" | "closed" }) {
  const signer = useSigner();
  const { open } = useCcc();
  const queryClient = useQueryClient();
  const { records, activeDid, setActiveDid, network, isConnected, isLoading, error } =
    useActiveIdentity();
  const [choice, setChoice] = useState<GovernanceChoice>("yes");
  const [lastSubject, setLastSubject] = useState<string>();
  const evaluation = useQuery({
    queryKey: ["governance-voter-evaluation", activeDid],
    queryFn: () => evaluateGovernanceDid(activeDid!),
    enabled: !!signer && !!activeDid && network === "testnet",
    retry: false,
  });
  const vote = useMutation({
    mutationFn: async () => {
      if (!signer || !activeDid)
        throw new GovernanceRequestError("invalid_request", "Select an identity before voting.");
      return submitGovernanceVote(activeDid, choice, signer);
    },
    onSuccess: (result) => {
      setLastSubject(activeDid);
      queryClient.setQueryData<GovernanceProposalSnapshot>(PROPOSAL_QUERY_KEY, (current) =>
        current ? { ...current, results: result.results } : current,
      );
    },
  });

  let body;
  if (!isConnected || !signer) {
    body = (
      <div className="governance-vote-empty">
        <WalletCards size={24} aria-hidden="true" />
        <h3>Connect a Testnet wallet</h3>
        <p>A controlling wallet signs the exact proposal, choice, identity, nonce, and expiry.</p>
        <button className="v-button v-button--primary" type="button" onClick={() => open()}>
          <WalletCards size={14} aria-hidden="true" /> Connect wallet
        </button>
      </div>
    );
  } else if (network !== "testnet") {
    body = (
      <div className="governance-inline-alert" role="alert">
        <AlertCircle size={17} aria-hidden="true" />
        <div>
          <strong>Testnet required</strong>
          <p>Switch the connected wallet to CKB Testnet.</p>
        </div>
      </div>
    );
  } else if (isLoading) {
    body = (
      <div className="governance-evaluation-state" role="status">
        <span className="pulse-dot" /> Loading controlled identities
      </div>
    );
  } else if (error) {
    body = (
      <div className="governance-inline-alert" role="alert">
        <AlertCircle size={17} aria-hidden="true" />
        <div>
          <strong>Identity lookup failed</strong>
          <p>{error.message}</p>
        </div>
      </div>
    );
  } else if (records.length === 0 || !activeDid) {
    body = (
      <div className="governance-vote-empty">
        <ShieldCheck size={24} aria-hidden="true" />
        <h3>No Testnet DID found</h3>
        <p>The connected wallet does not control an active did:ckb identity.</p>
        <Link className="v-button v-button--secondary" to="/claim">
          Claim a DID
        </Link>
      </div>
    );
  } else {
    const eligible = evaluation.data?.status === "eligible";
    body = (
      <div className="governance-ballot">
        <label htmlFor="governance-voter-did">Voting identity</label>
        <select
          id="governance-voter-did"
          value={activeDid}
          onChange={(event) => {
            vote.reset();
            setLastSubject(undefined);
            setActiveDid(event.target.value);
          }}
          disabled={vote.isPending}
        >
          {records.map((record) => (
            <option key={record.did} value={record.did}>
              {record.profile.displayName
                ? `${record.profile.displayName} — ${record.did}`
                : record.did}
            </option>
          ))}
        </select>

        {evaluation.isLoading || evaluation.isFetching ? (
          <div className="governance-evaluation-state" role="status">
            <span className="pulse-dot" /> Checking voting eligibility
          </div>
        ) : evaluation.error ? (
          <div className="governance-inline-alert" role="alert">
            <AlertCircle size={17} aria-hidden="true" />
            <div>
              <strong>Eligibility unavailable</strong>
              <p>{errorMessage(evaluation.error)}</p>
            </div>
          </div>
        ) : evaluation.data?.status === "ineligible" ? (
          <div className="governance-voter-status">
            <StatusMark tone="neutral" icon={false}>
              Not eligible
            </StatusMark>
            <Link to="/verify/github">Verify GitHub to become eligible</Link>
          </div>
        ) : eligible ? (
          <div className="governance-voter-status governance-voter-status--eligible">
            <StatusMark tone="positive" icon={false}>
              <Check size={12} /> Eligible
            </StatusMark>
            <span>Weight {evaluation.data?.participationWeight}</span>
          </div>
        ) : null}

        <fieldset
          className="governance-choice"
          disabled={vote.isPending || proposalStatus !== "open"}
        >
          <legend>Choice</legend>
          {GOVERNANCE_PROPOSAL.choices.map((option) => (
            <label key={option.id} className={choice === option.id ? "active" : ""}>
              <input
                type="radio"
                name="governance-choice"
                value={option.id}
                checked={choice === option.id}
                onChange={() => setChoice(option.id)}
              />
              <span>
                <strong>{option.label}</strong>
                <small>{option.description}</small>
              </span>
            </label>
          ))}
        </fieldset>

        {proposalStatus !== "open" && (
          <div className="governance-inline-alert" role="status">
            <Clock3 size={17} />
            <div>
              <strong>Voting unavailable</strong>
              <p>The proposal is {proposalStatus}.</p>
            </div>
          </div>
        )}
        {vote.error && (
          <div className="governance-inline-alert" role="alert">
            <AlertCircle size={17} />
            <div>
              <strong>Vote not recorded</strong>
              <p>{errorMessage(vote.error)}</p>
            </div>
          </div>
        )}
        <button
          className="v-button v-button--primary governance-cast-button"
          type="button"
          disabled={!eligible || proposalStatus !== "open" || vote.isPending}
          onClick={() => vote.mutate()}
        >
          <Vote size={14} aria-hidden="true" />{" "}
          {vote.isPending ? "Awaiting authorization" : "Sign and record vote"}
        </button>
        <small className="governance-ballot__note">
          The server rechecks controller, eligibility, and weight before recording.
        </small>
      </div>
    );
  }

  return (
    <section className="governance-voting" aria-labelledby="governance-voting-title">
      <div className="governance-section-heading">
        <span>Signed ballot</span>
        <h2 id="governance-voting-title">Cast a vote</h2>
        <p>One durable vote is accepted per proposal and did:ckb identity.</p>
      </div>
      {body}
      {vote.data && lastSubject === vote.data.receipt.subjectDid && (
        <VoteReceipt receipt={vote.data.receipt} linkToReceipt />
      )}
    </section>
  );
}
