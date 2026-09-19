import { Check, ChevronDown, Clock3, Copy, ExternalLink, Filter } from "lucide-react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AvatarMark, SignalRail, StatusMark, useCopyFeedback } from "@vellum/ui";
import { useState } from "react";

export const Route = createFileRoute("/")({ component: Overview });

const DID = "did:ckb:0x8f2a\u2026c41d";
const SITE_ORIGIN =
  import.meta.env.VITE_SITE_URL ??
  (import.meta.env.DEV ? "http://localhost:8081" : "https://usevellum.xyz");

const CATEGORIES = [
  { label: "Contribution", value: 28, max: 40 },
  { label: "Credentials", value: 22, max: 30 },
  { label: "Account coverage", value: 12, max: 20 },
  { label: "Longevity", value: 6, max: 10 },
];

const CLAIMS = [
  {
    title: "Protocol contribution \u2014 14 merged pull requests",
    schema: "vellum.contribution/1",
    issuer: "CKBoost",
    issued: "3 months ago",
    state: "Verified",
    contribution: "+28 index",
  },
  {
    title: "CKB script development \u2014 completed",
    schema: "vellum.credential.education/1",
    issuer: "Nervos Academy",
    issued: "12 months ago",
    state: "Expires 2027",
    contribution: "+22 index",
  },
  {
    title: "Peer review \u2014 RFC 0042",
    schema: "vellum.attestation.review/2",
    issuer: "0x3d1b\u2026c0a7",
    issued: "2 weeks ago",
    state: "Unknown issuer",
    contribution: "0 index",
  },
];

function Overview() {
  const { copied, copy } = useCopyFeedback();
  const [tab, setTab] = useState<"claims" | "accounts">("claims");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [reverseClaims, setReverseClaims] = useState(false);

  function openLedger(nextTab: "claims" | "accounts") {
    setTab(nextTab);
    requestAnimationFrame(() =>
      document.querySelector(".overview-ledger")?.scrollIntoView({ behavior: "smooth" }),
    );
  }

  return (
    <div className="overview-page">
      <section className="overview-identity">
        <AvatarMark>RM</AvatarMark>
        <div className="overview-identity__body">
          <div className="overview-identity__name">
            <h1>Rae Maddox</h1>
            <StatusMark tone="positive">Active</StatusMark>
            <StatusMark icon={false}>You control this identity</StatusMark>
          </div>
          <div className="overview-identity__did">
            <span className="mono">{DID}</span>
            <button
              className="v-icon-button"
              title="Copy DID"
              aria-label="Copy DID"
              onClick={() => void copy(DID)}
            >
              <Copy size={14} />
              {copied && <span className="sr-only">Copied</span>}
            </button>
            <a
              className="v-icon-button"
              title="Open public example"
              aria-label="Open public example"
              href={`${SITE_ORIGIN}/profile`}
            >
              <ExternalLink size={14} />
            </a>
          </div>
        </div>
        <Link className="v-button v-button--primary overview-manage" to="/my">
          Manage identity
        </Link>
      </section>

      <section className="overview-metrics">
        <div className="reputation-panel">
          <h2>Reputation index</h2>
          <div className="reputation-total">
            <span>68</span>
            <small>/ 100</small>
            <StatusMark tone="warning" icon={false}>
              <Clock3 size={11} />
              Calculated 18 minutes ago
            </StatusMark>
          </div>
          <SignalRail value={68} max={100} height={10} label="Preview reputation index 68 of 100" />
          <p>
            Method v0.4.1 {"\u00b7"} 6 claims from 3 issuers {"\u00b7"}{" "}
            <a href={`${SITE_ORIGIN}/transparency`}>How this is calculated</a>
          </p>
          <div className="reputation-categories">
            {CATEGORIES.map((category) => (
              <div key={category.label}>
                <span>
                  <strong>{category.label}</strong>
                  <b className="mono">
                    {category.value} / {category.max}
                  </b>
                </span>
                <SignalRail
                  value={category.value}
                  max={category.max}
                  label={`${category.label} ${category.value} of ${category.max}`}
                />
              </div>
            ))}
          </div>
        </div>
        <div className="coverage-panel">
          <h2>Verification coverage</h2>
          <dl className="coverage-table">
            <div>
              <dt>Verified account links</dt>
              <dd className="positive">1</dd>
            </div>
            <div>
              <dt>Self-declared links</dt>
              <dd className="mono muted">1 {"\u00b7"} not counted</dd>
            </div>
            <div>
              <dt>Registry issuers</dt>
              <dd className="mono">2 of 3</dd>
            </div>
            <div>
              <dt>Claims expiring within 90 days</dt>
              <dd className="mono warning">0</dd>
            </div>
          </dl>
          <h3>Derived from missing evidence</h3>
          <div className="coverage-action">
            <span>
              <strong>Account coverage is 12 of 20</strong>
              <small>Verify the CKBoost link to replace the self-declared entry</small>
            </span>
            <button className="v-button v-button--quiet" onClick={() => openLedger("accounts")}>
              Verify link
            </button>
          </div>
          <div className="coverage-action">
            <span>
              <strong>One claim has an unknown issuer</strong>
              <small>It stays visible and neutral until the issuer is listed</small>
            </span>
            <button className="v-button v-button--quiet" onClick={() => openLedger("claims")}>
              Inspect
            </button>
          </div>
        </div>
      </section>

      <section className="overview-ledger">
        <div className="ledger-toolbar">
          <div className="ledger-tabs">
            <button className={tab === "claims" ? "active" : ""} onClick={() => setTab("claims")}>
              Claims
            </button>
            <button
              className={tab === "accounts" ? "active" : ""}
              onClick={() => setTab("accounts")}
            >
              Accounts
            </button>
          </div>
          <div className="ledger-actions">
            <button
              className="v-button v-button--quiet"
              onClick={() => setVerifiedOnly((current) => !current)}
              aria-pressed={verifiedOnly}
            >
              <Filter size={13} />
              {verifiedOnly ? "Verified" : "Category"}
            </button>
            <button
              className="v-button v-button--quiet"
              onClick={() => setReverseClaims((current) => !current)}
            >
              {reverseClaims ? "Oldest" : "Newest"} <ChevronDown size={13} />
            </button>
            <Link className="v-button v-button--secondary" to="/issue">
              Issue a claim
            </Link>
          </div>
        </div>
        {tab === "claims" ? (
          <ClaimsTable verifiedOnly={verifiedOnly} reverse={reverseClaims} />
        ) : (
          <AccountsTable />
        )}
      </section>

      <section className="overview-activity">
        <div className="section-heading-row">
          <h2>Activity</h2>
          <Link className="v-button v-button--quiet" to="/activity">
            All activity
          </Link>
        </div>
        <ol className="activity-timeline">
          {[
            [
              "Claim issued \u2014 protocol contribution",
              "3 months ago",
              "by CKBoost",
              "0x91c4\u20267ab2",
            ],
            ["Identity edited \u2014 display name", "5 months ago", "by you", "0x7a20\u202633bc"],
            ["Key rotated", "7 months ago", "by you", "0x5c11\u20269ee1"],
            ["Identity claimed", "10 months ago", "by you", "0x1f83\u202640aa"],
          ].map(([title, time, actor, tx]) => (
            <li key={tx}>
              <span />
              <div>
                <strong>{title}</strong>
                <time className="mono">{time}</time>
                <small>{actor}</small>
                <span className="activity-hash">{tx}</span>
              </div>
            </li>
          ))}
        </ol>
        <p className="activity-note">
          Example events are shown only to demonstrate the planned evidence ledger.
        </p>
      </section>
    </div>
  );
}

function ClaimsTable({ verifiedOnly, reverse }: { verifiedOnly: boolean; reverse: boolean }) {
  const claims = CLAIMS.filter((claim) => !verifiedOnly || claim.state === "Verified");
  if (reverse) claims.reverse();
  return (
    <div className="dashboard-data-table">
      <div className="dashboard-data-table__head">
        <span>Claim</span>
        <span>Issuer</span>
        <span>Issued</span>
        <span>State</span>
        <span>Contribution</span>
      </div>
      {claims.map((claim) => (
        <div className="dashboard-data-table__row" key={claim.schema}>
          <span>
            <strong>{claim.title}</strong>
            <small className="mono">{claim.schema}</small>
          </span>
          <span>
            {claim.issuer}{" "}
            <small className={claim.state === "Unknown issuer" ? "muted" : "positive"}>
              {claim.state === "Unknown issuer" ? "\u00b7 not in registry" : "\u00b7 listed"}
            </small>
          </span>
          <span className="mono muted">{claim.issued}</span>
          <StatusMark
            tone={
              claim.state === "Verified"
                ? "positive"
                : claim.state.startsWith("Expires")
                  ? "warning"
                  : "neutral"
            }
            icon={claim.state === "Verified"}
          >
            {claim.state}
          </StatusMark>
          <span className="dashboard-contribution">
            <b className="mono">{claim.contribution}</b>
            <a className="v-button v-button--quiet" href={`${SITE_ORIGIN}/profile`}>
              Inspect
            </a>
          </span>
        </div>
      ))}
    </div>
  );
}

function AccountsTable() {
  const rows = [
    {
      name: "GitHub",
      method: "OAuth account claim",
      state: "Available",
      action: "View status",
      to: "/verify/github",
      added: "Check live claim",
    },
    {
      name: "ckb1qzda\u20264mns9f0",
      method: "Signature control proof",
      state: "Controller",
      action: "Inspect",
      to: "/resolve",
      added: "Added 2026-02-11",
    },
    {
      name: "CKBoost \u00b7 rae.boost",
      method: "Profile link only",
      state: "Self-declared",
      action: "Verify",
      to: "/my",
      added: "Added 2026-02-11",
    },
  ] as const;
  return (
    <div className="dashboard-data-table dashboard-data-table--accounts">
      {rows.map((row) => (
        <div className="dashboard-data-table__row" key={row.name}>
          <span>
            <strong>{row.name}</strong>
            <small>{row.method}</small>
          </span>
          <span className="muted">{row.added}</span>
          <StatusMark tone={row.state === "Available" ? "info" : "neutral"} icon={false}>
            {row.state}
          </StatusMark>
          <Link className="v-button v-button--quiet" to={row.to}>
            {row.action}
          </Link>
        </div>
      ))}
    </div>
  );
}
