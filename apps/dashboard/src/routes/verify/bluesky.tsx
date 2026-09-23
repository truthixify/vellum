import { ccc, useCcc, useSigner } from "@ckb-ccc/connector-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { BLUESKY_HANDLE_PATTERN } from "@vellum/schemas";
import { StatusMark } from "@vellum/ui";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Clock3,
  ExternalLink,
  Eye,
  EyeOff,
  RefreshCw,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";

import { ProviderMark } from "@/components/verification/ProviderMark";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { reputationQueryKey } from "@/hooks/use-reputation";
import { useActiveIdentity } from "@/lib/active-identity-context";
import {
  confirmBlueskyClaim,
  readBlueskyAccountClaims,
  type BlueskyAccountClaim,
  type BlueskyClaimConfirmation,
} from "@/lib/bluesky-claim-reader";
import {
  BlueskyVerificationRequestError,
  blueskySubmissionFromSearch,
  blueskySubmissionSearch,
  blueskyVerificationErrorMessage,
  fetchBlueskyFormSpec,
  parseBlueskyVerificationSearch,
  submitBlueskyVerification,
  type BlueskySubmission,
} from "@/lib/bluesky-verification";
import { listDidsByLock, type DidRecord } from "@/lib/did-ckb";
import { fetchPublicIssuerMetadata } from "@/lib/verification-issuer";

export const Route = createFileRoute("/verify/bluesky")({
  validateSearch: parseBlueskyVerificationSearch,
  component: BlueskyVerificationPage,
});

const TESTNET_CLIENT = new ccc.ClientPublicTestnet();
const TESTNET_EXPLORER = "https://testnet.explorer.nervos.org";
const BLUESKY_APP_PASSWORD_PATTERN = /^[a-z0-9]{4}(?:-[a-z0-9]{4}){3}$/;
const BLUESKY_USERNAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

function normalizeHandleInput(value: string): string {
  const handle = value.trim().replace(/^@/, "").toLowerCase();
  return BLUESKY_USERNAME_PATTERN.test(handle) ? `${handle}.bsky.social` : handle;
}

function shorten(value: string, start = 16, end = 8): string {
  return value.length > start + end + 3 ? `${value.slice(0, start)}...${value.slice(-end)}` : value;
}

function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(timestamp * 1_000);
}

function BlueskyVerificationPage() {
  useDocumentTitle("Bluesky verification");
  const queryClient = useQueryClient();
  const search = Route.useSearch();
  const submission = blueskySubmissionFromSearch(search);
  const [existingClaimCount, setExistingClaimCount] = useState(0);
  const [reportedConfirmation, setReportedConfirmation] = useState<{
    transactionHash: ccc.Hex;
    result?: BlueskyClaimConfirmation;
  }>();
  const confirmation =
    submission && reportedConfirmation?.transactionHash === submission.transactionHash
      ? reportedConfirmation.result
      : undefined;
  const confirmedSubject = confirmation?.state === "confirmed" ? submission?.subject : undefined;

  useEffect(() => {
    if (confirmedSubject) {
      void queryClient.invalidateQueries({ queryKey: reputationQueryKey(confirmedSubject) });
    }
  }, [confirmedSubject, queryClient]);

  return (
    <div className="account-verification-page">
      <Link className="account-verification-back" to="/verify">
        <ArrowLeft size={14} aria-hidden="true" /> Verification
      </Link>
      <header className="account-verification-header">
        <div>
          <span className="account-verification-kicker">
            <ProviderMark provider="bluesky" size={15} /> Bluesky verification
          </span>
          <h1>Bluesky verification</h1>
          <p>Link a stable AT Protocol identity to a did:ckb identity you control.</p>
        </div>
        <StatusMark tone="info" icon={false}>
          CKB Testnet
        </StatusMark>
      </header>

      <VerificationSteps
        confirmation={submission ? confirmation : null}
        hasExistingClaim={!submission && existingClaimCount > 0}
      />

      <div className="account-verification-workspace">
        <main className="account-verification-primary">
          {search.status === "submitted" && !submission ? (
            <IncompleteResult />
          ) : submission ? (
            <SubmittedVerification
              submission={submission}
              onConfirmation={setReportedConfirmation}
            />
          ) : (
            <ConnectionPanel onExistingClaimsChange={setExistingClaimCount} />
          )}
        </main>
        <ProtocolSummary submission={submission} />
      </div>
    </div>
  );
}

function VerificationSteps({
  confirmation,
  hasExistingClaim,
}: {
  confirmation: BlueskyClaimConfirmation | null | undefined;
  hasExistingClaim: boolean;
}) {
  const completed = hasExistingClaim
    ? 3
    : confirmation === null
      ? 0
      : confirmation?.state === "confirmed"
        ? 3
        : 1;
  const active = hasExistingClaim
    ? -1
    : confirmation === null
      ? 0
      : confirmation?.state === "indexing"
        ? 2
        : confirmation?.state === "confirmed"
          ? -1
          : 1;
  const steps = [
    ["Verify", "Bluesky account"],
    ["Issue", "Vellum claim transaction"],
    ["Confirm", "Live claim"],
  ] as const;

  return (
    <ol className="account-verification-steps" aria-label="Verification progress">
      {steps.map(([label, detail], index) => {
        const isComplete = index < completed;
        return (
          <li
            key={label}
            className={
              isComplete
                ? "account-verification-step account-verification-step--complete"
                : index === active
                  ? "account-verification-step account-verification-step--active"
                  : "account-verification-step"
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
  onExistingClaimsChange,
}: {
  onExistingClaimsChange: (count: number) => void;
}) {
  const signer = useSigner();
  const { open } = useCcc();
  const navigate = Route.useNavigate();
  const { activeDid, setActiveDid } = useActiveIdentity();
  const [lock, setLock] = useState<ccc.Script | null>(null);
  const [lockError, setLockError] = useState(false);
  const [selectedDid, setSelectedDid] = useState("");
  const [handle, setHandle] = useState("");
  const [appPassword, setAppPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [requestError, setRequestError] = useState<string>();
  const [retryAt, setRetryAt] = useState<number>();

  useEffect(() => {
    let cancelled = false;
    setSelectedDid("");
    setLock(null);
    setLockError(false);
    if (!signer) return;
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
    queryKey: ["bluesky-verification-dids", lock?.codeHash, lock?.hashType, lock?.args],
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
      setSelectedDid(
        activeDid && records.some((record) => record.did === activeDid)
          ? activeDid
          : records[0].did,
      );
    }
  }, [activeDid, identities.data, selectedDid]);

  const formSpec = useQuery({
    queryKey: ["bluesky-verification-form"],
    queryFn: () => fetchBlueskyFormSpec(),
    enabled: !!selectedDid,
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const issuer = useQuery({
    queryKey: ["verification-issuer"],
    queryFn: () => fetchPublicIssuerMetadata(),
    enabled: !!selectedDid,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const existingClaims = useQuery({
    queryKey: ["bluesky-account-claims", selectedDid, issuer.data?.did],
    queryFn: () => readBlueskyAccountClaims(TESTNET_CLIENT, selectedDid, issuer.data!),
    enabled: !!selectedDid && !!issuer.data,
    retry: false,
    staleTime: 30_000,
  });

  useEffect(() => {
    onExistingClaimsChange(existingClaims.data?.length ?? 0);
  }, [existingClaims.data, onExistingClaimsChange, selectedDid]);

  const normalizedHandle = normalizeHandleInput(handle);
  const normalizedAppPassword = appPassword.trim().toLowerCase();
  const canSubmit =
    !!selectedDid &&
    handle.trim().length > 0 &&
    appPassword.trim().length > 0 &&
    !!formSpec.data &&
    !!issuer.data &&
    !submitting;
  const retryDate = retryAt && retryAt * 1_000 > Date.now() ? new Date(retryAt * 1_000) : undefined;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!signer || !canSubmit) return;
    if (!BLUESKY_HANDLE_PATTERN.test(normalizedHandle)) {
      setRequestError("Enter a valid Bluesky handle, such as name.bsky.social.");
      return;
    }
    if (!BLUESKY_APP_PASSWORD_PATTERN.test(normalizedAppPassword)) {
      setRequestError("Use a Bluesky app password in the format xxxx-xxxx-xxxx-xxxx.");
      return;
    }
    setSubmitting(true);
    setRequestError(undefined);
    setRetryAt(undefined);
    const password = normalizedAppPassword;
    setAppPassword("");
    try {
      const result = await submitBlueskyVerification(
        selectedDid,
        { handle: normalizedHandle, appPassword: password },
        signer,
      );
      await navigate({ search: blueskySubmissionSearch(result), replace: true });
    } catch (error) {
      if (error instanceof BlueskyVerificationRequestError) {
        setRequestError(error.message);
        setRetryAt(error.retryAt);
      } else {
        setRequestError(blueskyVerificationErrorMessage());
      }
      setSubmitting(false);
    }
  }

  const records = identities.data ?? [];
  return (
    <section aria-labelledby="bluesky-connect-title">
      <div className="account-verification-section-heading">
        <span>Account source</span>
        <h2 id="bluesky-connect-title">Bluesky account</h2>
        <p>
          Vellum confirms the handle's stable DID, closes temporary access, then issues the claim.
        </p>
      </div>

      {requestError && (
        <div className="account-verification-alert" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          <div>
            <strong>Verification did not complete</strong>
            <p>{requestError}</p>
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
        <div className="account-verification-empty">
          <WalletCards size={24} strokeWidth={1.7} aria-hidden="true" />
          <h3>Connect your wallet</h3>
          <p>Your Testnet identities are loaded from the lock controlled by your wallet.</p>
          <button className="v-button v-button--primary" type="button" onClick={() => open()}>
            <WalletCards size={15} aria-hidden="true" /> Connect wallet
          </button>
        </div>
      ) : lockError ? (
        <div className="account-verification-alert" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          <div>
            <strong>Wallet address unavailable</strong>
            <p>Reconnect the wallet, then try loading your Testnet identities again.</p>
          </div>
        </div>
      ) : !lock || identities.isLoading ? (
        <div className="account-verification-loading" role="status" aria-live="polite">
          <span className="pulse-dot" aria-hidden="true" /> Looking up Testnet identities
        </div>
      ) : identities.isError ? (
        <div className="account-verification-alert" role="alert">
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
        <div className="account-verification-empty">
          <ShieldCheck size={24} strokeWidth={1.7} aria-hidden="true" />
          <h3>No Testnet DID found</h3>
          <p>This wallet does not control a did:ckb identity on CKB Testnet.</p>
          <Link className="v-button v-button--secondary" to="/claim">
            Claim a DID
          </Link>
        </div>
      ) : (
        <form className="account-verification-form" onSubmit={submit}>
          {records.length > 1 ? (
            <>
              <label htmlFor="bluesky-subject">Target identity</label>
              <select
                id="bluesky-subject"
                value={selectedDid}
                onChange={(event) => {
                  onExistingClaimsChange(0);
                  setSelectedDid(event.target.value);
                  setActiveDid(event.target.value);
                }}
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
              <span className="account-verification-field-label">Target identity</span>
              <div className="account-verification-subject mono">{records[0].did}</div>
            </>
          )}
          <small>The issued Claim Cell will be locked to this identity.</small>

          {issuer.isError || existingClaims.isError || formSpec.isError ? (
            <div
              className="account-verification-alert account-verification-alert--inline"
              role="alert"
            >
              <AlertCircle size={18} aria-hidden="true" />
              <div>
                <strong>Bluesky verification unavailable</strong>
                <p>Vellum could not load the verification service or active claims.</p>
                <button
                  className="v-button v-button--quiet"
                  type="button"
                  onClick={() =>
                    void Promise.all([
                      issuer.refetch(),
                      existingClaims.refetch(),
                      formSpec.refetch(),
                    ])
                  }
                >
                  <RefreshCw size={14} aria-hidden="true" /> Retry
                </button>
              </div>
            </div>
          ) : issuer.isPending || existingClaims.isPending || formSpec.isPending ? (
            <div className="account-verification-claim-loading" role="status" aria-live="polite">
              <span className="pulse-dot" aria-hidden="true" /> Checking existing Bluesky claims for{" "}
              {shorten(selectedDid)}
            </div>
          ) : (
            <>
              {existingClaims.data.length > 0 && (
                <ExistingBlueskyClaims claims={existingClaims.data} />
              )}
              <div className="account-verification-credentials">
                <div className="account-verification-credential-field">
                  <label htmlFor="bluesky-handle">Bluesky handle</label>
                  <input
                    id="bluesky-handle"
                    className="account-verification-input"
                    type="text"
                    autoComplete="username"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    maxLength={253}
                    placeholder="name.bsky.social"
                    value={handle}
                    onChange={(event) => setHandle(event.target.value)}
                    disabled={submitting}
                    required
                  />
                </div>
                <div className="account-verification-credential-field">
                  <label htmlFor="bluesky-app-password">App password</label>
                  <div className="account-verification-password">
                    <input
                      id="bluesky-app-password"
                      className="account-verification-input"
                      type={showPassword ? "text" : "password"}
                      autoComplete="off"
                      maxLength={128}
                      spellCheck={false}
                      aria-describedby="bluesky-app-password-help"
                      value={appPassword}
                      onChange={(event) => setAppPassword(event.target.value)}
                      disabled={submitting}
                      required
                    />
                    <button
                      type="button"
                      aria-label={showPassword ? "Hide app password" : "Show app password"}
                      title={showPassword ? "Hide app password" : "Show app password"}
                      onClick={() => setShowPassword((value) => !value)}
                    >
                      {showPassword ? (
                        <EyeOff size={16} aria-hidden="true" />
                      ) : (
                        <Eye size={16} aria-hidden="true" />
                      )}
                    </button>
                  </div>
                </div>
                <p className="account-verification-credential-note" id="bluesky-app-password-help">
                  Use a dedicated{" "}
                  <a href={formSpec.data.appPasswordUrl} target="_blank" rel="noreferrer">
                    Bluesky app password <ExternalLink size={11} aria-hidden="true" />
                  </a>
                  . Vellum does not store it. Revoke it in Bluesky after verification.
                </p>
              </div>
              <div className="account-verification-action">
                <button
                  className="v-button v-button--primary"
                  type="submit"
                  disabled={!canSubmit}
                  aria-busy={submitting}
                >
                  <ProviderMark provider="bluesky" size={15} />
                  {submitting
                    ? "Verifying Bluesky..."
                    : existingClaims.data.length > 0
                      ? "Refresh evidence"
                      : "Verify Bluesky"}
                </button>
                <span>Your wallet confirms which DID receives the claim.</span>
              </div>
            </>
          )}
        </form>
      )}
    </section>
  );
}

function ExistingBlueskyClaims({ claims }: { claims: BlueskyAccountClaim[] }) {
  return (
    <div className="account-verification-existing">
      <div className="account-verification-existing__heading">
        <span aria-hidden="true">
          <Check size={18} />
        </span>
        <div>
          <StatusMark tone="positive">Verified on-chain</StatusMark>
          <p>
            This DID already has{" "}
            {claims.length === 1
              ? "an active Bluesky claim"
              : `${claims.length} active Bluesky claims`}
            .
          </p>
        </div>
      </div>
      <ul className="account-verification-account-list">
        {claims.map((claim) => (
          <li key={claim.claimId}>
            <div className="account-verification-account-list__identity">
              <ProviderMark provider="bluesky" size={18} />
              <span>
                <strong>@{claim.account.handle}</strong>
                <small>Verified {formatDate(claim.account.verified_at)}</small>
              </span>
            </div>
            <div className="account-verification-account-list__actions">
              <a
                className="v-button v-button--quiet"
                href={claim.account.profile_url}
                target="_blank"
                rel="noreferrer"
              >
                Profile <ExternalLink size={13} aria-hidden="true" />
              </a>
              <a
                className="v-button v-button--quiet"
                href={`${TESTNET_EXPLORER}/transaction/${claim.transactionHash}`}
                target="_blank"
                rel="noreferrer"
              >
                Transaction <ExternalLink size={13} aria-hidden="true" />
              </a>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SubmittedVerification({
  submission,
  onConfirmation,
}: {
  submission: BlueskySubmission;
  onConfirmation: (confirmation: {
    transactionHash: ccc.Hex;
    result?: BlueskyClaimConfirmation;
  }) => void;
}) {
  const issuer = useQuery({
    queryKey: ["verification-issuer"],
    queryFn: () => fetchPublicIssuerMetadata(),
    staleTime: Number.POSITIVE_INFINITY,
  });
  const confirmation = useQuery({
    queryKey: [
      "bluesky-claim-confirmation",
      submission.subject,
      submission.transactionHash,
      submission.claimId,
      submission.outputIndex,
      submission.accountDid,
      issuer.data?.did,
    ],
    queryFn: () => confirmBlueskyClaim(TESTNET_CLIENT, submission, issuer.data!),
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
    <section aria-labelledby="bluesky-result-title">
      <div className="account-verification-section-heading">
        <span>Issuance</span>
        <h2 id="bluesky-result-title">@{submission.handle}</h2>
        <p>
          The app password and temporary session are no longer retained. Only public claim data
          remains.
        </p>
      </div>
      <ResultStatus
        result={result}
        issuerFailed={issuer.isError}
        claimFailed={confirmation.isError}
      />
      <dl className="account-verification-result-grid">
        <div>
          <dt>Subject</dt>
          <dd className="mono" title={submission.subject}>
            {shorten(submission.subject)}
          </dd>
        </div>
        <div>
          <dt>Account DID</dt>
          <dd className="mono" title={submission.accountDid}>
            {shorten(submission.accountDid)}
          </dd>
        </div>
        <div>
          <dt>Schema</dt>
          <dd className="mono">vellum.social.bluesky.v1</dd>
        </div>
        <div>
          <dt>Payer</dt>
          <dd>Vellum issuer</dd>
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
  result?: BlueskyClaimConfirmation;
  issuerFailed: boolean;
  claimFailed: boolean;
}) {
  if (issuerFailed || claimFailed) {
    return (
      <div className="account-verification-alert" role="alert">
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
      <div className="account-verification-alert" role="alert">
        <AlertCircle size={18} aria-hidden="true" />
        <div>
          <strong>Transaction rejected</strong>
          <p>No live Bluesky Claim Cell was created.</p>
        </div>
      </div>
    );
  }
  if (result?.state === "confirmed") {
    return (
      <div
        className="account-verification-status account-verification-status--confirmed"
        role="status"
      >
        <Check size={18} aria-hidden="true" />
        <div>
          <StatusMark tone="positive">Claim confirmed</StatusMark>
          <p>The stable Bluesky DID and current handle are live in an active Claim Cell.</p>
        </div>
      </div>
    );
  }
  if (result?.state === "indexing") {
    return (
      <div className="account-verification-status" role="status" aria-live="polite">
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
    <div className="account-verification-status" role="status" aria-live="polite">
      <span className="pulse-dot" aria-hidden="true" />
      <div>
        <StatusMark tone="info" icon={false}>
          Transaction submitted
        </StatusMark>
        <p>Vellum submitted the claim. Waiting for it to commit on CKB Testnet.</p>
      </div>
    </div>
  );
}

function IncompleteResult() {
  return (
    <section aria-labelledby="bluesky-incomplete-title">
      <div className="account-verification-alert" role="alert">
        <AlertCircle size={18} aria-hidden="true" />
        <div>
          <strong id="bluesky-incomplete-title">Incomplete verification result</strong>
          <p>The public claim references were missing or invalid. Start a new verification.</p>
          <Link className="v-button v-button--quiet" to="/verify/bluesky" search={{}}>
            Start again
          </Link>
        </div>
      </div>
    </section>
  );
}

function ProtocolSummary({ submission }: { submission?: BlueskySubmission }) {
  return (
    <aside className="account-verification-summary" aria-label="Verification details">
      <div>
        <span>Claim policy</span>
        <h2>What is recorded</h2>
      </div>
      <dl>
        <div>
          <dt>Account identity</dt>
          <dd>Stable AT Protocol DID and current handle</dd>
        </div>
        <div>
          <dt>Claim issuer</dt>
          <dd>Vellum issuer DID</dd>
        </div>
        <div>
          <dt>Issuance</dt>
          <dd>Automatic after verification</dd>
        </div>
        <div>
          <dt>Network cost</dt>
          <dd>Paid by Vellum</dd>
        </div>
        <div>
          <dt>Temporary session</dt>
          <dd>{submission ? "Closed" : "Closed before issuance"}</dd>
        </div>
        <div>
          <dt>App password</dt>
          <dd>Never written to the claim</dd>
        </div>
      </dl>
      <p>
        The claim is public on CKB Testnet. Revoke the dedicated app password in Bluesky after
        verification.
      </p>
    </aside>
  );
}
