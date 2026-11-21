import { useCcc, useSigner } from "@ckb-ccc/connector-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { StatusMark } from "@vellum/ui";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Check,
  Clock3,
  ExternalLink,
  FileCheck2,
  Search,
  ShieldCheck,
  Vote,
  WalletCards,
} from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";

import { GovernanceExistingVote } from "@/components/governance/GovernanceExistingVote";
import { GovernanceOverview } from "@/components/governance/GovernanceOverview";
import { GovernanceSteps } from "@/components/governance/GovernanceSteps";
import { VoteReceipt } from "@/components/governance/VoteReceipt";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { useActiveIdentity } from "@/lib/active-identity-context";
import {
  evaluateGovernanceDid,
  fetchGovernanceProposal,
  fetchGovernanceVoteStatus,
  GovernanceRequestError,
  submitGovernanceVote,
} from "@/lib/governance";
import {
  GOVERNANCE_PROPOSAL,
  governanceProposalStatus,
  type GovernanceChoice,
  type GovernanceEvaluation,
  type GovernanceProposalSnapshot,
  type GovernanceProposalStatus,
  type GovernanceVoteStatus,
} from "@/lib/governance-contracts";

export const Route = createFileRoute("/demo/governance/")({ component: GovernanceDemoPage });

const PROPOSAL_QUERY_KEY = ["governance-proposal", GOVERNANCE_PROPOSAL.id] as const;

function voteStatusQueryKey(did: string) {
  return ["governance-vote-status", did] as const;
}

type GovernanceStage = 0 | 1 | 2 | 3 | 4;

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
            <Vote size={15} aria-hidden="true" /> Governance demonstration
          </span>
          <h1>{GOVERNANCE_PROPOSAL.title}</h1>
          <p>Evaluate eligibility, review a weighted ballot, and sign an off-chain signal.</p>
        </div>
        <StatusMark tone={currentStatus === "open" ? "positive" : "neutral"} icon={false}>
          {currentStatus === "open" ? <span className="pulse-dot" /> : <Clock3 size={12} />}
          {currentStatus}
        </StatusMark>
      </header>

      <div className="governance-demo-layout">
        <GovernanceVoteFlow
          proposalStatus={currentStatus}
          proposal={proposal.data}
          proposalLoading={proposal.isLoading}
          proposalError={proposal.error}
          onRetryProposal={proposal.refetch}
        />
        <aside className="governance-context" aria-label="Proposal context">
          <ProposalContext />
          <GovernanceLimitations />
        </aside>
      </div>
    </div>
  );
}

function ProposalContext() {
  return (
    <section className="governance-context-section" aria-labelledby="proposal-summary-title">
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
  );
}

function GovernanceVoteFlow({
  proposalStatus,
  proposal,
  proposalLoading,
  proposalError,
  onRetryProposal,
}: {
  proposalStatus: GovernanceProposalStatus;
  proposal: GovernanceProposalSnapshot | undefined;
  proposalLoading: boolean;
  proposalError: unknown;
  onRetryProposal: () => Promise<unknown>;
}) {
  const signer = useSigner();
  const { open } = useCcc();
  const queryClient = useQueryClient();
  const { records, activeDid, setActiveDid, network, isConnected, isLoading, error } =
    useActiveIdentity();
  const [stage, setStage] = useState<GovernanceStage>(0);
  const [input, setInput] = useState("");
  const [subject, setSubject] = useState("");
  const [choice, setChoice] = useState<GovernanceChoice>("yes");
  const [lastSubject, setLastSubject] = useState<string>();
  const [identityPrefilled, setIdentityPrefilled] = useState(false);

  useEffect(() => {
    if (!identityPrefilled && activeDid) {
      setIdentityPrefilled(true);
      if (!input && !subject) setInput(activeDid);
    }
  }, [activeDid, identityPrefilled, input, subject]);

  const currentInput = input.trim();
  const evaluationIsCurrent = !!subject && currentInput === subject;
  const voteStatus = useQuery({
    queryKey: voteStatusQueryKey(subject),
    queryFn: () => fetchGovernanceVoteStatus(subject),
    enabled: !!subject,
    retry: false,
  });
  const evaluation = useQuery({
    queryKey: ["governance-evaluation", subject],
    queryFn: () => evaluateGovernanceDid(subject),
    enabled:
      !!subject &&
      voteStatus.isSuccess &&
      !voteStatus.isFetching &&
      voteStatus.data.status === "not_recorded",
    retry: false,
  });
  const existingVote =
    evaluationIsCurrent && voteStatus.data?.status === "recorded"
      ? voteStatus.data.receipt
      : undefined;
  const eligible =
    evaluationIsCurrent &&
    voteStatus.isSuccess &&
    !voteStatus.isFetching &&
    voteStatus.data?.status === "not_recorded" &&
    evaluation.data?.status === "eligible";
  const controlsSubject = !!activeDid && activeDid === subject;
  const canReview =
    !!signer &&
    isConnected &&
    network === "testnet" &&
    controlsSubject &&
    eligible &&
    proposalStatus === "open";

  useEffect(() => {
    if (existingVote && stage > 1 && stage < 4) setStage(1);
  }, [existingVote, stage]);

  const vote = useMutation({
    mutationFn: async () => {
      if (!signer || !subject) {
        throw new GovernanceRequestError("invalid_request", "Select an identity before voting.");
      }
      if (activeDid !== subject) {
        throw new GovernanceRequestError(
          "subject_control_invalid",
          "The selected wallet does not control this identity.",
        );
      }
      return submitGovernanceVote(subject, choice, signer);
    },
    onSuccess: (result) => {
      setLastSubject(subject);
      setStage(4);
      const recordedStatus: GovernanceVoteStatus = {
        status: "recorded",
        receipt: result.receipt,
      };
      queryClient.setQueryData(voteStatusQueryKey(subject), recordedStatus);
      queryClient.setQueryData<GovernanceProposalSnapshot>(PROPOSAL_QUERY_KEY, (current) =>
        current ? { ...current, results: result.results } : current,
      );
    },
    onError: (error) => {
      if (error instanceof GovernanceRequestError && error.code === "already_voted") {
        setStage(1);
        void voteStatus.refetch();
      }
    },
  });

  function evaluate(event?: FormEvent) {
    event?.preventDefault();
    const next = input.trim();
    vote.reset();
    setLastSubject(undefined);
    if (next === subject && next) {
      void voteStatus.refetch().then((result) => {
        if (result.data?.status === "not_recorded") void evaluation.refetch();
      });
    } else {
      setSubject(next);
    }
  }

  function evaluateControlledIdentity(did: string) {
    vote.reset();
    setLastSubject(undefined);
    setInput(did);
    setSubject(did);
    setStage(1);
  }

  function startAnotherEvaluation() {
    vote.reset();
    setLastSubject(undefined);
    setSubject("");
    setInput(activeDid ?? "");
    setStage(1);
  }

  const submittedReceipt =
    vote.data && lastSubject === vote.data.receipt.subjectDid ? vote.data.receipt : undefined;
  const activeReceipt = submittedReceipt ?? existingVote;

  let stageContent: ReactNode;
  if (stage === 0) {
    stageContent = (
      <GovernanceOverview
        snapshot={proposal}
        proposalStatus={proposalStatus}
        loading={proposalLoading}
        error={proposalError}
        onRetry={onRetryProposal}
      />
    );
  } else if (stage === 1) {
    stageContent = (
      <IdentityStage
        input={input}
        activeDid={activeDid}
        subjectSet={!!subject}
        voteStatus={evaluationIsCurrent ? voteStatus.data : undefined}
        statusLoading={evaluationIsCurrent && (voteStatus.isLoading || voteStatus.isFetching)}
        statusError={evaluationIsCurrent ? voteStatus.error : null}
        evaluation={evaluation.data}
        loading={evaluation.isLoading || evaluation.isFetching}
        error={evaluation.error}
        evaluationIsCurrent={evaluationIsCurrent}
        onInputChange={setInput}
        onEvaluate={evaluate}
        onRetryStatus={() => void voteStatus.refetch()}
        onUseActive={() => activeDid && setInput(activeDid)}
      />
    );
  } else if (stage === 2) {
    stageContent = (
      <BallotStage
        signerAvailable={!!signer}
        isConnected={isConnected}
        network={network}
        isLoading={isLoading}
        identityError={error}
        records={records}
        activeDid={activeDid}
        subject={subject}
        evaluation={evaluation.data}
        evaluationLoading={evaluation.isLoading || evaluation.isFetching}
        evaluationError={evaluation.error}
        choice={choice}
        proposalStatus={proposalStatus}
        onConnect={open}
        onSelectIdentity={(did) => {
          setActiveDid(did);
          evaluateControlledIdentity(did);
        }}
        onUseSelectedIdentity={() => activeDid && evaluateControlledIdentity(activeDid)}
        onChoiceChange={setChoice}
      />
    );
  } else if (stage === 3) {
    stageContent = (
      <ReviewStage
        subject={subject}
        choice={choice}
        evaluation={evaluation.data}
        canSign={canReview}
        error={vote.error}
      />
    );
  } else {
    stageContent = activeReceipt ? (
      <div className="governance-stage-inner governance-receipt-stage">
        <div className="issuance-stage-heading">
          <span className="mono-caps">Receipt</span>
          <h2>{submittedReceipt ? "Vote recorded" : "Vote already recorded"}</h2>
          <p>
            {submittedReceipt
              ? "The signed signal is available through a durable public receipt."
              : "This identity's existing signal and recorded weight remain available below."}
          </p>
        </div>
        <VoteReceipt receipt={activeReceipt} linkToReceipt />
      </div>
    ) : (
      <div className="governance-stage-inner">
        <div className="governance-inline-alert" role="status">
          <AlertCircle size={17} aria-hidden="true" />
          <div>
            <strong>No receipt available</strong>
            <p>Return to the review step and record the ballot.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <section className="governance-flow" aria-label="Governance vote flow">
      <GovernanceSteps activeStep={activeReceipt && stage === 4 ? 5 : stage} />
      <div className="governance-stage-scroll">{stageContent}</div>
      <GovernanceStageFooter
        stage={stage}
        eligible={eligible}
        canReview={canReview}
        canSign={canReview && !vote.isPending}
        isSigning={vote.isPending}
        alreadyVoted={!!existingVote}
        hasReceipt={!!activeReceipt}
        onBack={() => setStage((current) => Math.max(0, current - 1) as GovernanceStage)}
        onNext={() => setStage((current) => Math.min(4, current + 1) as GovernanceStage)}
        onSign={() => vote.mutate()}
        onViewReceipt={() => setStage(4)}
        onReset={startAnotherEvaluation}
      />
    </section>
  );
}

function IdentityStage({
  input,
  activeDid,
  subjectSet,
  voteStatus,
  statusLoading,
  statusError,
  evaluation,
  loading,
  error,
  evaluationIsCurrent,
  onInputChange,
  onEvaluate,
  onRetryStatus,
  onUseActive,
}: {
  input: string;
  activeDid: string | undefined;
  subjectSet: boolean;
  voteStatus: GovernanceVoteStatus | undefined;
  statusLoading: boolean;
  statusError: unknown;
  evaluation: GovernanceEvaluation | undefined;
  loading: boolean;
  error: unknown;
  evaluationIsCurrent: boolean;
  onInputChange: (value: string) => void;
  onEvaluate: (event: FormEvent) => void;
  onRetryStatus: () => void;
  onUseActive: () => void;
}) {
  return (
    <div className="governance-stage-inner">
      <div className="issuance-stage-heading">
        <span className="mono-caps">Public eligibility</span>
        <h2>Evaluate an identity</h2>
        <p>Read current Claim Cells and reputation without connecting a wallet.</p>
      </div>
      <form className="governance-evaluator__form" onSubmit={onEvaluate}>
        <label htmlFor="governance-subject">did:ckb identity</label>
        <div>
          <input
            id="governance-subject"
            className="mono"
            value={input}
            onChange={(event) => onInputChange(event.target.value)}
            placeholder="did:ckb:..."
            spellCheck={false}
            autoComplete="off"
          />
          <button className="v-button v-button--primary" type="submit" disabled={!input.trim()}>
            <Search size={14} aria-hidden="true" /> Evaluate
          </button>
        </div>
        {activeDid && input !== activeDid && (
          <button className="governance-use-active" type="button" onClick={onUseActive}>
            Use active identity
          </button>
        )}
      </form>
      {subjectSet && !evaluationIsCurrent ? (
        <div className="governance-evaluation-empty">
          The identity changed. Evaluate it to continue.
        </div>
      ) : (
        <IdentityState
          voteStatus={voteStatus}
          statusLoading={statusLoading}
          statusError={statusError}
          evaluation={evaluation}
          evaluationLoading={loading}
          evaluationError={error}
          onRetryStatus={onRetryStatus}
        />
      )}
    </div>
  );
}

function IdentityState({
  voteStatus,
  statusLoading,
  statusError,
  evaluation,
  evaluationLoading,
  evaluationError,
  onRetryStatus,
}: {
  voteStatus: GovernanceVoteStatus | undefined;
  statusLoading: boolean;
  statusError: unknown;
  evaluation: GovernanceEvaluation | undefined;
  evaluationLoading: boolean;
  evaluationError: unknown;
  onRetryStatus: () => void;
}) {
  if (statusLoading) {
    return (
      <div className="governance-evaluation-state" role="status">
        <span className="pulse-dot" aria-hidden="true" /> Checking prior participation
      </div>
    );
  }
  if (statusError) {
    return (
      <div className="governance-inline-alert" role="alert">
        <AlertCircle size={17} aria-hidden="true" />
        <div>
          <strong>Vote status unavailable</strong>
          <p>{errorMessage(statusError)}</p>
        </div>
        <button className="v-button v-button--quiet" type="button" onClick={onRetryStatus}>
          Retry
        </button>
      </div>
    );
  }
  if (voteStatus?.status === "recorded") {
    return <GovernanceExistingVote receipt={voteStatus.receipt} />;
  }
  return (
    <EvaluationState evaluation={evaluation} loading={evaluationLoading} error={evaluationError} />
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
        <span className="pulse-dot" aria-hidden="true" /> Reading current evidence
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

type IdentityRecord = ReturnType<typeof useActiveIdentity>["records"][number];

function BallotStage({
  signerAvailable,
  isConnected,
  network,
  isLoading,
  identityError,
  records,
  activeDid,
  subject,
  evaluation,
  evaluationLoading,
  evaluationError,
  choice,
  proposalStatus,
  onConnect,
  onSelectIdentity,
  onUseSelectedIdentity,
  onChoiceChange,
}: {
  signerAvailable: boolean;
  isConnected: boolean;
  network: "testnet" | "mainnet";
  isLoading: boolean;
  identityError: Error | null;
  records: IdentityRecord[];
  activeDid: string | undefined;
  subject: string;
  evaluation: GovernanceEvaluation | undefined;
  evaluationLoading: boolean;
  evaluationError: unknown;
  choice: GovernanceChoice;
  proposalStatus: GovernanceProposalStatus;
  onConnect: () => void;
  onSelectIdentity: (did: string) => void;
  onUseSelectedIdentity: () => void;
  onChoiceChange: (choice: GovernanceChoice) => void;
}) {
  let accessState: ReactNode = null;
  if (!isConnected || !signerAvailable) {
    accessState = (
      <div className="governance-vote-empty">
        <WalletCards size={24} aria-hidden="true" />
        <h3>Connect a wallet</h3>
        <p>A controlling wallet must authorize the selected identity and ballot.</p>
        <button className="v-button v-button--primary" type="button" onClick={onConnect}>
          <WalletCards size={14} aria-hidden="true" /> Connect wallet
        </button>
      </div>
    );
  } else if (network !== "testnet") {
    accessState = (
      <div className="governance-inline-alert" role="alert">
        <AlertCircle size={17} aria-hidden="true" />
        <div>
          <strong>Switch networks</strong>
          <p>This demonstration requires CKB Testnet.</p>
        </div>
      </div>
    );
  } else if (isLoading) {
    accessState = (
      <div className="governance-evaluation-state" role="status">
        <span className="pulse-dot" aria-hidden="true" /> Loading controlled identities
      </div>
    );
  } else if (identityError) {
    accessState = (
      <div className="governance-inline-alert" role="alert">
        <AlertCircle size={17} aria-hidden="true" />
        <div>
          <strong>Identity lookup failed</strong>
          <p>{identityError.message}</p>
        </div>
      </div>
    );
  } else if (records.length === 0 || !activeDid) {
    accessState = (
      <div className="governance-vote-empty">
        <ShieldCheck size={24} aria-hidden="true" />
        <h3>No DID found</h3>
        <p>The connected wallet does not control an active did:ckb identity.</p>
        <Link className="v-button v-button--secondary" to="/claim">
          Claim a DID
        </Link>
      </div>
    );
  }

  const controlsSubject = !!activeDid && activeDid === subject;

  return (
    <div className="governance-stage-inner">
      <div className="issuance-stage-heading">
        <span className="mono-caps">Signed ballot</span>
        <h2>Select the voting identity and choice</h2>
        <p>One durable vote is accepted per proposal and did:ckb identity.</p>
      </div>
      {accessState ?? (
        <div className="governance-ballot">
          <label htmlFor="governance-voter-did">Controlled identity</label>
          <select
            id="governance-voter-did"
            value={activeDid}
            onChange={(event) => onSelectIdentity(event.target.value)}
          >
            {records.map((record) => (
              <option key={record.did} value={record.did}>
                {record.profile.displayName
                  ? `${record.profile.displayName} — ${record.did}`
                  : record.did}
              </option>
            ))}
          </select>

          {!controlsSubject ? (
            <div className="governance-inline-alert" role="status">
              <ShieldCheck size={17} aria-hidden="true" />
              <div>
                <strong>Use a controlled identity</strong>
                <p>The public evaluation does not match the wallet's selected identity.</p>
              </div>
              <button
                className="v-button v-button--quiet"
                type="button"
                onClick={onUseSelectedIdentity}
              >
                Evaluate selected
              </button>
            </div>
          ) : evaluationLoading ? (
            <div className="governance-evaluation-state" role="status">
              <span className="pulse-dot" aria-hidden="true" /> Checking eligibility
            </div>
          ) : evaluationError ? (
            <div className="governance-inline-alert" role="alert">
              <AlertCircle size={17} aria-hidden="true" />
              <div>
                <strong>Eligibility unavailable</strong>
                <p>{errorMessage(evaluationError)}</p>
              </div>
            </div>
          ) : evaluation?.status === "ineligible" ? (
            <div className="governance-voter-status">
              <StatusMark tone="neutral" icon={false}>
                Not eligible
              </StatusMark>
              <Link to="/verify/github">Verify GitHub to become eligible</Link>
            </div>
          ) : evaluation?.status === "eligible" ? (
            <div className="governance-voter-status governance-voter-status--eligible">
              <StatusMark tone="positive" icon={false}>
                <Check size={12} aria-hidden="true" /> Eligible
              </StatusMark>
              <span>Weight {evaluation.participationWeight}</span>
            </div>
          ) : null}

          <fieldset className="governance-choice" disabled={proposalStatus !== "open"}>
            <legend>Choice</legend>
            {GOVERNANCE_PROPOSAL.choices.map((option) => (
              <label key={option.id} className={choice === option.id ? "active" : ""}>
                <input
                  type="radio"
                  name="governance-choice"
                  value={option.id}
                  checked={choice === option.id}
                  onChange={() => onChoiceChange(option.id)}
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
              <Clock3 size={17} aria-hidden="true" />
              <div>
                <strong>Voting unavailable</strong>
                <p>The proposal is {proposalStatus}.</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ReviewStage({
  subject,
  choice,
  evaluation,
  canSign,
  error,
}: {
  subject: string;
  choice: GovernanceChoice;
  evaluation: GovernanceEvaluation | undefined;
  canSign: boolean;
  error: unknown;
}) {
  return (
    <div className="governance-stage-inner">
      <div className="issuance-stage-heading">
        <span className="mono-caps">Review</span>
        <h2>Confirm the ballot</h2>
        <p>Review the identity, choice, and current weight before asking the wallet to sign.</p>
      </div>
      <div className="governance-review">
        <div className="governance-review__choice">
          <Vote size={20} aria-hidden="true" />
          <span>
            <small>Your choice</small>
            <strong>{choice === "yes" ? "Yes" : "No"}</strong>
          </span>
        </div>
        <dl>
          <div>
            <dt>Proposal</dt>
            <dd>{GOVERNANCE_PROPOSAL.question}</dd>
          </div>
          <div>
            <dt>Identity</dt>
            <dd className="mono">{subject}</dd>
          </div>
          <div>
            <dt>Participation weight</dt>
            <dd>{evaluation?.participationWeight ?? "—"}</dd>
          </div>
          <div>
            <dt>Reputation checkpoint</dt>
            <dd>
              {evaluation
                ? `${evaluation.reputation.score} / ${evaluation.reputation.maximum}`
                : "—"}
            </dd>
          </div>
          <div>
            <dt>Eligibility evidence</dt>
            <dd>
              {evaluation?.evidence.length ?? 0} active claim
              {evaluation?.evidence.length === 1 ? "" : "s"}
            </dd>
          </div>
          <div>
            <dt>Execution</dt>
            <dd>Off-chain signalling only</dd>
          </div>
        </dl>
        <div className="governance-review__notice">
          <FileCheck2 size={17} aria-hidden="true" />
          <p>
            The authorization binds this proposal, choice, identity, nonce, and expiry. The server
            rechecks controller, eligibility, and weight before recording the vote. Once recorded,
            the choice and weight are final for this proposal; later reputation changes apply to
            future proposals.
          </p>
        </div>
      </div>
      {!canSign && (
        <div className="governance-inline-alert" role="alert">
          <AlertCircle size={17} aria-hidden="true" />
          <div>
            <strong>Ballot needs attention</strong>
            <p>Return to the ballot and select an eligible identity controlled by this wallet.</p>
          </div>
        </div>
      )}
      {error != null && (
        <div className="governance-inline-alert" role="alert">
          <AlertCircle size={17} aria-hidden="true" />
          <div>
            <strong>Vote not recorded</strong>
            <p>{errorMessage(error)}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function GovernanceStageFooter({
  stage,
  eligible,
  canReview,
  canSign,
  isSigning,
  alreadyVoted,
  hasReceipt,
  onBack,
  onNext,
  onSign,
  onViewReceipt,
  onReset,
}: {
  stage: GovernanceStage;
  eligible: boolean;
  canReview: boolean;
  canSign: boolean;
  isSigning: boolean;
  alreadyVoted: boolean;
  hasReceipt: boolean;
  onBack: () => void;
  onNext: () => void;
  onSign: () => void;
  onViewReceipt: () => void;
  onReset: () => void;
}) {
  const messages = [
    "Review the proposal, current tally, and voting rules before continuing.",
    "Eligibility is evaluated against current public evidence.",
    "Only an identity controlled by the connected wallet can sign.",
    "The wallet will sign the exact ballot shown above.",
    "The receipt preserves the recorded signal and evidence checkpoint.",
  ];
  const message =
    stage === 1 && alreadyVoted
      ? "This identity's vote and recorded weight are fixed for this proposal."
      : messages[stage];

  return (
    <footer className="issuance-stage-footer governance-stage-footer">
      <span className="issuance-stage-footer__message">{message}</span>
      <div className="issuance-stage-footer__actions">
        {stage > 0 && stage < 4 && (
          <button
            className="v-button v-button--quiet"
            type="button"
            disabled={isSigning}
            onClick={onBack}
          >
            <ArrowLeft size={14} aria-hidden="true" /> Back
          </button>
        )}
        {stage === 0 && (
          <button className="v-button v-button--primary" type="button" onClick={onNext}>
            Check eligibility <ArrowRight size={14} aria-hidden="true" />
          </button>
        )}
        {stage > 0 && stage < 4 && alreadyVoted && (
          <button className="v-button v-button--primary" type="button" onClick={onViewReceipt}>
            <FileCheck2 size={14} aria-hidden="true" /> View receipt
          </button>
        )}
        {stage === 1 && !alreadyVoted && (
          <button
            className="v-button v-button--primary"
            type="button"
            disabled={!eligible}
            onClick={onNext}
          >
            Ballot <ArrowRight size={14} aria-hidden="true" />
          </button>
        )}
        {stage === 2 && !alreadyVoted && (
          <button
            className="v-button v-button--primary"
            type="button"
            disabled={!canReview}
            onClick={onNext}
          >
            Review <ArrowRight size={14} aria-hidden="true" />
          </button>
        )}
        {stage === 3 && !alreadyVoted && (
          <button
            className="v-button v-button--primary"
            type="button"
            disabled={!canSign}
            onClick={onSign}
          >
            <Vote size={14} aria-hidden="true" />
            {isSigning ? "Awaiting authorization" : "Sign and record"}
          </button>
        )}
        {stage === 4 && (
          <button
            className="v-button v-button--secondary"
            type="button"
            disabled={!hasReceipt}
            onClick={onReset}
          >
            Evaluate another identity
          </button>
        )}
      </div>
    </footer>
  );
}

function GovernanceLimitations() {
  return (
    <section
      className="governance-context-section governance-limitations"
      aria-labelledby="governance-limitations-title"
    >
      <span>Demonstration boundary</span>
      <h2 id="governance-limitations-title">Portable signal, not production governance</h2>
      <div>
        <p>One DID is not evidence of one unique human.</p>
        <p>Votes and results are stored off-chain and do not execute a protocol decision.</p>
        <p>Eligibility uses current Testnet state and is not a historical proof.</p>
        <p>This unaudited demonstration must not be used for production governance.</p>
      </div>
    </section>
  );
}
