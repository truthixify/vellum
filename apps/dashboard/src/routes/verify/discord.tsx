import { ccc, useCcc, useSigner } from "@ckb-ccc/connector-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { StatusMark } from "@vellum/ui";
import {
  AlertCircle,
  ArrowLeft,
  CalendarDays,
  Check,
  Clock3,
  ExternalLink,
  MessagesSquare,
  RefreshCw,
  ShieldCheck,
  Users,
  WalletCards,
} from "lucide-react";
import { useEffect, useState } from "react";

import { useDocumentTitle } from "@/hooks/use-document-title";
import { reputationQueryKey } from "@/hooks/use-reputation";
import { useActiveIdentity } from "@/lib/active-identity-context";
import { listDidsByLock, type DidRecord } from "@/lib/did-ckb";
import {
  confirmDiscordClaims,
  readDiscordAccountClaims,
  type DiscordAccountClaim,
  type DiscordClaimConfirmation,
} from "@/lib/discord-claim-reader";
import {
  DiscordVerificationRequestError,
  discordSubmissionFromSearch,
  discordVerificationErrorMessage,
  parseDiscordVerificationSearch,
  requestDiscordAuthorization,
  type DiscordSubmission,
  type DiscordVerificationErrorCode,
} from "@/lib/discord-verification";
import { fetchPublicIssuerMetadata } from "@/lib/verification-issuer";

export const Route = createFileRoute("/verify/discord")({
  validateSearch: parseDiscordVerificationSearch,
  component: DiscordVerificationPage,
});

const TESTNET_CLIENT = new ccc.ClientPublicTestnet();
const TESTNET_EXPLORER = "https://testnet.explorer.nervos.org";

function shorten(value: string, start = 16, end = 8): string {
  return value.length > start + end + 3 ? `${value.slice(0, start)}...${value.slice(-end)}` : value;
}

function formatDate(timestamp: number | bigint): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
    Number(timestamp) * 1_000,
  );
}

function DiscordVerificationPage() {
  useDocumentTitle("Discord verification");
  const queryClient = useQueryClient();
  const search = Route.useSearch();
  const submission = discordSubmissionFromSearch(search);
  const [existingClaimCount, setExistingClaimCount] = useState(0);
  const [reportedConfirmation, setReportedConfirmation] = useState<{
    transactionHash: ccc.Hex;
    result?: DiscordClaimConfirmation;
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
            <MessagesSquare size={15} aria-hidden="true" /> Discord verification
          </span>
          <h1>Discord verification</h1>
          <p>
            Verify a Discord account and current membership in recognized CKB communities for a
            did:ckb identity you control.
          </p>
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
            <ConnectionPanel
              callbackError={search.status === "error" ? search.code : undefined}
              retryAt={search.retryAt}
              onExistingClaimsChange={setExistingClaimCount}
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
  hasExistingClaim,
}: {
  confirmation: DiscordClaimConfirmation | null | undefined;
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
    ["Authorize", "Discord account"],
    ["Submit", "Claim transaction"],
    ["Confirm", "Live Claim Cells"],
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
  callbackError,
  retryAt,
  onExistingClaimsChange,
}: {
  callbackError?: DiscordVerificationErrorCode;
  retryAt?: number;
  onExistingClaimsChange: (count: number) => void;
}) {
  const signer = useSigner();
  const { open } = useCcc();
  const { activeDid, setActiveDid } = useActiveIdentity();
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
    queryKey: ["discord-verification-dids", lock?.codeHash, lock?.hashType, lock?.args],
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

  const issuer = useQuery({
    queryKey: ["verification-issuer"],
    queryFn: () => fetchPublicIssuerMetadata(),
    enabled: !!selectedDid,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const existingClaims = useQuery({
    queryKey: ["discord-account-claims", selectedDid, issuer.data?.did],
    queryFn: () => readDiscordAccountClaims(TESTNET_CLIENT, selectedDid, issuer.data!),
    enabled: !!selectedDid && !!issuer.data,
    retry: false,
    staleTime: 30_000,
  });

  useEffect(() => {
    onExistingClaimsChange(existingClaims.data?.length ?? 0);
  }, [existingClaims.data, onExistingClaimsChange, selectedDid]);

  async function startVerification() {
    if (!selectedDid || starting) return;
    setStartError(undefined);
    setStarting(true);
    try {
      if (!signer) throw new DiscordVerificationRequestError("subject_control_invalid");
      const authorizationUrl = await requestDiscordAuthorization(selectedDid, signer);
      window.location.assign(authorizationUrl);
    } catch (error) {
      setStartError(
        error instanceof DiscordVerificationRequestError
          ? error.message
          : "Discord verification could not be started.",
      );
      setStarting(false);
    }
  }

  const records = identities.data ?? [];
  const retryDate = retryAt && retryAt * 1_000 > Date.now() ? new Date(retryAt * 1_000) : undefined;

  return (
    <section aria-labelledby="discord-connect-title">
      <div className="account-verification-section-heading">
        <span>Account source</span>
        <h2 id="discord-connect-title">Discord account</h2>
        <p>
          Vellum checks your account and recognized CKB communities, then releases OAuth access
          before issuance.
        </p>
      </div>

      {(callbackError || startError) && (
        <div className="account-verification-alert" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          <div>
            <strong>Verification did not complete</strong>
            <p>{startError ?? discordVerificationErrorMessage(callbackError)}</p>
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
          <span className="pulse-dot" aria-hidden="true" />
          Looking up Testnet identities
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
        <div className="account-verification-form">
          {records.length > 1 ? (
            <>
              <label htmlFor="discord-subject">Target identity</label>
              <select
                id="discord-subject"
                value={selectedDid}
                onChange={(event) => {
                  onExistingClaimsChange(0);
                  setSelectedDid(event.target.value);
                  setActiveDid(event.target.value);
                  if (issuer.isError) void issuer.refetch();
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
          <small>Identity and community Claim Cells will be locked to this DID.</small>

          {issuer.isError || existingClaims.isError ? (
            <div
              className="account-verification-alert account-verification-alert--inline"
              role="alert"
            >
              <AlertCircle size={18} aria-hidden="true" />
              <div>
                <strong>Discord claim status unavailable</strong>
                <p>Vellum could not check this identity's active Discord claims.</p>
                <button
                  className="v-button v-button--quiet"
                  type="button"
                  onClick={() =>
                    void (issuer.isError ? issuer.refetch() : existingClaims.refetch())
                  }
                >
                  <RefreshCw size={14} aria-hidden="true" /> Retry
                </button>
              </div>
            </div>
          ) : issuer.isPending || existingClaims.isPending ? (
            <div className="account-verification-claim-loading" role="status" aria-live="polite">
              <span className="pulse-dot" aria-hidden="true" />
              Checking existing Discord claims for {shorten(selectedDid)}
            </div>
          ) : (existingClaims.data ?? []).length > 0 ? (
            <ExistingDiscordClaims
              claims={existingClaims.data ?? []}
              starting={starting}
              onVerifyAgain={() => void startVerification()}
            />
          ) : (
            <div className="account-verification-action">
              <button
                className="v-button v-button--primary"
                type="button"
                disabled={!selectedDid || starting}
                aria-busy={starting}
                onClick={() => void startVerification()}
              >
                <MessagesSquare size={15} aria-hidden="true" />
                {starting ? "Opening Discord..." : "Continue with Discord"}
              </button>
              <span>Authorization expires after five minutes.</span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function ExistingDiscordClaims({
  claims,
  starting,
  onVerifyAgain,
}: {
  claims: DiscordAccountClaim[];
  starting: boolean;
  onVerifyAgain: () => void;
}) {
  return (
    <div className="account-verification-existing">
      <div className="account-verification-existing__heading">
        <span aria-hidden="true">
          <Check size={18} />
        </span>
        <div>
          <StatusMark tone="positive">Verified on-chain</StatusMark>
          <p>
            {claims.length === 1
              ? "This DID has an active Discord identity claim."
              : `This DID has ${claims.length} active Discord identity claims.`}
          </p>
        </div>
      </div>

      <ul className="account-verification-account-list">
        {claims.map((claim) => (
          <li className="account-verification-account" key={claim.claimId}>
            <div className="account-verification-account-list__identity">
              <MessagesSquare size={18} strokeWidth={1.7} aria-hidden="true" />
              <span>
                <strong>@{claim.account.username}</strong>
                <small>Verified {formatDate(claim.account.verified_at)}</small>
              </span>
            </div>
            {claim.community ? (
              <div className="account-verification-community-list">
                {claim.community.community.memberships.map((membership) => (
                  <div key={membership.guild_id}>
                    <span>
                      <Users size={13} aria-hidden="true" /> {membership.community_name}
                    </span>
                    <small>
                      Joined {formatDate(membership.joined_at)}
                      {membership.recognized_roles.length > 0
                        ? ` · ${membership.recognized_roles.map((role) => role.role_name).join(", ")}`
                        : ""}
                    </small>
                  </div>
                ))}
                <small className="account-verification-community-expiry">
                  <CalendarDays size={12} aria-hidden="true" /> Current until{" "}
                  {formatDate(claim.community.expiresAt)}
                </small>
              </div>
            ) : (
              <span className="account-verification-community-empty">
                No current CKB community evidence
              </span>
            )}
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

      <div className="account-verification-existing__footer">
        <span>Reconnect to refresh current community membership evidence.</span>
        <button
          className="v-button v-button--secondary"
          type="button"
          disabled={starting}
          aria-busy={starting}
          onClick={onVerifyAgain}
        >
          <RefreshCw size={14} aria-hidden="true" />
          {starting ? "Opening Discord..." : "Refresh evidence"}
        </button>
      </div>
    </div>
  );
}

function SubmittedVerification({
  submission,
  onConfirmation,
}: {
  submission: DiscordSubmission;
  onConfirmation: (confirmation: {
    transactionHash: ccc.Hex;
    result?: DiscordClaimConfirmation;
  }) => void;
}) {
  const issuer = useQuery({
    queryKey: ["verification-issuer"],
    queryFn: () => fetchPublicIssuerMetadata(),
    staleTime: Number.POSITIVE_INFINITY,
  });
  const confirmation = useQuery({
    queryKey: [
      "discord-claim-confirmation",
      submission.subject,
      submission.transactionHash,
      submission.claimId,
      submission.outputIndex,
      submission.communityClaimId,
      submission.communityOutputIndex,
      submission.username,
      submission.communityCount,
      issuer.data?.did,
    ],
    queryFn: () => confirmDiscordClaims(TESTNET_CLIENT, submission, issuer.data!),
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
    <section aria-labelledby="discord-result-title">
      <div className="account-verification-section-heading">
        <span>Submission</span>
        <h2 id="discord-result-title">@{submission.username}</h2>
        <p>
          Discord access has been released. The transaction contains public identity evidence
          {submission.communityCount > 0 ? " and current CKB community evidence" : ""}.
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
          <dt>Identity schema</dt>
          <dd className="mono">vellum.social.discord.v1</dd>
        </div>
        <div>
          <dt>CKB communities</dt>
          <dd>{submission.communityCount}</dd>
        </div>
        <div>
          <dt>Identity output</dt>
          <dd className="mono">{submission.outputIndex}</dd>
        </div>
        {submission.communityOutputIndex !== undefined ? (
          <div>
            <dt>Community output</dt>
            <dd className="mono">{submission.communityOutputIndex}</dd>
          </div>
        ) : null}
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
          <dt>Identity claim ID</dt>
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
  result?: DiscordClaimConfirmation;
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
          <p>No live Discord Claim Cells were created.</p>
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
          <StatusMark tone="positive">Claims confirmed</StatusMark>
          <p>
            The claims are live, readable through the Vellum SDK, and backed by an active issuer
            DID.
          </p>
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
            Indexing claims
          </StatusMark>
          <p>The transaction is committed. Waiting for the Testnet indexer to expose its claims.</p>
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
        <p>Vellum submitted the claims. Waiting for the transaction to commit on CKB Testnet.</p>
      </div>
    </div>
  );
}

function IncompleteResult() {
  return (
    <section aria-labelledby="discord-incomplete-title">
      <div className="account-verification-alert" role="alert">
        <AlertCircle size={18} aria-hidden="true" />
        <div>
          <strong id="discord-incomplete-title">Incomplete callback result</strong>
          <p>The public claim references were missing or invalid. Start a new verification.</p>
          <Link className="v-button v-button--quiet" to="/verify/discord" search={{}}>
            Start again
          </Link>
        </div>
      </div>
    </section>
  );
}

function ProtocolSummary({ submission }: { submission?: DiscordSubmission }) {
  return (
    <aside className="account-verification-summary" aria-label="Verification details">
      <div>
        <span>Claim policy</span>
        <h2>What is recorded</h2>
      </div>
      <dl>
        <div>
          <dt>Discord access</dt>
          <dd>Identity and configured server membership</dd>
        </div>
        <div>
          <dt>Identity claim</dt>
          <dd>User ID, username, account age, verification time</dd>
        </div>
        <div>
          <dt>Community claim</dt>
          <dd>CKB server, join date, recognized roles; valid for 30 days</dd>
        </div>
        <div>
          <dt>Not collected</dt>
          <dd>Messages, unrelated servers, channels, email, and activity history</dd>
        </div>
        <div>
          <dt>Submission</dt>
          <dd>Separate claim outputs in one transaction</dd>
        </div>
        <div>
          <dt>OAuth credential</dt>
          <dd>{submission ? "Released" : "Released before issuance"}</dd>
        </div>
      </dl>
      <p>
        The claims are public on CKB Testnet. Discord credentials are not stored in either claim or
        returned to the dashboard.
      </p>
    </aside>
  );
}
