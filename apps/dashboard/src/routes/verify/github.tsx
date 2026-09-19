import { ccc, useCcc, useSigner } from "@ckb-ccc/connector-react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { StatusMark } from "@vellum/ui";
import {
  AlertCircle,
  Check,
  Clock3,
  ExternalLink,
  Github,
  RefreshCw,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import { useEffect, useState } from "react";

import { useDocumentTitle } from "@/hooks/use-document-title";
import { listDidsByLock, type DidRecord } from "@/lib/did-ckb";
import { confirmGithubClaim, type GithubClaimConfirmation } from "@/lib/github-claim-reader";
import {
  GithubVerificationRequestError,
  fetchPublicIssuerMetadata,
  githubSubmissionFromSearch,
  githubVerificationErrorMessage,
  parseGithubVerificationSearch,
  requestGithubAuthorization,
  type GithubSubmission,
  type GithubVerificationErrorCode,
} from "@/lib/github-verification";

export const Route = createFileRoute("/verify/github")({
  validateSearch: parseGithubVerificationSearch,
  component: GithubVerificationPage,
});

const TESTNET_CLIENT = new ccc.ClientPublicTestnet();
const TESTNET_EXPLORER = "https://testnet.explorer.nervos.org";

function shorten(value: string, start = 16, end = 8): string {
  return value.length > start + end + 3 ? `${value.slice(0, start)}...${value.slice(-end)}` : value;
}

function GithubVerificationPage() {
  useDocumentTitle("Connect GitHub");
  const search = Route.useSearch();
  const submission = githubSubmissionFromSearch(search);
  const [reportedConfirmation, setReportedConfirmation] = useState<{
    transactionHash: ccc.Hex;
    result?: GithubClaimConfirmation;
  }>();
  const confirmation =
    submission && reportedConfirmation?.transactionHash === submission.transactionHash
      ? reportedConfirmation.result
      : undefined;

  return (
    <div className="github-verification-page">
      <header className="github-verification-header">
        <div>
          <span className="github-verification-kicker">
            <Github size={15} aria-hidden="true" /> Account verification
          </span>
          <h1>Connect GitHub</h1>
          <p>Attach a verified GitHub account to a did:ckb identity you control.</p>
        </div>
        <StatusMark tone="info" icon={false}>
          CKB Testnet
        </StatusMark>
      </header>

      <VerificationSteps confirmation={submission ? confirmation : null} />

      <div className="github-verification-workspace">
        <main className="github-verification-primary">
          {search.status === "submitted" && !submission ? (
            <IncompleteResult />
          ) : submission ? (
            <SubmittedVerification
              submission={submission}
              onConfirmation={setReportedConfirmation}
            />
          ) : (
            <ConnectionPanel
              callbackError={search.status === "error" ? search.code : undefined}
              retryAt={search.retryAt}
            />
          )}
        </main>
        <ProtocolSummary submission={submission} />
      </div>
    </div>
  );
}

function VerificationSteps({
  confirmation,
}: {
  confirmation: GithubClaimConfirmation | null | undefined;
}) {
  const completed = confirmation === null ? 0 : confirmation?.state === "confirmed" ? 3 : 1;
  const active =
    confirmation === null
      ? 0
      : confirmation?.state === "indexing"
        ? 2
        : confirmation?.state === "confirmed"
          ? -1
          : 1;
  const steps = [
    ["Authorize", "GitHub account"],
    ["Submit", "Claim transaction"],
    ["Confirm", "Live Claim Cell"],
  ] as const;

  return (
    <ol className="github-verification-steps" aria-label="Verification progress">
      {steps.map(([label, detail], index) => {
        const isComplete = index < completed;
        return (
          <li
            key={label}
            className={
              isComplete
                ? "github-verification-step github-verification-step--complete"
                : index === active
                  ? "github-verification-step github-verification-step--active"
                  : "github-verification-step"
            }
            aria-current={index === active ? "step" : undefined}
          >
            <span>{isComplete ? <Check size={13} aria-hidden="true" /> : `0${index + 1}`}</span>
            <div>
              <strong>{label}</strong>
              <small>{detail}</small>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function ConnectionPanel({
  callbackError,
  retryAt,
}: {
  callbackError?: GithubVerificationErrorCode;
  retryAt?: number;
}) {
  const signer = useSigner();
  const { open } = useCcc();
  const [lock, setLock] = useState<ccc.Script | null>(null);
  const [lockError, setLockError] = useState(false);
  const [selectedDid, setSelectedDid] = useState("");
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    setSelectedDid("");
    setLock(null);
    setLockError(false);
    if (!signer) {
      return;
    }
    void signer
      .getRecommendedAddressObj()
      .then((address) => {
        if (!cancelled) setLock(address.script);
      })
      .catch(() => {
        if (!cancelled) setLockError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [signer]);

  const identities = useQuery({
    queryKey: ["github-verification-dids", lock?.codeHash, lock?.hashType, lock?.args],
    queryFn: async () => {
      if (!lock) return [] as DidRecord[];
      return listDidsByLock(TESTNET_CLIENT, lock);
    },
    enabled: !!lock,
  });

  useEffect(() => {
    const records = identities.data ?? [];
    if (records.length === 0) {
      setSelectedDid("");
      return;
    }
    if (!records.some((record) => record.did === selectedDid)) {
      setSelectedDid(records[0].did);
    }
  }, [identities.data, selectedDid]);

  async function startVerification() {
    if (!selectedDid || starting) return;
    setStartError(undefined);
    setStarting(true);
    try {
      const authorizationUrl = await requestGithubAuthorization(selectedDid);
      window.location.assign(authorizationUrl);
    } catch (error) {
      setStartError(
        error instanceof GithubVerificationRequestError
          ? error.message
          : "GitHub verification could not be started.",
      );
      setStarting(false);
    }
  }

  const records = identities.data ?? [];
  const retryDate = retryAt && retryAt * 1_000 > Date.now() ? new Date(retryAt * 1_000) : undefined;

  return (
    <section aria-labelledby="github-connect-title">
      <div className="github-verification-section-heading">
        <span>Account source</span>
        <h2 id="github-connect-title">GitHub account</h2>
        <p>Vellum reads your account identity, then releases the OAuth access before issuance.</p>
      </div>

      {(callbackError || startError) && (
        <div className="github-verification-alert" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          <div>
            <strong>Verification did not complete</strong>
            <p>{startError ?? githubVerificationErrorMessage(callbackError)}</p>
            {retryDate && (
              <p>
                Try again after{" "}
                <time dateTime={retryDate.toISOString()}>{retryDate.toLocaleString()}</time>.
              </p>
            )}
          </div>
        </div>
      )}

      {!signer ? (
        <div className="github-verification-empty">
          <WalletCards size={24} strokeWidth={1.7} aria-hidden="true" />
          <h3>Connect your wallet</h3>
          <p>Your Testnet identities are loaded from the lock controlled by your wallet.</p>
          <button className="v-button v-button--primary" type="button" onClick={() => open()}>
            <WalletCards size={15} aria-hidden="true" /> Connect wallet
          </button>
        </div>
      ) : lockError ? (
        <div className="github-verification-alert" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          <div>
            <strong>Wallet address unavailable</strong>
            <p>Reconnect the wallet, then try loading your Testnet identities again.</p>
          </div>
        </div>
      ) : !lock || identities.isLoading ? (
        <div className="github-verification-loading" role="status" aria-live="polite">
          <span className="pulse-dot" aria-hidden="true" />
          Looking up Testnet identities
        </div>
      ) : identities.isError ? (
        <div className="github-verification-alert" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          <div>
            <strong>Identity lookup failed</strong>
            <p>The CKB Testnet indexer did not return your identities.</p>
            <button
              className="v-button v-button--quiet"
              type="button"
              onClick={() => void identities.refetch()}
            >
              <RefreshCw size={14} aria-hidden="true" /> Retry
            </button>
          </div>
        </div>
      ) : records.length === 0 ? (
        <div className="github-verification-empty">
          <ShieldCheck size={24} strokeWidth={1.7} aria-hidden="true" />
          <h3>No Testnet DID found</h3>
          <p>This wallet does not control a did:ckb identity on CKB Testnet.</p>
          <Link className="v-button v-button--secondary" to="/claim">
            Claim a DID
          </Link>
        </div>
      ) : (
        <div className="github-verification-form">
          {records.length > 1 ? (
            <>
              <label htmlFor="github-subject">Target identity</label>
              <select
                id="github-subject"
                value={selectedDid}
                onChange={(event) => setSelectedDid(event.target.value)}
              >
                {records.map((record) => (
                  <option value={record.did} key={record.did}>
                    {record.profile.displayName
                      ? `${record.profile.displayName} - ${record.did}`
                      : record.did}
                  </option>
                ))}
              </select>
            </>
          ) : (
            <>
              <span className="github-verification-field-label">Target identity</span>
              <div className="github-verification-subject mono">{records[0].did}</div>
            </>
          )}
          <small>The issued Claim Cell will be locked to this identity.</small>

          <div className="github-verification-action">
            <button
              className="v-button v-button--primary"
              type="button"
              disabled={!selectedDid || starting}
              aria-busy={starting}
              onClick={() => void startVerification()}
            >
              <Github size={15} aria-hidden="true" />
              {starting ? "Opening GitHub..." : "Continue with GitHub"}
            </button>
            <span>Authorization expires after five minutes.</span>
          </div>
        </div>
      )}
    </section>
  );
}

function SubmittedVerification({
  submission,
  onConfirmation,
}: {
  submission: GithubSubmission;
  onConfirmation: (confirmation: {
    transactionHash: ccc.Hex;
    result?: GithubClaimConfirmation;
  }) => void;
}) {
  const issuer = useQuery({
    queryKey: ["verification-issuer"],
    queryFn: () => fetchPublicIssuerMetadata(),
    staleTime: Number.POSITIVE_INFINITY,
  });
  const confirmation = useQuery({
    queryKey: [
      "github-claim-confirmation",
      submission.subject,
      submission.transactionHash,
      submission.claimId,
      submission.outputIndex,
      submission.login,
      issuer.data?.did,
    ],
    queryFn: () => confirmGithubClaim(TESTNET_CLIENT, submission, issuer.data!),
    enabled: !!issuer.data,
    retry: false,
    refetchInterval: (query) => {
      const state = query.state.data?.state;
      return state === "confirmed" || state === "rejected" ? false : 3_000;
    },
  });
  const result = confirmation.data;

  useEffect(() => {
    onConfirmation({ transactionHash: submission.transactionHash, result });
  }, [onConfirmation, result, submission.transactionHash]);

  return (
    <section aria-labelledby="github-result-title">
      <div className="github-verification-section-heading">
        <span>Submission</span>
        <h2 id="github-result-title">@{submission.login}</h2>
        <p>The OAuth credential has been released. Only public claim data remains.</p>
      </div>

      <ResultStatus
        result={result}
        issuerFailed={issuer.isError}
        claimFailed={confirmation.isError}
      />

      <dl className="github-verification-result-grid">
        <div>
          <dt>Subject</dt>
          <dd className="mono" title={submission.subject}>
            {shorten(submission.subject)}
          </dd>
        </div>
        <div>
          <dt>Schema</dt>
          <dd className="mono">vellum.social.github.v1</dd>
        </div>
        <div>
          <dt>Payer</dt>
          <dd>Vellum issuer</dd>
        </div>
        <div>
          <dt>Output</dt>
          <dd className="mono">{submission.outputIndex}</dd>
        </div>
        <div>
          <dt>Transaction</dt>
          <dd>
            <a
              className="mono"
              href={`${TESTNET_EXPLORER}/transaction/${submission.transactionHash}`}
              target="_blank"
              rel="noreferrer"
              title={submission.transactionHash}
            >
              {shorten(submission.transactionHash)} <ExternalLink size={12} aria-hidden="true" />
            </a>
          </dd>
        </div>
        <div>
          <dt>Claim ID</dt>
          <dd className="mono" title={submission.claimId}>
            {shorten(submission.claimId)}
          </dd>
        </div>
      </dl>

      {(issuer.isError || confirmation.isError) && (
        <button
          className="v-button v-button--quiet"
          type="button"
          onClick={() => void (issuer.isError ? issuer.refetch() : confirmation.refetch())}
        >
          <RefreshCw size={14} aria-hidden="true" /> Check again
        </button>
      )}
    </section>
  );
}

function ResultStatus({
  result,
  issuerFailed,
  claimFailed,
}: {
  result?: GithubClaimConfirmation;
  issuerFailed: boolean;
  claimFailed: boolean;
}) {
  if (issuerFailed || claimFailed) {
    return (
      <div className="github-verification-alert" role="alert">
        <AlertCircle size={18} aria-hidden="true" />
        <div>
          <strong>Confirmation is temporarily unavailable</strong>
          <p>The submitted transaction reference is preserved. Check it again shortly.</p>
        </div>
      </div>
    );
  }
  if (result?.state === "rejected") {
    return (
      <div className="github-verification-alert" role="alert">
        <AlertCircle size={18} aria-hidden="true" />
        <div>
          <strong>Transaction rejected</strong>
          <p>No live GitHub Claim Cell was created.</p>
        </div>
      </div>
    );
  }
  if (result?.state === "confirmed") {
    return (
      <div
        className="github-verification-status github-verification-status--confirmed"
        role="status"
      >
        <Check size={18} aria-hidden="true" />
        <div>
          <StatusMark tone="positive">Claim confirmed</StatusMark>
          <p>
            The claim is live, readable through the Vellum SDK, and backed by an active issuer DID.
          </p>
        </div>
      </div>
    );
  }
  if (result?.state === "indexing") {
    return (
      <div className="github-verification-status" role="status" aria-live="polite">
        <Clock3 size={18} aria-hidden="true" />
        <div>
          <StatusMark tone="warning" icon={false}>
            Indexing claim
          </StatusMark>
          <p>The transaction is committed. Waiting for the Testnet indexer to expose the claim.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="github-verification-status" role="status" aria-live="polite">
      <span className="pulse-dot" aria-hidden="true" />
      <div>
        <StatusMark tone="info" icon={false}>
          Transaction pending
        </StatusMark>
        <p>Waiting for the issuer-submitted transaction to commit on CKB Testnet.</p>
      </div>
    </div>
  );
}

function IncompleteResult() {
  return (
    <section aria-labelledby="github-incomplete-title">
      <div className="github-verification-alert" role="alert">
        <AlertCircle size={18} aria-hidden="true" />
        <div>
          <strong id="github-incomplete-title">Incomplete callback result</strong>
          <p>The public claim references were missing or invalid. Start a new verification.</p>
          <Link className="v-button v-button--quiet" to="/verify/github" search={{}}>
            Start again
          </Link>
        </div>
      </div>
    </section>
  );
}

function ProtocolSummary({ submission }: { submission?: GithubSubmission }) {
  return (
    <aside className="github-verification-summary" aria-label="Verification details">
      <div>
        <span>Claim policy</span>
        <h2>What is recorded</h2>
      </div>
      <dl>
        <div>
          <dt>GitHub access</dt>
          <dd>read:user</dd>
        </div>
        <div>
          <dt>Claim fields</dt>
          <dd>User ID, login, profile URL, account age, verification time</dd>
        </div>
        <div>
          <dt>Authorization</dt>
          <dd>Vellum issuer DID</dd>
        </div>
        <div>
          <dt>Capacity and fee</dt>
          <dd>Paid by issuer</dd>
        </div>
        <div>
          <dt>OAuth credential</dt>
          <dd>{submission ? "Released" : "Released before issuance"}</dd>
        </div>
      </dl>
      <p>
        The claim is public on CKB Testnet. Your GitHub token is not stored in the claim or returned
        to the dashboard.
      </p>
    </aside>
  );
}
