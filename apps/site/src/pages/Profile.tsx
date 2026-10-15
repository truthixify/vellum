import { isDidCkb } from "@ckb-ccc/did-ckb";
import type { Claim, ReadClaimsResult } from "@usevellum/sdk";
import {
  AlertCircle,
  ArrowUpRight,
  Check,
  Copy,
  ExternalLink,
  RefreshCw,
  Search,
  Share2,
} from "lucide-react";
import {
  AvatarMark,
  Button,
  NetworkStatus,
  ProviderMark,
  SignalRail,
  StatusMark,
  useCopyFeedback,
  type StatusTone,
} from "@vellum/ui";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";

import { dashboardUrl } from "../config";
import { profilePath } from "../lib/profile-route";
import {
  loadPublicProfile,
  type ProfileSection,
  type PublicProfileResult,
  type PublicProfileUpdate,
} from "../lib/public-profile";
import {
  verifiedAccounts,
  type AvailablePublicReputation,
  type PublicReputationResponse,
  type PublicVerifiedAccount,
} from "../lib/reputation";

type ProfileViewState = { status: "index" } | { status: "loading" } | PublicProfileResult;
type LoadedProfile = Extract<PublicProfileResult, { status: "available" }>;

const TESTNET_EXPLORER = "https://pudge.explorer.nervos.org/transaction/";
const PROFILE_ORIGIN = "https://usevellum.xyz";
const CATEGORY_LABELS = {
  technical: "Technical",
  contribution: "Contribution",
  community: "Community",
  tenure: "Tenure",
  recency: "Recency",
} as const;
const PLATFORM_LABELS = {
  github: "GitHub",
  discord: "Discord",
  telegram: "Telegram",
  bluesky: "Bluesky",
} as const;
const DATE_FORMATTER = new Intl.DateTimeFormat("en", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

function shorten(value: string, start = 14, end = 8): string {
  return value.length <= start + end + 3
    ? value
    : `${value.slice(0, start)}...${value.slice(-end)}`;
}

function boundedText(value: string | undefined, maximum: number): string | undefined {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  return normalized.slice(0, maximum);
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function safeImageUrl(value: string | undefined): string | undefined {
  if (!value || value.length > 2_048) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function formatTimestamp(value: number | bigint): string {
  const milliseconds = Number(value) * 1_000;
  const date = new Date(milliseconds);
  return Number.isFinite(milliseconds) && !Number.isNaN(date.getTime())
    ? DATE_FORMATTER.format(date)
    : "Unknown date";
}

function referenceKey(transactionHash: string, outputIndex: number | bigint): string {
  return `${transactionHash}:${Number(outputIndex)}`;
}

function useProfileMetadata(did: string | undefined, displayName: string | undefined) {
  useEffect(() => {
    const title = displayName
      ? `${displayName} | Vellum`
      : did
        ? "Public profile | Vellum"
        : "Profiles | Vellum";
    const description = did
      ? `View the public did:ckb identity, verified accounts, Claim Cells, and reputation for ${displayName ?? shorten(did)}.`
      : "Look up a public did:ckb identity, its verified accounts, Claim Cells, and reputation.";
    const canonicalUrl = did ? `${PROFILE_ORIGIN}${profilePath(did)}` : `${PROFILE_ORIGIN}/profile`;

    document.title = title;
    document
      .querySelector<HTMLMetaElement>('meta[name="description"]')
      ?.setAttribute("content", description);
    document
      .querySelector<HTMLMetaElement>('meta[property="og:title"]')
      ?.setAttribute("content", title);
    document
      .querySelector<HTMLMetaElement>('meta[property="og:description"]')
      ?.setAttribute("content", description);
    document
      .querySelector<HTMLMetaElement>('meta[property="og:url"]')
      ?.setAttribute("content", canonicalUrl);
    document
      .querySelector<HTMLMetaElement>('meta[name="twitter:title"]')
      ?.setAttribute("content", title);
    document
      .querySelector<HTMLMetaElement>('meta[name="twitter:description"]')
      ?.setAttribute("content", description);
    document
      .querySelector<HTMLLinkElement>('link[rel="canonical"]')
      ?.setAttribute("href", canonicalUrl);
  }, [did, displayName]);
}

export function Profile({ did, invalidPath = false }: { did?: string; invalidPath?: boolean }) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<ProfileViewState>(() =>
    invalidPath ? { status: "invalid" } : did ? { status: "loading" } : { status: "index" },
  );

  useEffect(() => {
    if (invalidPath) {
      setState({ status: "invalid" });
      return;
    }
    if (!did) {
      setState({ status: "index" });
      return;
    }

    let current = true;
    let claims: LoadedProfile["claims"] = { status: "loading" };
    let reputation: LoadedProfile["reputation"] = { status: "loading" };
    setState({ status: "loading" });

    const applyUpdate = (update: PublicProfileUpdate) => {
      if (!current) return;
      if (update.section === "claims") {
        claims = update.value;
        setState((value) =>
          value.status === "available" ? { ...value, claims: update.value } : value,
        );
        return;
      }
      if (update.section === "reputation") {
        reputation = update.value;
        setState((value) =>
          value.status === "available" ? { ...value, reputation: update.value } : value,
        );
        return;
      }
      setState(
        update.value.status === "available"
          ? { ...update.value, claims, reputation }
          : update.value,
      );
    };

    void loadPublicProfile(did, {}, applyUpdate).then((result) => {
      if (current) setState(result);
    });
    return () => {
      current = false;
    };
  }, [attempt, did, invalidPath]);

  const displayName =
    state.status === "available" ? boundedText(state.identity.profile.displayName, 80) : undefined;
  useProfileMetadata(did, displayName);

  if (state.status === "index") return <ProfileLookup />;
  if (state.status === "loading") return <ProfileLoading />;
  if (state.status === "invalid") {
    return (
      <ProfileState
        eyebrow="Invalid profile"
        title="This is not a valid did:ckb profile"
        message="Check the complete identifier and try again."
        action={
          <a className="v-button v-button--primary" href="/profile">
            Look up a profile
          </a>
        }
      />
    );
  }
  if (state.status === "not-found") {
    return (
      <ProfileState
        eyebrow="Not found"
        title="This identity is not active on Testnet"
        message="No live DID Metadata Cell matches this identifier."
        action={
          <>
            <a className="v-button v-button--primary" href="/profile">
              Look up another DID
            </a>
            <a className="v-button v-button--secondary" href={dashboardUrl("/claim")}>
              Claim an identity
            </a>
          </>
        }
      />
    );
  }
  if (state.status === "unavailable") {
    return (
      <ProfileState
        eyebrow="CKB Testnet"
        title="This profile is temporarily unavailable"
        message={state.message}
        action={
          <Button variant="primary" onClick={() => setAttempt((value) => value + 1)}>
            <RefreshCw size={14} aria-hidden="true" /> Retry
          </Button>
        }
      />
    );
  }

  return <LoadedProfilePage profile={state} onRetry={() => setAttempt((value) => value + 1)} />;
}

function ProfileLookup() {
  const [value, setValue] = useState("");
  const [message, setMessage] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const did = value.trim();
    if (!isDidCkb(did)) {
      setMessage("Enter a complete did:ckb identifier.");
      return;
    }
    window.location.assign(profilePath(did));
  }

  return (
    <section className="profile-lookup">
      <div className="profile-lookup__inner">
        <NetworkStatus />
        <h1>Find a public profile</h1>
        <p>
          Read an identity, its Claim Cells, and its current reputation without connecting a wallet.
        </p>
        <form className="profile-lookup__form" onSubmit={submit} noValidate>
          <label htmlFor="profile-did">did:ckb identifier</label>
          <div>
            <input
              id="profile-did"
              value={value}
              onChange={(event) => {
                setValue(event.target.value);
                if (message) setMessage("");
              }}
              placeholder="did:ckb:..."
              autoComplete="off"
              spellCheck={false}
              aria-invalid={message ? "true" : undefined}
              aria-describedby={message ? "profile-did-error" : undefined}
            />
            <Button type="submit" variant="primary">
              <Search size={15} aria-hidden="true" /> View profile
            </Button>
          </div>
          {message && <small id="profile-did-error">{message}</small>}
        </form>
        <a href="/resolve">
          Open the DID resolver <ArrowUpRight size={13} aria-hidden="true" />
        </a>
      </div>
    </section>
  );
}

function ProfileState({
  eyebrow,
  title,
  message,
  action,
}: {
  eyebrow: string;
  title: string;
  message: string;
  action: ReactNode;
}) {
  return (
    <section className="simple-page profile-state">
      <div className="simple-page__inner">
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{message}</p>
        <div className="profile-state__actions">{action}</div>
      </div>
    </section>
  );
}

function ProfileLoading() {
  return (
    <div className="profile-page profile-loading" role="status" aria-label="Loading public profile">
      <section className="profile-heading site-content">
        <div className="profile-skeleton profile-skeleton--crumb" />
        <div className="profile-identity">
          <div className="profile-skeleton profile-skeleton--avatar" />
          <div className="profile-loading__identity">
            <div className="profile-skeleton profile-skeleton--title" />
            <div className="profile-skeleton profile-skeleton--did" />
          </div>
        </div>
      </section>
      <section className="profile-accounts site-content">
        <div className="profile-skeleton profile-skeleton--heading" />
        <div className="profile-skeleton profile-skeleton--row" />
      </section>
      <section className="profile-summary site-content">
        <div className="profile-skeleton profile-skeleton--panel" />
        <div className="profile-skeleton profile-skeleton--panel" />
      </section>
      <section className="profile-ledger site-content">
        <div className="profile-skeleton profile-skeleton--heading" />
        <div className="profile-skeleton profile-skeleton--row" />
        <div className="profile-skeleton profile-skeleton--row" />
      </section>
      <span className="sr-only">Loading identity, Claim Cells, and reputation.</span>
    </div>
  );
}

function LoadedProfilePage({ profile, onRetry }: { profile: LoadedProfile; onRetry: () => void }) {
  const did = profile.identity.did;
  const name = boundedText(profile.identity.profile.displayName, 80) ?? shorten(did, 12, 6);
  const bio = boundedText(profile.identity.profile.bio, 320);
  const avatar = safeImageUrl(profile.identity.profile.avatar);
  const { copied: didCopied, copy: copyDid } = useCopyFeedback();
  const { copied: linkCopied, copy: copyLink } = useCopyFeedback();
  const [actionMessage, setActionMessage] = useState("");

  async function copyIdentifier() {
    try {
      await copyDid(did);
      setActionMessage("");
    } catch {
      setActionMessage("Copying is unavailable in this browser.");
    }
  }

  async function shareProfile() {
    const url = `${PROFILE_ORIGIN}${profilePath(did)}`;
    const shareData = {
      title: `${name} | Vellum`,
      text: `View ${name}'s public Vellum profile.`,
      url,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
        setActionMessage("");
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }

    try {
      await copyLink(url);
      setActionMessage("");
    } catch {
      setActionMessage("Sharing is unavailable in this browser.");
    }
  }

  return (
    <div className="profile-page">
      <section className="profile-heading site-content">
        <div className="breadcrumbs">
          <a href="/profile">Profiles</a>
          <span>/</span>
          <span className="mono">{shorten(did)}</span>
          <NetworkStatus />
        </div>
        <div className="profile-identity">
          <ProfileAvatar did={did} name={name} url={avatar} />
          <div className="profile-identity__copy">
            <h1>{name}</h1>
            <div>
              <span className="mono profile-did" title={did}>
                {did}
              </span>
              <StatusMark tone="positive">Active identity</StatusMark>
            </div>
            {bio && <p className="profile-bio">{bio}</p>}
          </div>
          <div className="profile-identity__actions">
            <button
              className="v-icon-button"
              title={didCopied ? "DID copied" : "Copy DID"}
              aria-label={didCopied ? "DID copied" : "Copy DID"}
              onClick={() => void copyIdentifier()}
            >
              {didCopied ? (
                <Check size={16} aria-hidden="true" />
              ) : (
                <Copy size={16} aria-hidden="true" />
              )}
            </button>
            <button
              className="v-icon-button"
              title={linkCopied ? "Profile link copied" : "Share profile"}
              aria-label={linkCopied ? "Profile link copied" : "Share profile"}
              onClick={() => void shareProfile()}
            >
              {linkCopied ? (
                <Check size={16} aria-hidden="true" />
              ) : (
                <Share2 size={16} aria-hidden="true" />
              )}
            </button>
            <a
              className="v-button v-button--secondary"
              href={`/resolve?did=${encodeURIComponent(did)}`}
            >
              Resolve DID
            </a>
            <a
              className="v-button v-button--primary"
              href={dashboardUrl(`/edit?did=${encodeURIComponent(did)}`)}
            >
              Edit in dashboard <ExternalLink size={13} aria-hidden="true" />
            </a>
            {actionMessage && (
              <span className="profile-action-feedback" role="status">
                {actionMessage}
              </span>
            )}
          </div>
        </div>
      </section>

      <VerifiedAccountsSection reputation={profile.reputation} />
      <ReputationSection reputation={profile.reputation} onRetry={onRetry} />
      <ClaimsSection claims={profile.claims} reputation={profile.reputation} onRetry={onRetry} />
      <ExcludedEvidenceSection claims={profile.claims} reputation={profile.reputation} />
    </div>
  );
}

function ProfileAvatar({ did, name, url }: { did: string; name: string; url?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);

  if (url && !failed) {
    return (
      <img
        className="profile-avatar"
        src={url}
        alt={`${name} profile avatar`}
        width={88}
        height={88}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    );
  }
  return <AvatarMark size="large">{initials(name || did.slice(-2))}</AvatarMark>;
}

function VerifiedAccountsSection({
  reputation,
}: {
  reputation: ProfileSection<PublicReputationResponse>;
}) {
  let content: ReactNode;
  if (reputation.status === "loading") {
    content = <SectionLoading message="Loading verified accounts" />;
  } else if (reputation.status === "unavailable") {
    content = <SectionUnavailable message={reputation.message} />;
  } else if (reputation.value.status === "unavailable") {
    content = <SectionUnavailable message={reputation.value.error.message} />;
  } else {
    const accounts = verifiedAccounts(reputation.value);
    content =
      accounts.length === 0 ? (
        <div className="profile-section-empty">
          No verified accounts are accepted by the current policy.
        </div>
      ) : (
        <div className="profile-account-list">
          {accounts.map((account) => (
            <VerifiedAccount account={account} key={`${account.platform}:${account.id}`} />
          ))}
        </div>
      );
  }

  return (
    <section className="profile-accounts site-content" aria-labelledby="verified-accounts-title">
      <div className="profile-section-heading">
        <div>
          <h2 id="verified-accounts-title">Verified accounts</h2>
          <p>Accounts accepted by the current reputation policy.</p>
        </div>
      </div>
      {content}
    </section>
  );
}

function VerifiedAccount({ account }: { account: PublicVerifiedAccount }) {
  const body = (
    <>
      <span className="profile-account__icon">
        <ProviderMark provider={account.platform} size={18} />
      </span>
      <span className="profile-account__identity">
        <strong>{PLATFORM_LABELS[account.platform]}</strong>
        <small>{account.label.startsWith("@") ? account.label : `@${account.label}`}</small>
      </span>
      <span className="profile-account__issuer" title={account.issuerDid}>
        <small>Issuer</small>
        <span className="mono">{shorten(account.issuerDid, 10, 6)}</span>
      </span>
      <StatusMark tone="positive">Verified</StatusMark>
      {account.profileUrl && <ArrowUpRight size={14} aria-hidden="true" />}
    </>
  );

  return account.profileUrl ? (
    <a className="profile-account" href={account.profileUrl} target="_blank" rel="noreferrer">
      {body}
    </a>
  ) : (
    <div className="profile-account">{body}</div>
  );
}

function ReputationSection({
  reputation,
  onRetry,
}: {
  reputation: ProfileSection<PublicReputationResponse>;
  onRetry: () => void;
}) {
  if (reputation.status === "loading") {
    return (
      <section className="profile-summary site-content" aria-label="Loading reputation">
        <div className="profile-skeleton profile-skeleton--panel" />
        <div className="profile-skeleton profile-skeleton--panel" />
      </section>
    );
  }
  if (reputation.status === "unavailable") {
    return <ProfileDataSection title="Reputation" message={reputation.message} onRetry={onRetry} />;
  }
  if (reputation.value.status === "unavailable") {
    return (
      <ProfileDataSection
        title="Reputation"
        message={reputation.value.error.message}
        onRetry={onRetry}
      />
    );
  }

  const result = reputation.value;
  return (
    <section className="profile-summary site-content" aria-labelledby="reputation-title">
      <div className="profile-score">
        <div className="section-heading-row">
          <h2 id="reputation-title">Reputation</h2>
          <StatusMark tone="positive">{result.policyVersion}</StatusMark>
        </div>
        <div className="score-number">
          <span>{result.overall.score}</span>
          <small>/ {result.overall.maximum}</small>
        </div>
        <SignalRail
          value={result.overall.score}
          max={result.overall.maximum}
          height={10}
          label={`Reputation score ${result.overall.score} of ${result.overall.maximum}`}
        />
        <p>
          Evaluated {formatTimestamp(result.evaluatedAt)} from {result.evidence.length} accepted
          Claim Cell{result.evidence.length === 1 ? "" : "s"}.
        </p>
        <a className="v-button v-button--secondary" href="/transparency">
          Scoring methodology <ArrowUpRight size={13} aria-hidden="true" />
        </a>
      </div>
      <div className="profile-categories">
        <h2>Categories</h2>
        {result.categories.map((category) => (
          <div className="category-row" key={category.id}>
            <span>
              <strong>{CATEGORY_LABELS[category.id]}</strong>
              <b className="mono">
                {category.score} / {category.maximum}
              </b>
            </span>
            <SignalRail
              value={category.score}
              max={category.maximum}
              label={`${CATEGORY_LABELS[category.id]} ${category.score} of ${category.maximum}`}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

function ProfileDataSection({
  title,
  message,
  onRetry,
}: {
  title: string;
  message: string;
  onRetry: () => void;
}) {
  return (
    <section className="profile-data-state site-content">
      <div className="profile-section-heading">
        <h2>{title}</h2>
      </div>
      <div className="notice notice--warning">
        <AlertCircle size={15} aria-hidden="true" />
        <div>
          <strong>{title} is unavailable</strong>
          <p>{message}</p>
          <Button variant="secondary" onClick={onRetry}>
            <RefreshCw size={14} aria-hidden="true" /> Retry
          </Button>
        </div>
      </div>
    </section>
  );
}

function ClaimsSection({
  claims,
  reputation,
  onRetry,
}: {
  claims: ProfileSection<ReadClaimsResult>;
  reputation: ProfileSection<PublicReputationResponse>;
  onRetry: () => void;
}) {
  const availableReputation =
    reputation.status === "available" && reputation.value.status === "available"
      ? reputation.value
      : undefined;

  return (
    <section className="profile-ledger site-content" aria-labelledby="activity-title">
      <div className="profile-ledger__heading">
        <div>
          <h2 id="activity-title">Activity and claims</h2>
          <p>Live Claim Cells held by this identity on CKB Testnet.</p>
        </div>
        {claims.status === "available" && (
          <StatusMark icon={false}>
            {claims.value.claims.length + claims.value.invalid.length} total
          </StatusMark>
        )}
      </div>

      {claims.status === "loading" ? (
        <div className="profile-section-loading" role="status">
          <div className="profile-skeleton profile-skeleton--row" />
          <div className="profile-skeleton profile-skeleton--row" />
          <span className="sr-only">Loading Claim Cells.</span>
        </div>
      ) : claims.status === "unavailable" ? (
        <div className="notice notice--warning">
          <AlertCircle size={15} aria-hidden="true" />
          <div>
            <strong>Claim Cells are unavailable</strong>
            <p>{claims.message}</p>
            <Button variant="secondary" onClick={onRetry}>
              <RefreshCw size={14} aria-hidden="true" /> Retry
            </Button>
          </div>
        </div>
      ) : claims.value.claims.length === 0 ? (
        <div className="profile-section-empty">
          <strong>This identity has no public claims yet.</strong>
          <a href={dashboardUrl("/verify")}>
            Open verification options <ArrowUpRight size={13} aria-hidden="true" />
          </a>
        </div>
      ) : (
        <ClaimLedger claims={claims.value.claims} reputation={availableReputation} />
      )}
    </section>
  );
}

function ClaimLedger({
  claims,
  reputation,
}: {
  claims: readonly Claim[];
  reputation?: AvailablePublicReputation;
}) {
  const accepted = useMemo(
    () =>
      new Map(
        reputation?.evidence.map((evidence) => [
          referenceKey(evidence.claim.transactionHash, evidence.claim.outputIndex),
          evidence,
        ]) ?? [],
      ),
    [reputation],
  );
  const excluded = useMemo(
    () =>
      new Map(
        reputation?.excludedEvidence.map((evidence) => [
          referenceKey(evidence.claim.transactionHash, evidence.claim.outputIndex),
          evidence,
        ]) ?? [],
      ),
    [reputation],
  );

  return (
    <div className="claims-table">
      <div className="claims-table__head">
        <span>Claim</span>
        <span>Issuer</span>
        <span>Issued</span>
        <span>Policy state</span>
        <span>Source</span>
      </div>
      {claims.map((claim) => {
        const key = referenceKey(claim.cell.outPoint.txHash, claim.cell.outPoint.index);
        const acceptedEvidence = accepted.get(key);
        const excludedEvidence = excluded.get(key);
        const state = claimPolicyState(claim, Boolean(acceptedEvidence), Boolean(excludedEvidence));
        return (
          <div className="claims-table__row" key={key}>
            <span className="claim-cell__identity">
              <small>Claim</small>
              <strong>{acceptedEvidence?.schemaId ?? "Claim Cell"}</strong>
              <span className="mono" title={claim.schemaHash}>
                {shorten(claim.schemaHash, 12, 8)}
              </span>
            </span>
            <span className="claim-cell__field" title={claim.issuerDid}>
              <small>Issuer</small>
              <span className="mono">{shorten(claim.issuerDid, 10, 6)}</span>
            </span>
            <span className="claim-cell__field">
              <small>Issued</small>
              <span>{formatTimestamp(claim.issuedAt)}</span>
            </span>
            <span className="claim-cell__state">
              <small>Policy state</small>
              <StatusMark tone={state.tone} icon={state.tone === "positive"}>
                {state.label}
              </StatusMark>
              {acceptedEvidence && acceptedEvidence.contributionPoints > 0 && (
                <b className="mono">+{acceptedEvidence.contributionPoints}</b>
              )}
            </span>
            <a
              className="v-icon-button claim-cell__source"
              href={`${TESTNET_EXPLORER}${claim.cell.outPoint.txHash}`}
              target="_blank"
              rel="noreferrer"
              title="View transaction on CKB Testnet explorer"
              aria-label="View claim transaction on CKB Testnet explorer"
            >
              <ArrowUpRight size={15} aria-hidden="true" />
            </a>
          </div>
        );
      })}
    </div>
  );
}

function claimPolicyState(
  claim: Claim,
  accepted: boolean,
  excluded: boolean,
): { label: string; tone: StatusTone } {
  if (accepted) return { label: "Accepted", tone: "positive" };
  if (excluded) return { label: "Excluded", tone: "warning" };
  if (claim.issuerState.status === "active") return { label: "Not scored", tone: "neutral" };
  if (claim.issuerState.status === "deactivated") {
    return { label: "Issuer deactivated", tone: "danger" };
  }
  if (claim.issuerState.status === "ambiguous") {
    return { label: "Issuer ambiguous", tone: "warning" };
  }
  if (claim.issuerState.status === "unavailable") {
    return { label: "Issuer unavailable", tone: "warning" };
  }
  return { label: "Issuer missing", tone: "danger" };
}

function ExcludedEvidenceSection({
  claims,
  reputation,
}: {
  claims: ProfileSection<ReadClaimsResult>;
  reputation: ProfileSection<PublicReputationResponse>;
}) {
  const loading = claims.status === "loading" || reputation.status === "loading";
  const reputationUnavailable =
    reputation.status === "unavailable" ||
    (reputation.status === "available" && reputation.value.status === "unavailable");
  const reputationMessage =
    reputation.status === "unavailable"
      ? reputation.message
      : reputation.status === "available" && reputation.value.status === "unavailable"
        ? reputation.value.error.message
        : "";
  const excluded =
    reputation.status === "available" && reputation.value.status === "available"
      ? reputation.value.excludedEvidence
      : [];
  const invalid = claims.status === "available" ? claims.value.invalid : [];

  return (
    <section className="profile-record-band" aria-labelledby="excluded-title">
      <div className="site-content profile-excluded">
        <div className="profile-section-heading">
          <div>
            <h2 id="excluded-title">Excluded and unreadable evidence</h2>
            <p>Evidence outside the current policy stays separate from the accepted score.</p>
          </div>
          {loading ? (
            <StatusMark icon={false}>Checking</StatusMark>
          ) : reputationUnavailable ? (
            <StatusMark tone="warning" icon={false}>
              Unavailable
            </StatusMark>
          ) : (
            <StatusMark
              tone={excluded.length + invalid.length > 0 ? "warning" : "positive"}
              icon={excluded.length + invalid.length === 0}
            >
              {excluded.length + invalid.length} records
            </StatusMark>
          )}
        </div>
        {loading ? (
          <div className="profile-section-loading" role="status">
            <div className="profile-skeleton profile-skeleton--row" />
            <span className="sr-only">Checking excluded evidence.</span>
          </div>
        ) : reputationUnavailable ? (
          <SectionUnavailable message={reputationMessage} />
        ) : excluded.length === 0 && invalid.length === 0 ? (
          <div className="profile-section-empty">
            No evidence was excluded or unreadable at this evaluation.
          </div>
        ) : (
          <div className="excluded-list">
            {excluded.map((item) => (
              <div key={referenceKey(item.claim.transactionHash, item.claim.outputIndex)}>
                <span>
                  <strong>{item.reason.replaceAll("-", " ")}</strong>
                  <small>{item.message}</small>
                </span>
                <a
                  href={`${TESTNET_EXPLORER}${item.claim.transactionHash}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Source <ArrowUpRight size={13} aria-hidden="true" />
                </a>
              </div>
            ))}
            {invalid.map((item) => (
              <div key={referenceKey(item.cell.outPoint.txHash, item.cell.outPoint.index)}>
                <span>
                  <strong>{item.code.replaceAll("-", " ")}</strong>
                  <small>The live cell could not be decoded as a canonical Vellum claim.</small>
                </span>
                <a
                  href={`${TESTNET_EXPLORER}${item.cell.outPoint.txHash}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Source <ArrowUpRight size={13} aria-hidden="true" />
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function SectionUnavailable({ message }: { message: string }) {
  return (
    <div className="profile-section-unavailable">
      <AlertCircle size={15} aria-hidden="true" />
      <span>
        <strong>Unavailable</strong>
        <small>{message}</small>
      </span>
    </div>
  );
}

function SectionLoading({ message }: { message: string }) {
  return (
    <div className="profile-section-loading" role="status">
      <div className="profile-skeleton profile-skeleton--row" />
      <span className="sr-only">{message}</span>
    </div>
  );
}
