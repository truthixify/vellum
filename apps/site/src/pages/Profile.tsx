import { Check, Copy, ExternalLink, Info, Share2 } from "lucide-react";
import { AvatarMark, PreviewBadge, SignalRail, StatusMark, useCopyFeedback } from "@vellum/ui";

const DID = "did:ckb:0x8f2a\u2026c41d";

export function Profile() {
  const { copied, copy } = useCopyFeedback();
  return (
    <div className="profile-page">
      <section className="profile-heading site-content">
        <div className="breadcrumbs">
          <a href="/resolve">Profiles</a>
          <span>/</span>
          <span className="mono">{DID}</span>
          <PreviewBadge label="Deterministic example" />
        </div>
        <div className="profile-identity">
          <AvatarMark size="large">RM</AvatarMark>
          <div className="profile-identity__copy">
            <h1>Rae Maddox</h1>
            <div>
              <span className="mono">{DID}</span>
              <StatusMark tone="positive">Active identity</StatusMark>
              <span>Example resolved 4 minutes ago</span>
            </div>
          </div>
          <div className="profile-identity__actions">
            <button
              className="v-icon-button"
              title="Copy DID"
              aria-label="Copy DID"
              onClick={() => void copy(DID)}
            >
              <Copy size={16} />
              {copied && <span className="sr-only">Copied</span>}
            </button>
            <button
              className="v-icon-button"
              title="Share profile"
              aria-label="Share profile"
              onClick={() =>
                void navigator.share?.({
                  title: "Vellum profile",
                  url: window.location.href,
                })
              }
            >
              <Share2 size={16} />
            </button>
            <a className="v-button v-button--secondary" href="/resolve">
              Resolve a live DID
            </a>
          </div>
        </div>
      </section>
      <section className="profile-summary site-content">
        <div className="profile-score">
          <div className="section-heading-row">
            <h2>Reputation index</h2>
            <PreviewBadge />
          </div>
          <div className="score-number">
            <span>68</span>
            <small>/ 100</small>
          </div>
          <SignalRail value={68} max={100} height={10} label="Example index 68 of 100" />
          <p>Proposed method v0.4.1 - 6 example claims from 3 issuers</p>
          <a className="v-button v-button--secondary" href="/transparency">
            <Info size={14} />
            How this is calculated
          </a>
        </div>
        <div className="profile-categories">
          <h2>Categories</h2>
          {[
            ["Contribution", "28", "40"],
            ["Credentials", "22", "30"],
            ["Account coverage", "12", "20"],
            ["Longevity", "6", "10"],
          ].map(([label, value, max]) => (
            <div className="category-row" key={label}>
              <span>
                <strong>{label}</strong>
                <b className="mono">
                  {value} / {max}
                </b>
              </span>
              <SignalRail
                value={Number(value)}
                max={Number(max)}
                label={`${label} ${value} of ${max}`}
              />
            </div>
          ))}
        </div>
      </section>
      <section className="profile-ledger site-content">
        <div className="profile-ledger__heading">
          <div>
            <h2>Evidence ledger</h2>
            <p>Every example record keeps its source and issuer boundary visible.</p>
          </div>
          <PreviewBadge label="Preview records" />
        </div>
        <div className="claims-table">
          <div className="claims-table__head">
            <span>Claim</span>
            <span>Issuer</span>
            <span>Issued</span>
            <span>State</span>
          </div>
          {[
            [
              "Protocol contribution - 14 merged pull requests",
              "CKBoost - listed",
              "2026-06-02",
              "Verified",
            ],
            [
              "Nervos Academy course completion",
              "Nervos Academy - listed",
              "2026-07-19",
              "Verified",
            ],
            ["Peer review attestation", "0x3d1b... - unknown", "2026-08-21", "Neutral"],
          ].map(([claim, issuer, date, state]) => (
            <div className="claims-table__row" key={claim}>
              <strong>{claim}</strong>
              <span>{issuer}</span>
              <span className="mono">{date}</span>
              <StatusMark
                tone={state === "Verified" ? "positive" : "neutral"}
                icon={state === "Verified"}
              >
                {state}
              </StatusMark>
            </div>
          ))}
        </div>
      </section>
      <section className="profile-record-band">
        <div className="site-content profile-record-grid">
          <div>
            <h2>Eligible uses</h2>
            <dl className="plain-rows">
              <div>
                <dt>Grants council v3</dt>
                <dd className="positive">
                  <Check size={12} />
                  Eligible
                </dd>
              </div>
              <div>
                <dt>CKBoost contributor tier</dt>
                <dd>Reads this profile</dd>
              </div>
              <div>
                <dt>Community moderation policy</dt>
                <dd className="warning">Needs 2 registry issuers</dd>
              </div>
            </dl>
          </div>
          <div>
            <h2>Raw example record</h2>
            <div className="raw-record">
              <div>
                <span className="mono">did-document.json</span>
                <ExternalLink size={13} />
              </div>
              <pre>{`{\n  "id": "${DID}",\n  "network": "ckb-testnet",\n  "claims": 6,\n  "reputation": { "preview": true, "index": 68 }\n}`}</pre>
            </div>
            <p>This record is a design fixture, not a chain response.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
