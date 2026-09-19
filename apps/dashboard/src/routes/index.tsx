import { useCcc } from "@ckb-ccc/connector-react";
import { ArrowUpRight, BadgeCheck, Copy, RefreshCw } from "lucide-react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { SignalRail, StatusMark, useCopyFeedback } from "@vellum/ui";

import { Avatar } from "@/components/vellum/Avatar";
import { VButton } from "@/components/vellum/VButton";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { useReputation } from "@/hooks/use-reputation";
import { useActiveIdentity } from "@/lib/active-identity-context";
import type { AvailableReputation, ReputationResponse } from "@/lib/reputation";

export const Route = createFileRoute("/")({ component: Overview });

const CATEGORY_LABELS: Record<AvailableReputation["categories"][number]["id"], string> = {
  technical: "Technical",
  contribution: "Contribution",
  community: "Community",
  tenure: "Tenure",
  recency: "Recency",
};

function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(timestamp * 1_000));
}

function shorten(value: string, head = 18, tail = 8): string {
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

function Overview() {
  useDocumentTitle("Overview");
  const { open } = useCcc();
  const {
    activeIdentity,
    activeDid,
    network,
    isConnected,
    isLoading: identityLoading,
    error: identityError,
    refetch: refetchIdentities,
  } = useActiveIdentity();
  const reputation = useReputation(activeDid, network === "testnet");
  const { copied, copy } = useCopyFeedback();

  if (!isConnected) {
    return (
      <OverviewState
        eyebrow="Identity workspace"
        title="Start with your DID."
        description="Connect a CKB wallet to load the identities it controls and their current reputation evidence."
        action={<VButton onClick={() => open()}>Connect wallet</VButton>}
      />
    );
  }

  if (identityLoading) {
    return (
      <div className="overview-page overview-page--loading" aria-busy="true">
        <div className="reputation-skeleton reputation-skeleton--wide" />
        <div className="overview-metrics">
          <div className="reputation-skeleton reputation-skeleton--row" />
          <div className="reputation-skeleton reputation-skeleton--row" />
        </div>
        <span className="sr-only">Loading identity</span>
      </div>
    );
  }

  if (identityError) {
    return (
      <OverviewState
        eyebrow="Identity unavailable"
        title="Your identity could not be loaded."
        description={identityError.message}
        tone="error"
        action={
          <VButton variant="secondary" onClick={() => void refetchIdentities()}>
            <RefreshCw size={14} aria-hidden="true" /> Retry
          </VButton>
        }
      />
    );
  }

  if (!activeIdentity) {
    return (
      <OverviewState
        eyebrow={`${network} registry`}
        title="No DID found for this wallet."
        description="Claim a did:ckb identity before adding profile data or verifiable reputation evidence."
        action={
          <Link className="v-button v-button--primary" to="/claim">
            Claim a DID
          </Link>
        }
      />
    );
  }

  const initials =
    activeIdentity.profile.displayName
      ?.replace(/[^a-zA-Z0-9]+/g, "")
      .slice(0, 2)
      .toUpperCase() || activeIdentity.did.slice(-2).toUpperCase();

  return (
    <div className="overview-page">
      <section className="overview-identity">
        <Avatar
          url={activeIdentity.profile.avatar}
          fallback={initials}
          size="lg"
          className="overview-identity__avatar"
        />
        <div className="overview-identity__body">
          <div className="overview-identity__name">
            <h1>{activeIdentity.profile.displayName ?? "Your did:ckb identity"}</h1>
            <StatusMark tone="positive">Active</StatusMark>
            <StatusMark icon={false}>Wallet controlled</StatusMark>
          </div>
          <div className="overview-identity__did">
            <span className="mono" title={activeIdentity.did}>
              {shorten(activeIdentity.did, 24, 10)}
            </span>
            <button
              className="v-icon-button"
              title="Copy DID"
              aria-label={copied ? "DID copied" : "Copy DID"}
              onClick={() => void copy(activeIdentity.did)}
            >
              <Copy size={14} aria-hidden="true" />
            </button>
          </div>
        </div>
        <Link className="v-button v-button--primary overview-manage" to="/my">
          Manage identity
        </Link>
      </section>

      <section className="overview-metrics">
        <OverviewReputation
          result={reputation.data}
          loading={reputation.isLoading}
          error={reputation.isError}
          mainnet={network === "mainnet"}
          onRetry={() => void reputation.refetch()}
        />
        <EvidenceCoverage
          result={reputation.data}
          mainnet={network === "mainnet"}
          loading={reputation.isLoading}
          failed={reputation.isError}
        />
      </section>

      <EvidenceLedger result={reputation.data} />
    </div>
  );
}

function OverviewState({
  eyebrow,
  title,
  description,
  action,
  tone = "neutral",
}: {
  eyebrow: string;
  title: string;
  description: string;
  action: React.ReactNode;
  tone?: "neutral" | "error";
}) {
  return (
    <div className={`overview-empty overview-empty--${tone}`}>
      <span>{eyebrow}</span>
      <h1>{title}</h1>
      <p>{description}</p>
      {action}
    </div>
  );
}

function OverviewReputation({
  result,
  loading,
  error,
  mainnet,
  onRetry,
}: {
  result: ReputationResponse | undefined;
  loading: boolean;
  error: boolean;
  mainnet: boolean;
  onRetry: () => void;
}) {
  if (mainnet) {
    return (
      <div className="reputation-panel reputation-panel--unavailable">
        <h2>Reputation score</h2>
        <div className="reputation-total">
          <span>—</span>
        </div>
        <p>The current reputation policy evaluates CKB Testnet evidence only.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="reputation-panel" aria-busy="true">
        <h2>Reputation score</h2>
        <div className="reputation-total">
          <span>···</span>
        </div>
        <div className="reputation-skeleton reputation-skeleton--overview" />
      </div>
    );
  }

  if (error || !result) {
    return (
      <div className="reputation-panel reputation-panel--unavailable">
        <h2>Reputation score</h2>
        <div className="reputation-total">
          <span>—</span>
        </div>
        <p>The reputation service could not be reached. No score was produced.</p>
        <VButton variant="secondary" onClick={onRetry}>
          <RefreshCw size={14} aria-hidden="true" /> Retry
        </VButton>
      </div>
    );
  }

  if (result.status === "unavailable") {
    return (
      <div className="reputation-panel reputation-panel--unavailable">
        <h2>Reputation score</h2>
        <div className="reputation-total">
          <span>—</span>
        </div>
        <p>{result.error.message}</p>
        <VButton variant="secondary" onClick={onRetry}>
          <RefreshCw size={14} aria-hidden="true" /> Check again
        </VButton>
      </div>
    );
  }

  return (
    <div className="reputation-panel">
      <h2>Reputation score</h2>
      <div className="reputation-total">
        <span>{result.overall.score}</span>
        <small>/ {result.overall.maximum}</small>
        <StatusMark tone="positive" icon={false}>
          Live policy
        </StatusMark>
      </div>
      <SignalRail
        value={result.overall.score}
        max={result.overall.maximum}
        height={10}
        label={`Reputation score ${result.overall.score} out of ${result.overall.maximum}`}
      />
      <p>
        {result.policyVersion} · evaluated {formatDate(result.evaluatedAt)} UTC ·{" "}
        <Link to="/reputation" search={{ did: result.subject }}>
          Inspect score
        </Link>
      </p>
      <div className="reputation-categories">
        {result.categories.map((category) => (
          <div key={category.id}>
            <span>
              <strong>{CATEGORY_LABELS[category.id]}</strong>
              <b className="mono">
                {category.score} / {category.maximum}
              </b>
            </span>
            <SignalRail
              value={category.score}
              max={category.maximum}
              label={`${CATEGORY_LABELS[category.id]} ${category.score} out of ${category.maximum}`}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function EvidenceCoverage({
  result,
  mainnet,
  loading,
  failed,
}: {
  result: ReputationResponse | undefined;
  mainnet: boolean;
  loading: boolean;
  failed: boolean;
}) {
  const available = result?.status === "available" ? result : undefined;
  const github = available?.evidence.find((item) => item.account.platform === "github");
  const scoredCategories =
    available?.categories.filter((category) => category.score > 0).length ?? 0;
  const checking = loading && !mainnet;
  const unavailable = mainnet || failed || result?.status === "unavailable";

  return (
    <div className="coverage-panel">
      <h2>Evidence coverage</h2>
      <dl className="coverage-table">
        <div>
          <dt>Accepted claims</dt>
          <dd className="positive">{available?.evidence.length ?? "—"}</dd>
        </div>
        <div>
          <dt>Excluded claims</dt>
          <dd className="mono">{available?.excludedEvidence.length ?? "—"}</dd>
        </div>
        <div>
          <dt>Categories contributing</dt>
          <dd className="mono">{available ? `${scoredCategories} of 5` : "—"}</dd>
        </div>
        <div>
          <dt>Network</dt>
          <dd className={`mono${mainnet ? " warning" : ""}`}>
            {mainnet ? "MAINNET · unsupported" : "CKB TESTNET"}
          </dd>
        </div>
      </dl>
      <h3>Verified accounts</h3>
      <div className="coverage-action">
        <span>
          <strong>
            {checking
              ? "Checking GitHub evidence"
              : github
                ? `GitHub · @${github.account.handle}`
                : unavailable
                  ? "GitHub evidence unavailable"
                  : "GitHub is not verified"}
          </strong>
          <small>
            {checking
              ? "Reading active claims and issuer state"
              : github
                ? `Claim accepted under ${available?.policyVersion}`
                : unavailable
                  ? "No conclusion was drawn from unavailable evidence"
                  : "Add an issuer-backed GitHub claim to the active identity"}
          </small>
        </span>
        <Link className="v-button v-button--quiet" to="/verify/github">
          <BadgeCheck size={13} aria-hidden="true" /> {github ? "View" : "Verify"}
        </Link>
      </div>
      <div className="coverage-action">
        <span>
          <strong>Deterministic policy output</strong>
          <small>Review the policy version, category scores, and excluded evidence together.</small>
        </span>
        <Link
          className="v-button v-button--quiet"
          to="/reputation"
          search={{ did: available?.subject }}
        >
          Details
        </Link>
      </div>
    </div>
  );
}

function EvidenceLedger({ result }: { result: ReputationResponse | undefined }) {
  const available = result?.status === "available" ? result : undefined;

  return (
    <section className="overview-ledger">
      <div className="ledger-toolbar">
        <div className="ledger-tabs">
          <span className="ledger-tabs__label">Contributing evidence</span>
        </div>
        <div className="ledger-actions">
          <Link className="v-button v-button--secondary" to="/verify">
            Add verification
          </Link>
        </div>
      </div>

      {!available ? (
        <div className="overview-ledger__empty">
          Evidence will appear when a score is available.
        </div>
      ) : available.evidence.length === 0 ? (
        <div className="overview-ledger__empty">
          No accepted claims contribute to this policy yet.
        </div>
      ) : (
        <div className="dashboard-data-table dashboard-data-table--evidence">
          <div className="dashboard-data-table__head">
            <span>Evidence</span>
            <span>Issuer</span>
            <span>Issued</span>
            <span>Contribution</span>
            <span>Reference</span>
          </div>
          {available.evidence.map((evidence) => (
            <div
              className="dashboard-data-table__row"
              key={`${evidence.claim.transactionHash}:${evidence.claim.outputIndex}`}
            >
              <span>
                <strong>GitHub · @{evidence.account.handle}</strong>
                <small>{evidence.schemaId}</small>
              </span>
              <span className="mono" title={evidence.issuerDid}>
                {shorten(evidence.issuerDid, 12, 6)}
              </span>
              <span className="mono muted">{formatDate(evidence.issuedAt)}</span>
              <span className="dashboard-contribution">
                <b className="mono">
                  +{evidence.contributions.reduce((sum, item) => sum + item.points, 0)}
                </b>
              </span>
              <a
                className="v-button v-button--quiet"
                href={`https://pudge.explorer.nervos.org/transaction/${evidence.claim.transactionHash}`}
                target="_blank"
                rel="noreferrer"
              >
                Transaction <ArrowUpRight size={13} aria-hidden="true" />
              </a>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
