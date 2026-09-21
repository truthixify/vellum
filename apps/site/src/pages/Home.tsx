import { ArrowRight, Check, Copy, ShieldCheck } from "lucide-react";
import { AvatarMark, SignalRail, StatusMark, useCopyFeedback } from "@vellum/ui";
import { useState } from "react";
import { dashboardUrl } from "../config";

type RecordNode = {
  key: string;
  id: string;
  title: string;
  source: string;
  issuer: string;
  time: string;
};

const RECORDS: RecordNode[] = [
  {
    key: "identity",
    id: "did:ckb:0x8f2a\u2026c41d",
    title: "Identity record",
    source: "CKB Testnet cell",
    issuer: "Self-controlled",
    time: "2025-11-04 09:12 UTC",
  },
  {
    key: "github",
    id: "github.com/rmaddox",
    title: "GitHub account",
    source: "OAuth-backed Claim Cell",
    issuer: "Vellum verifier",
    time: "2026-02-11 16:40 UTC",
  },
  {
    key: "discord",
    id: "discord.com/users/80351110224678912",
    title: "Discord community membership",
    source: "OAuth-backed Claim Cells",
    issuer: "Vellum verifier",
    time: "2026-02-11 16:42 UTC",
  },
  {
    key: "address",
    id: "ckb1qzda\u20264mns9f0",
    title: "Linked address",
    source: "Signature control proof",
    issuer: "Wallet",
    time: "2025-11-04 09:20 UTC",
  },
  {
    key: "ckboost",
    id: "ckboost.io/rae.boost",
    title: "Linked profile",
    source: "Self-declared link",
    issuer: "None",
    time: "2026-03-02 11:05 UTC",
  },
  {
    key: "contribution",
    id: "vellum.contribution/1",
    title: "Protocol contribution",
    source: "Claim cell 0x91c4\u20267ab2",
    issuer: "CKBoost \u00b7 listed",
    time: "2026-06-02 08:31 UTC",
  },
  {
    key: "education",
    id: "vellum.credential.education/1",
    title: "Course credential",
    source: "Claim cell 0x4f08\u202611de",
    issuer: "Nervos Academy \u00b7 listed",
    time: "2025-09-18 12:00 UTC",
  },
  {
    key: "attestation",
    id: "vellum.attestation.review/2",
    title: "Peer review attestation",
    source: "Claim cell 0x3d1b\u2026c0a7",
    issuer: "Not in registry",
    time: "2026-08-21 19:44 UTC",
  },
  {
    key: "policy",
    id: "policy:grants-council/v3",
    title: "Eligibility evaluation",
    source: "Published policy document",
    issuer: "Grants council",
    time: "2026-09-05 14:02 UTC",
  },
];

function NodeButton({
  record,
  selected,
  children,
  onSelect,
}: {
  record: RecordNode;
  selected: boolean;
  children: React.ReactNode;
  onSelect: (record: RecordNode) => void;
}) {
  return (
    <button
      className={`registry-node${selected ? " registry-node--selected" : ""}`}
      type="button"
      onClick={() => onSelect(record)}
      aria-pressed={selected}
    >
      {children}
    </button>
  );
}

function RegistryScene() {
  const [selected, setSelected] = useState(RECORDS[4]);
  const byKey = (key: string) => RECORDS.find((record) => record.key === key)!;

  return (
    <div className="registry-scene">
      <div className="site-content registry-scene__body">
        <div className="registry-scene__heading">
          <h2>Registry scene &mdash; deterministic example record</h2>
          <span>Select a node to inspect its source, issuer, and time.</span>
        </div>
        <div className="registry-grid" role="list">
          <div className="registry-track" aria-hidden="true" />
          <div className="registry-column" role="listitem">
            <div className="registry-label registry-label--primary">
              <span />
              Identity
            </div>
            <NodeButton
              record={byKey("identity")}
              selected={selected.key === "identity"}
              onSelect={setSelected}
            >
              <strong className="mono">{byKey("identity").id}</strong>
              <small>Rae Maddox &middot; active</small>
            </NodeButton>
          </div>
          <div className="registry-column" role="listitem">
            <div className="registry-label">
              <span />
              Linked accounts
            </div>
            <div className="registry-stack">
              <NodeButton
                record={byKey("github")}
                selected={selected.key === "github"}
                onSelect={setSelected}
              >
                <strong>GitHub &middot; @rmaddox</strong>
                <small className="positive">Verified &middot; issuer-backed claim</small>
              </NodeButton>
              <NodeButton
                record={byKey("discord")}
                selected={selected.key === "discord"}
                onSelect={setSelected}
              >
                <strong>Discord &middot; @rmaddox</strong>
                <small className="positive">Verified &middot; CKB community member</small>
              </NodeButton>
              <NodeButton
                record={byKey("address")}
                selected={selected.key === "address"}
                onSelect={setSelected}
              >
                <strong>CKB address &middot; ckb1q&hellip;s9f0</strong>
                <small className="positive">Verified &middot; control proof</small>
              </NodeButton>
              <NodeButton
                record={byKey("ckboost")}
                selected={selected.key === "ckboost"}
                onSelect={setSelected}
              >
                <strong>CKBoost &middot; rae.boost</strong>
                <small>Self-declared link</small>
              </NodeButton>
            </div>
          </div>
          <div className="registry-column" role="listitem">
            <div className="registry-label">
              <span />
              Issued claims
            </div>
            <div className="registry-stack">
              <NodeButton
                record={byKey("contribution")}
                selected={selected.key === "contribution"}
                onSelect={setSelected}
              >
                <strong>Contribution &middot; CKBoost</strong>
                <small className="mono">vellum.contribution/1</small>
              </NodeButton>
              <NodeButton
                record={byKey("education")}
                selected={selected.key === "education"}
                onSelect={setSelected}
              >
                <strong>Credential &middot; Nervos Academy</strong>
                <small className="mono">vellum.credential.education/1</small>
              </NodeButton>
              <NodeButton
                record={byKey("attestation")}
                selected={selected.key === "attestation"}
                onSelect={setSelected}
              >
                <strong>Attestation &middot; 0x3d1b&hellip;</strong>
                <small>Unknown issuer</small>
              </NodeButton>
            </div>
          </div>
          <div className="registry-column" role="listitem">
            <div className="registry-label">
              <span />
              Downstream use
            </div>
            <NodeButton
              record={byKey("policy")}
              selected={selected.key === "policy"}
              onSelect={setSelected}
            >
              <strong>Grants council v3</strong>
              <small className="positive registry-node__result">
                <Check size={12} />
                Eligible under published policy
              </small>
            </NodeButton>
          </div>
        </div>
      </div>
      <div className="registry-inspector" aria-live="polite">
        <div className="site-content registry-inspector__inner">
          <span>Inspecting</span>
          <strong className="mono">{selected.id}</strong>
          <strong>{selected.title}</strong>
          <span>Source {selected.source}</span>
          <span>Issuer {selected.issuer}</span>
          <span className="mono">{selected.time}</span>
        </div>
      </div>
    </div>
  );
}

function RegistryLegend() {
  return (
    <section className="site-content registry-legend">
      {[
        ["did:ckb:0x8f2a\u2026c41d", "One resolvable identifier, owned by a person"],
        [
          "Four linked services",
          "GitHub, Discord, CKB address, CKBoost \u2014 each with its own method",
        ],
        ["Independently sourced claims", "Issuer, schema, and timestamp visible on every record"],
        [
          "One transparent eligibility result",
          "Every contributing rule is shown, not just the outcome",
        ],
      ].map(([title, body], index) => (
        <div className={index === 0 ? "registry-legend__primary" : ""} key={title}>
          <span className="registry-legend__node" />
          <strong className={index === 0 ? "mono" : ""}>{title}</strong>
          <p>{body}</p>
        </div>
      ))}
    </section>
  );
}

function IdentitySpecimen() {
  return (
    <div className="specimen">
      <div className="specimen__bar">
        <strong>Identity</strong>
        <span>
          <Check size={12} />
          You control this identity
        </span>
      </div>
      <div className="specimen__person">
        <AvatarMark>RM</AvatarMark>
        <span>
          <strong>Rae Maddox</strong>
          <small className="mono">did:ckb:0x8f2a\u2026c41d</small>
        </span>
        <StatusMark tone="positive">Active</StatusMark>
      </div>
      <dl className="specimen__rows">
        <div>
          <dt>Controller</dt>
          <dd className="mono">ckb1qzda\u20264mns9f0</dd>
        </div>
        <div>
          <dt>Network</dt>
          <dd>CKB Testnet</dd>
        </div>
        <div>
          <dt>Last updated</dt>
          <dd className="mono">2026-04-02 17:20 UTC</dd>
        </div>
      </dl>
    </div>
  );
}

function ClaimsLedger() {
  return (
    <div className="ledger">
      <div className="ledger__bar">
        <strong>Attached evidence</strong>
        <span>3 accepted Claim Cells</span>
      </div>
      {[
        [
          "GitHub account",
          "vellum.social.github.v1",
          "Vellum Testnet issuer",
          "Example checkpoint",
          "Verified",
        ],
        [
          "Discord account",
          "vellum.social.discord.v1",
          "Vellum Testnet issuer",
          "Example checkpoint",
          "Verified",
        ],
        [
          "Nervos Nation membership",
          "vellum.community.discord.v1",
          "Vellum Testnet issuer",
          "Example checkpoint",
          "Verified",
        ],
      ].map(([title, schema, issuer, date, state]) => (
        <div className="ledger__row" key={schema}>
          <span>
            <strong>{title}</strong>
            <small className="mono">{schema}</small>
          </span>
          <span>
            <small>{issuer}</small>
          </span>
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
  );
}

function PolicyExamples() {
  return (
    <div className="policy-examples">
      <div className="policy-card">
        <div className="policy-card__bar">Vellum reputation v2 - evaluation</div>
        <div className="policy-card__result">
          <StatusMark tone="positive">Available</StatusMark>
          <span>Deterministic Testnet result</span>
        </div>
        <dl>
          <div>
            <dt>Aggregate score</dt>
            <dd>360 of 1000</dd>
          </div>
          <div>
            <dt>Identity tenure</dt>
            <dd>100 of 100</dd>
          </div>
          <div>
            <dt>CKB community history</dt>
            <dd>160 of 200</dd>
          </div>
          <div>
            <dt>Verification recency</dt>
            <dd>100 of 100</dd>
          </div>
        </dl>
      </div>
      <div className="policy-card">
        <div className="policy-card__bar">
          <span>CKBoost profile embed</span>
          <small>via Vellum</small>
        </div>
        <div className="embed-person">
          <AvatarMark size="small">RM</AvatarMark>
          <span>
            <strong>Rae Maddox</strong>
            <small className="mono">did:ckb:0x8f2a\u2026c41d</small>
          </span>
          <strong className="embed-score">
            360<small>/1000</small>
          </strong>
        </div>
        <div className="embed-rails">
          <span>
            Community <b className="mono">160/200</b>
          </span>
          <SignalRail value={160} max={200} label="Community 160 of 200" />
          <span>
            Tenure <b className="mono">100/100</b>
          </span>
          <SignalRail value={100} max={100} label="Tenure 100 of 100" />
          <span>
            Recency <b className="mono">100/100</b>
          </span>
          <SignalRail value={100} max={100} label="Recency 100 of 100" />
          <small>3 accepted Claim Cells {"\u00b7"} evaluated on request</small>
        </div>
      </div>
    </div>
  );
}

function CodeExample() {
  const code = `import { ccc } from '@ckb-ccc/core'\nimport { resolveDidCkb } from '@ckb-ccc/did-ckb'\n\nconst client = new ccc.ClientPublicTestnet()\nconst record = await resolveDidCkb({ client, did })`;
  const { copied, copy } = useCopyFeedback();
  return (
    <div className="code-sample">
      <div className="code-sample__bar">
        <span className="mono">resolve.ts</span>
        <button onClick={() => void copy(code)} title="Copy code" aria-label="Copy code">
          <Copy size={14} />
          {copied && <span>Copied</span>}
        </button>
      </div>
      <pre>{code}</pre>
    </div>
  );
}

export function Home() {
  return (
    <>
      <section className="home-hero">
        <div className="site-content">
          <div className="home-hero__inner">
            <div>
              <h1>Vellum</h1>
              <p>Portable identity and reputation on CKB.</p>
            </div>
            <div className="home-hero__actions">
              <a className="v-button v-button--primary" href={dashboardUrl()}>
                Open dashboard
              </a>
              <a className="v-button v-button--secondary" href="/resolve">
                Resolve a DID
              </a>
            </div>
          </div>
        </div>
        <RegistryScene />
      </section>
      <RegistryLegend />
      <section className="feature-band">
        <div className="site-content feature-split">
          <div className="feature-copy">
            <span className="section-number">01</span>
            <h2>Own the identifier</h2>
            <p>
              One DID, controlled by your keys and resolvable by anyone. Rotate the controller or
              migrate it without losing the record.
            </p>
          </div>
          <IdentitySpecimen />
        </div>
      </section>
      <section className="feature-band">
        <div className="site-content feature-split feature-split--reverse">
          <ClaimsLedger />
          <div className="feature-copy">
            <span className="section-number">02</span>
            <h2>Attach evidence</h2>
            <p>
              Issuers write claims against published schemas. Every record keeps its issuer, dates,
              and trust boundary in view.
            </p>
            <StatusMark tone="positive">Live on Testnet</StatusMark>
          </div>
        </div>
      </section>
      <section className="feature-band">
        <div className="site-content feature-split">
          <div className="feature-copy">
            <span className="section-number">03</span>
            <h2>Use it elsewhere</h2>
            <p>
              Applications can read a score together with its accepted and excluded evidence. Vellum
              publishes the policy; each application still chooses how to use the result.
            </p>
            <a className="v-button v-button--secondary" href={dashboardUrl("/reputation")}>
              Inspect a reputation score
            </a>
          </div>
          <PolicyExamples />
        </div>
      </section>
      <section className="method-band">
        <div className="site-content">
          <StatusMark tone="positive">Live Testnet policy</StatusMark>
          <h2>Portable evidence. Transparent interpretation.</h2>
          <p>
            A Vellum score is one reading of the evidence attached to an identity. The method is
            versioned, the inputs are inspectable, and the result never asserts that a person is
            unique or honest.
          </p>
          <div className="method-grid">
            <div>
              <small>Range and method</small>
              <strong className="mono">0-1000 / vellum.reputation.v2</strong>
            </div>
            <div>
              <small>Scored in v2</small>
              <strong>Community history, identity tenure, and verification recency</strong>
            </div>
            <div>
              <small>Issuer visibility</small>
              <strong>Every input names its issuer and registry state</strong>
            </div>
            <div>
              <small>Scope</small>
              <strong className="positive">Live on CKB Testnet</strong>
            </div>
          </div>
          <a className="v-button v-button--secondary method-band__link" href="/transparency">
            How this is calculated <ArrowRight size={14} />
          </a>
        </div>
      </section>
      <section className="feature-band resolve-band">
        <div className="site-content feature-split resolve-band__inner">
          <div className="feature-copy">
            <h2>Resolve any identity</h2>
            <p>
              Read a DID document directly from CKB, then inspect the claims recognized by the
              current reputation policy. Identity resolution and scoring are live on Testnet.
            </p>
            <div className="button-row">
              <a className="v-button v-button--primary" href="/docs">
                Read the docs
              </a>
              <a className="v-button v-button--secondary" href="/resolve">
                Open resolver
              </a>
            </div>
            <div className="trust-note">
              <ShieldCheck size={15} />
              <span>No private verifier data is exposed.</span>
            </div>
          </div>
          <CodeExample />
        </div>
      </section>
    </>
  );
}
