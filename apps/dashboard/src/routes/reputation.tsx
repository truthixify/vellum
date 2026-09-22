import { SignalRail, StatusMark } from "@vellum/ui";
import {
  ArrowUpRight,
  BadgeCheck,
  GitPullRequest,
  MessageSquareText,
  RefreshCw,
} from "lucide-react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";

import { VButton } from "@/components/vellum/VButton";
import { ReputationShareDialog } from "@/components/reputation/ReputationShareDialog";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { useReputation } from "@/hooks/use-reputation";
import { useActiveIdentity } from "@/lib/active-identity-context";
import { isDidCkb } from "@/lib/did-ckb";
import type { AvailableReputation, ReputationCategory, ReputationResponse } from "@/lib/reputation";

type GithubContributionEvidence = Extract<
  AvailableReputation["evidence"][number],
  { schemaId: "vellum.contribution.github.v1" }
>;

type ReputationSearch = { did?: string };

export const Route = createFileRoute("/reputation")({
  validateSearch: (search: Record<string, unknown>): ReputationSearch => ({
    did: typeof search.did === "string" ? search.did.trim() || undefined : undefined,
  }),
  component: ReputationPage,
});

const CATEGORY_LABELS: Record<ReputationCategory["id"], string> = {
  technical: "Technical",
  contribution: "Contribution",
  community: "Community",
  tenure: "Tenure",
  recency: "Recency",
};

function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(timestamp * 1_000));
}

function shorten(value: string, head = 14, tail = 8): string {
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

function ReputationPage() {
  useDocumentTitle("Reputation");
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { activeDid, network } = useActiveIdentity();
  const subject = search.did ?? activeDid;
  const validSubject = subject && isDidCkb(subject) ? subject : undefined;
  const unsupportedNetwork = network === "mainnet" && !search.did;
  const [input, setInput] = useState(subject ?? "");
  const reputation = useReputation(validSubject, network === "testnet" || !!search.did);

  useEffect(() => setInput(subject ?? ""), [subject]);

  function handleLookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const did = input.trim();
    if (!isDidCkb(did)) return;
    void navigate({ search: { did } });
  }

  return (
    <div className="reputation-page">
      <header className="reputation-header">
        <div>
          <span className="reputation-kicker">Live CKB Testnet evidence</span>
          <h1>Reputation</h1>
          <p>A deterministic score derived from active claims under a versioned public policy.</p>
        </div>
        <StatusMark tone="positive">Policy live</StatusMark>
      </header>

      <form className="reputation-lookup" onSubmit={handleLookup}>
        <label htmlFor="reputation-did">Identity</label>
        <div>
          <input
            id="reputation-did"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="did:ckb:..."
            autoComplete="off"
            spellCheck={false}
            aria-invalid={input.length > 0 && !isDidCkb(input.trim())}
          />
          <VButton type="submit" variant="secondary" disabled={!isDidCkb(input.trim())}>
            View score
          </VButton>
        </div>
        {input.length > 0 && !isDidCkb(input.trim()) ? (
          <small className="reputation-lookup__error">Enter a valid did:ckb identifier.</small>
        ) : (
          <small>Shareable without a wallet connection</small>
        )}
      </form>

      {!subject ? <EmptyReputationState /> : null}
      {subject && !validSubject ? <InvalidReputationState /> : null}
      {validSubject && unsupportedNetwork ? <TestnetOnlyState /> : null}
      {validSubject && !unsupportedNetwork && reputation.isLoading ? <ReputationSkeleton /> : null}
      {validSubject && !unsupportedNetwork && reputation.isError ? (
        <ReputationError
          message={
            reputation.error instanceof Error
              ? reputation.error.message
              : "The reputation service could not be reached."
          }
          onRetry={() => void reputation.refetch()}
        />
      ) : null}
      {validSubject && !unsupportedNetwork && reputation.data?.status === "unavailable" ? (
        <UnavailableReputation result={reputation.data} onRetry={() => void reputation.refetch()} />
      ) : null}
      {validSubject && !unsupportedNetwork && reputation.data?.status === "available" ? (
        <ReputationReport result={reputation.data} />
      ) : null}
    </div>
  );
}

function TestnetOnlyState() {
  return (
    <section className="reputation-state reputation-state--warning" role="status">
      <span>Testnet policy</span>
      <h2>Switch networks or enter a Testnet DID.</h2>
      <p>The current reputation policy does not evaluate Mainnet identities.</p>
    </section>
  );
}

function EmptyReputationState() {
  return (
    <section className="reputation-state reputation-state--empty">
      <span className="reputation-state__mark" aria-hidden="true">
        [ ]
      </span>
      <h2>Choose an identity</h2>
      <p>Connect a wallet with a DID or enter any did:ckb identifier above.</p>
    </section>
  );
}

function InvalidReputationState() {
  return (
    <section className="reputation-state reputation-state--error" role="alert">
      <span>Invalid identifier</span>
      <h2>This score cannot be loaded.</h2>
      <p>The shared link does not contain a valid did:ckb identifier.</p>
    </section>
  );
}

function ReputationSkeleton() {
  return (
    <section className="reputation-report reputation-report--loading" aria-busy="true">
      <div className="reputation-skeleton reputation-skeleton--score" />
      <div className="reputation-skeleton reputation-skeleton--wide" />
      <div className="reputation-skeleton reputation-skeleton--row" />
      <span className="sr-only">Loading reputation score</span>
    </section>
  );
}

function ReputationError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <section className="reputation-state reputation-state--error" role="alert">
      <span>Score unavailable</span>
      <h2>Vellum could not load this score.</h2>
      <p>{message}</p>
      <VButton variant="secondary" onClick={onRetry}>
        <RefreshCw size={14} aria-hidden="true" /> Retry
      </VButton>
    </section>
  );
}

function UnavailableReputation({
  result,
  onRetry,
}: {
  result: Extract<ReputationResponse, { status: "unavailable" }>;
  onRetry: () => void;
}) {
  return (
    <section className="reputation-state reputation-state--warning" role="status">
      <span>Evidence unavailable</span>
      <h2>No score was produced.</h2>
      <p>{result.error.message}</p>
      <div className="reputation-state__meta">
        {result.policyVersion} · evaluated {formatDate(result.evaluatedAt)} UTC
      </div>
      <VButton variant="secondary" onClick={onRetry}>
        <RefreshCw size={14} aria-hidden="true" /> Check again
      </VButton>
    </section>
  );
}

function ReputationReport({ result }: { result: AvailableReputation }) {
  const hasAcceptedEvidence = result.evidence.length > 0;

  return (
    <div className="reputation-report">
      <section className="reputation-score-panel">
        <div className="reputation-score-panel__subject">
          <span>Subject</span>
          <strong title={result.subject}>{shorten(result.subject, 22, 10)}</strong>
          <small>CKB Testnet</small>
        </div>
        <div className="reputation-score-panel__score">
          <span>Aggregate score</span>
          <div>
            <strong>{result.overall.score}</strong>
            <small>/{result.overall.maximum}</small>
          </div>
          <SignalRail
            value={result.overall.score}
            max={result.overall.maximum}
            height={10}
            label={`Aggregate reputation score ${result.overall.score} out of ${result.overall.maximum}`}
          />
        </div>
        <div className="reputation-score-panel__actions">
          <ReputationShareDialog result={result} />
          <span>QR · LINK · PNG</span>
        </div>
      </section>

      <section className="reputation-section" aria-labelledby="reputation-categories-title">
        <div className="reputation-section__heading">
          <div>
            <span>Score composition</span>
            <h2 id="reputation-categories-title">Categories</h2>
          </div>
          <p>Every point can be traced to accepted evidence and a named policy rule.</p>
        </div>
        <div className="reputation-categories">
          {result.categories.map((category) => (
            <CategoryRow key={category.id} category={category} />
          ))}
        </div>
      </section>

      <section className="reputation-section" aria-labelledby="reputation-evidence-title">
        <div className="reputation-section__heading">
          <div>
            <span>Audit trail</span>
            <h2 id="reputation-evidence-title">Evidence</h2>
          </div>
          <p>
            {result.evidence.length} accepted · {result.excludedEvidence.length} excluded
          </p>
        </div>

        {result.evidence.length === 0 ? (
          <div className="reputation-evidence-empty">
            <h3>No qualifying claims</h3>
            <p>This identity has no active claims recognized by the current policy.</p>
            <div className="reputation-evidence-empty__actions">
              <Link to="/verify/github" className="v-button v-button--secondary">
                <BadgeCheck size={14} aria-hidden="true" /> Verify GitHub
              </Link>
              <Link to="/verify/discord" className="v-button v-button--secondary">
                <BadgeCheck size={14} aria-hidden="true" /> Verify Discord
              </Link>
            </div>
          </div>
        ) : (
          <div className="reputation-evidence-list">
            {result.evidence.map((evidence) => (
              <article
                className={`reputation-evidence${"githubContributions" in evidence ? " reputation-evidence--contributions" : ""}`}
                key={`${evidence.claim.transactionHash}:${evidence.claim.outputIndex}`}
              >
                <div className="reputation-evidence__source">
                  <span>
                    {"githubContributions" in evidence
                      ? "GitHub contributions"
                      : evidence.account.platform}
                  </span>
                  <a href={evidence.account.profileUrl} target="_blank" rel="noreferrer">
                    @{evidence.account.handle}
                    <ArrowUpRight size={13} aria-hidden="true" />
                  </a>
                </div>
                <div className="reputation-evidence__facts">
                  <span>
                    Issued <strong>{formatDate(evidence.issuedAt)} UTC</strong>
                  </span>
                  <span>
                    Schema <strong>{evidence.schemaId}</strong>
                  </span>
                  <span>
                    Contributions{" "}
                    <strong>
                      {evidence.contributions.length > 0
                        ? evidence.contributions
                            .map((item) => `${item.category} +${item.points}`)
                            .join(", ")
                        : "No direct points"}
                    </strong>
                  </span>
                  {"community" in evidence
                    ? evidence.community.memberships.map((membership) => (
                        <span className="reputation-evidence__community" key={membership.guild_id}>
                          <strong>{membership.community_name}</strong>
                          <small>Joined {formatDate(membership.joined_at)} UTC</small>
                          <small>
                            {membership.recognized_roles.length > 0
                              ? `Roles: ${membership.recognized_roles
                                  .map((role) => role.role_name)
                                  .join(", ")}`
                              : "No recognized roles"}
                          </small>
                        </span>
                      ))
                    : null}
                </div>
                <details>
                  <summary>On-chain reference</summary>
                  <dl>
                    <div>
                      <dt>Transaction</dt>
                      <dd>{evidence.claim.transactionHash}</dd>
                    </div>
                    <div>
                      <dt>Output</dt>
                      <dd>{evidence.claim.outputIndex}</dd>
                    </div>
                    <div>
                      <dt>Issuer</dt>
                      <dd>{evidence.issuerDid}</dd>
                    </div>
                  </dl>
                </details>
                {"githubContributions" in evidence ? (
                  <GithubContributionArtifacts evidence={evidence} />
                ) : null}
              </article>
            ))}
          </div>
        )}

        {result.excludedEvidence.length > 0 ? (
          <details className="reputation-excluded">
            <summary>Excluded evidence ({result.excludedEvidence.length})</summary>
            <div>
              {result.excludedEvidence.map((evidence) => (
                <article key={`${evidence.claim.transactionHash}:${evidence.claim.outputIndex}`}>
                  <strong>{evidence.reason.replaceAll("-", " ")}</strong>
                  <p>{evidence.message}</p>
                </article>
              ))}
            </div>
          </details>
        ) : null}
      </section>

      <footer className="reputation-method">
        <div>
          <span>Policy</span>
          <strong>{result.policyVersion}</strong>
        </div>
        <div>
          <span>Evaluated</span>
          <strong>{formatDate(result.evaluatedAt)} UTC</strong>
        </div>
        <p>
          This score is a policy output, not a universal judgment. Re-evaluation can change it as
          claims or issuer state change.
        </p>
        {hasAcceptedEvidence ? (
          <span className="reputation-method__live">Live evidence verified</span>
        ) : null}
      </footer>
    </div>
  );
}

export function GithubContributionArtifacts({
  evidence,
}: {
  evidence: GithubContributionEvidence;
}) {
  const { githubContributions } = evidence;
  const hiddenCount =
    githubContributions.eligibleArtifactCount - githubContributions.artifacts.length;

  return (
    <section className="reputation-github-artifacts" aria-label="GitHub contribution artifacts">
      <header>
        <div>
          <span>Accepted activity</span>
          <strong>
            {githubContributions.artifacts.length} artifact
            {githubContributions.artifacts.length === 1 ? "" : "s"}
          </strong>
        </div>
        <p>
          Since {formatDate(githubContributions.windowStartedAt)} UTC
          {hiddenCount > 0 ? ` · ${hiddenCount} older eligible` : ""}
        </p>
      </header>
      <ol>
        {githubContributions.artifacts.map((artifact) => {
          const isReview = artifact.kind === "pull_request_review";
          return (
            <li key={artifact.artifact_id}>
              <span className="reputation-github-artifact__icon" aria-hidden="true">
                {isReview ? <MessageSquareText size={16} /> : <GitPullRequest size={16} />}
              </span>
              <div className="reputation-github-artifact__body">
                <div className="reputation-github-artifact__meta">
                  <strong>{artifact.repository}</strong>
                  <span>PR #{artifact.number}</span>
                  <span>{artifact.classification}</span>
                </div>
                <a href={artifact.url} target="_blank" rel="noreferrer">
                  {artifact.title}
                  <ArrowUpRight size={13} aria-hidden="true" />
                </a>
                <small>
                  {isReview ? "Reviewed" : "Merged"} {formatDate(artifact.occurred_at)} UTC ·{" "}
                  {artifact.changed_files} changed file{artifact.changed_files === 1 ? "" : "s"}
                </small>
              </div>
              <div className="reputation-github-artifact__points">
                {artifact.contributions.length > 0 ? (
                  artifact.contributions.map((contribution) => (
                    <span key={`${contribution.category}:${contribution.ruleId}`}>
                      +{contribution.points} {contribution.category}
                    </span>
                  ))
                ) : (
                  <span>Category cap reached</span>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function CategoryRow({ category }: { category: ReputationCategory }) {
  const inactive = category.score === 0 && ["technical", "contribution"].includes(category.id);
  return (
    <div className={`reputation-category${inactive ? " reputation-category--inactive" : ""}`}>
      <div className="reputation-category__label">
        <strong>{CATEGORY_LABELS[category.id]}</strong>
        {inactive ? <span>No qualifying evidence</span> : <span>Active policy rule</span>}
      </div>
      <SignalRail
        value={category.score}
        max={category.maximum}
        label={`${CATEGORY_LABELS[category.id]} ${category.score} out of ${category.maximum}`}
      />
      <div className="reputation-category__value">
        <strong>{category.score}</strong>
        <span>/{category.maximum}</span>
      </div>
    </div>
  );
}
