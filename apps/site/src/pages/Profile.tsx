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
          <PreviewBadge label="Current policy example" />
        </div>
        <div className="profile-identity">
          <AvatarMark size="large">RM</AvatarMark>
          <div className="profile-identity__copy">
            <h1>Rae Maddox</h1>
            <div>
              <span className="mono">{DID}</span>
              <StatusMark tone="positive">Active identity</StatusMark>
              <span>Illustrative Testnet identity</span>
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
            <h2>Reputation score</h2>
            <StatusMark tone="positive">Policy v3</StatusMark>
          </div>
          <div className="score-number">
            <span>450</span>
            <small>/ 1000</small>
          </div>
          <SignalRail value={450} max={1000} height={10} label="Example score 450 of 1000" />
          <p>vellum.reputation.v3 - 4 accepted Claim Cells</p>
          <a className="v-button v-button--secondary" href="/transparency">
            <Info size={14} />
            How this is calculated
          </a>
        </div>
        <div className="profile-categories">
          <h2>Categories</h2>
          {[
            ["Technical", "60", "300"],
            ["Contribution", "30", "300"],
            ["Community", "160", "200"],
            ["Tenure", "100", "100"],
            ["Recency", "100", "100"],
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
            <p>Every accepted or excluded record keeps its source and issuer boundary visible.</p>
          </div>
          <PreviewBadge label="Policy example" />
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
              "GitHub account - @rmaddox",
              "Vellum Testnet issuer",
              "Example checkpoint",
              "Verified",
            ],
            ["Merged CKB pull request", "Vellum Testnet issuer", "Example checkpoint", "Verified"],
            [
              "Discord account - @rmaddox",
              "Vellum Testnet issuer",
              "Example checkpoint",
              "Verified",
            ],
            ["Nervos Nation membership", "Vellum Testnet issuer", "Example checkpoint", "Verified"],
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
            <h2>Policy output</h2>
            <dl className="plain-rows">
              <div>
                <dt>Accepted evidence</dt>
                <dd className="positive">
                  <Check size={12} />4 Claim Cells
                </dd>
              </div>
              <div>
                <dt>Excluded evidence</dt>
                <dd>0 claims</dd>
              </div>
              <div>
                <dt>Scored categories</dt>
                <dd>Technical, contribution, community, tenure, and recency</dd>
              </div>
            </dl>
          </div>
          <div>
            <h2>Raw example record</h2>
            <div className="raw-record">
              <div>
                <span className="mono">reputation.json</span>
                <ExternalLink size={13} />
              </div>
              <pre>{`{\n  "subject": "${DID}",\n  "network": "ckb_testnet",\n  "status": "available",\n  "policyVersion": "vellum.reputation.v3",\n  "overall": { "score": 450, "maximum": 1000 }\n}`}</pre>
            </div>
            <p>This record is a design fixture, not a chain response.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
