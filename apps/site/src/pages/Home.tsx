import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Copy,
  FileCheck2,
  Fingerprint,
  Gauge,
  ShieldCheck,
} from "lucide-react";
import { StatusMark, useCopyFeedback } from "@vellum/ui";

import { dashboardUrl } from "../config";
import { profilePath } from "../lib/profile-route";

const PUBLIC_PROFILE_DID = "did:ckb:omdrzidnxy3lrdrwc6bo4sll6zljhuar";
const CKBOOST_CLAIM_TX = "0x83f547f606bce2d6163e997eff45463f09956725e9217c88c1e97a52e7c3e1f2";
const PUBLIC_PROFILE_PATH = profilePath(PUBLIC_PROFILE_DID);
const REPUTATION_PATH = dashboardUrl(`/reputation?did=${encodeURIComponent(PUBLIC_PROFILE_DID)}`);
const TESTNET_EXPLORER = "https://pudge.explorer.nervos.org/transaction/";
const REPOSITORY_URL = "https://github.com/truthixify/vellum";
const SCHEMAS_URL = `${REPOSITORY_URL}/tree/main/docs/schemas`;
const SDK_URL = `${REPOSITORY_URL}/tree/main/packages/sdk#read-claims`;
const ROADMAP_URL = "https://github.com/users/truthixify/projects/2";
const CFDAO_PROPOSAL_URL =
  "https://talk.nervos.org/t/vellum-extended-from-identity-to-reputation-on-did-ckb/10406";

const AUDIENCES = [
  {
    label: "Builders",
    title: "Create and manage your DID",
    body: "Claim a did:ckb identity, publish a profile, and manage its controller from the dashboard.",
    href: dashboardUrl("/claim"),
    action: "Get your DID",
  },
  {
    label: "Projects and issuers",
    title: "Issue evidence people can carry",
    body: "Use public schemas and issuer-bound Claim Cells to make achievements independently readable.",
    href: SCHEMAS_URL,
    action: "Review claim schemas",
  },
  {
    label: "Integrators",
    title: "Read claims in your application",
    body: "Resolve identities and inspect valid, invalid, accepted, and excluded evidence with the SDK.",
    href: SDK_URL,
    action: "Read the SDK guide",
  },
  {
    label: "CFDAO and community",
    title: "Follow delivery in public",
    body: "Track grant milestones, implementation issues, reviews, and the evidence behind completed work.",
    href: ROADMAP_URL,
    action: "See the roadmap",
  },
] as const;

function shortDid(did: string): string {
  return `${did.slice(0, 16)}...${did.slice(-8)}`;
}

function LiveEvidence() {
  return (
    <section className="live-evidence" aria-labelledby="live-evidence-title">
      <div className="site-content">
        <div className="home-section-heading home-section-heading--split">
          <div>
            <span className="eyebrow">Confirmed on CKB Testnet</span>
            <h2 id="live-evidence-title">One completion, readable all the way through.</h2>
          </div>
          <p>
            This is a live CKBoost quest claim, its public Vellum profile, and the score produced by
            the current policy. The links resolve the record directly.
          </p>
        </div>

        <div className="evidence-flow" aria-label="Live CKBoost claim flow">
          <a className="evidence-step" href={PUBLIC_PROFILE_PATH}>
            <span className="evidence-step__topline">
              <span className="evidence-step__number">01</span>
              <Fingerprint size={18} aria-hidden="true" />
            </span>
            <small>Builder identity</small>
            <strong className="mono">{shortDid(PUBLIC_PROFILE_DID)}</strong>
            <span>Public profile on did:ckb</span>
          </a>
          <ArrowRight className="evidence-flow__arrow" size={20} aria-hidden="true" />
          <a className="evidence-step" href={`${TESTNET_EXPLORER}${CKBOOST_CLAIM_TX}`}>
            <span className="evidence-step__topline">
              <span className="evidence-step__number">02</span>
              <FileCheck2 size={18} aria-hidden="true" />
            </span>
            <small>Issuer-backed evidence</small>
            <strong>Send the Vellum Dashboard Link</strong>
            <span className="mono">ckboost.quest.v1</span>
          </a>
          <ArrowRight className="evidence-flow__arrow" size={20} aria-hidden="true" />
          <a className="evidence-step evidence-step--score" href={REPUTATION_PATH}>
            <span className="evidence-step__topline">
              <span className="evidence-step__number">03</span>
              <Gauge size={18} aria-hidden="true" />
            </span>
            <small>Transparent interpretation</small>
            <strong>
              20 <span>/ 1000</span>
            </strong>
            <span className="mono">vellum.reputation.v7</span>
          </a>
        </div>

        <div className="evidence-meta">
          <span>
            <Check size={14} aria-hidden="true" /> Claim transaction committed and issuer verified
          </span>
          <div>
            <a href={PUBLIC_PROFILE_PATH}>
              Open public profile <ArrowUpRight size={13} aria-hidden="true" />
            </a>
            <a href={`${TESTNET_EXPLORER}${CKBOOST_CLAIM_TX}`}>
              Inspect transaction <ArrowUpRight size={13} aria-hidden="true" />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

function ProductModel() {
  const capabilities = [
    {
      icon: Fingerprint,
      number: "01",
      title: "Identity",
      body: "A wallet-controlled did:ckb record that can be created, updated, rotated, resolved, and deactivated.",
      fact: "Live on CKB Testnet and Mainnet",
    },
    {
      icon: FileCheck2,
      number: "02",
      title: "Evidence",
      body: "Claim Cells keep the subject, issuer, schema, dates, and public payload available to independent readers.",
      fact: "Live on CKB Testnet",
    },
    {
      icon: Gauge,
      number: "03",
      title: "Reputation",
      body: "A versioned policy explains which evidence counted, which evidence was excluded, and why the score changed.",
      fact: "Policy v7 is live on Testnet",
    },
  ] as const;

  return (
    <section className="product-model" aria-labelledby="product-model-title">
      <div className="site-content">
        <div className="home-section-heading">
          <span className="eyebrow">How Vellum works</span>
          <h2 id="product-model-title">
            The identity stays yours. The evidence stays inspectable.
          </h2>
          <p>
            Vellum does not declare someone universally trustworthy. It gives people and
            applications a shared record, then shows the rules used to interpret it.
          </p>
        </div>
        <div className="capability-grid">
          {capabilities.map(({ icon: Icon, number, title, body, fact }) => (
            <article className="capability" key={title}>
              <div className="capability__topline">
                <span className="capability__icon">
                  <Icon size={18} aria-hidden="true" />
                </span>
                <span className="mono">{number}</span>
              </div>
              <h3>{title}</h3>
              <p>{body}</p>
              <small>
                <Check size={13} aria-hidden="true" /> {fact}
              </small>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function AudiencePaths() {
  return (
    <section className="audience-band" aria-labelledby="audience-title">
      <div className="site-content">
        <div className="home-section-heading home-section-heading--split">
          <div>
            <span className="eyebrow">Start here</span>
            <h2 id="audience-title">A clear path for every participant.</h2>
          </div>
          <p>
            Manage your own identity, issue useful evidence, integrate the protocol, or follow the
            grant work from its public record.
          </p>
        </div>
        <div className="audience-grid">
          {AUDIENCES.map((audience) => (
            <a href={audience.href} key={audience.label}>
              <span>{audience.label}</span>
              <h3>{audience.title}</h3>
              <p>{audience.body}</p>
              <strong>
                {audience.action} <ArrowUpRight size={14} aria-hidden="true" />
              </strong>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

function CodeExample() {
  const code = `import { ccc } from "@ckb-ccc/core";
import { readClaims } from "@usevellum/sdk";

const client = new ccc.ClientPublicTestnet();
const { claims, invalid } = await readClaims({
  client,
  scripts,
  filter: {
    subject: { did },
    evaluationTime: checkpoint,
  },
});`;
  const { copied, copy } = useCopyFeedback();

  return (
    <div className="code-sample">
      <div className="code-sample__bar">
        <span className="mono">read-claims.ts</span>
        <button onClick={() => void copy(code)} title="Copy code" aria-label="Copy code">
          <Copy size={14} aria-hidden="true" />
          {copied && <span>Copied</span>}
        </button>
      </div>
      <pre>{code}</pre>
    </div>
  );
}

function DeveloperPath() {
  return (
    <section className="developer-band" aria-labelledby="developer-title">
      <div className="site-content developer-band__inner">
        <div className="developer-band__copy">
          <span className="eyebrow">For integrators</span>
          <h2 id="developer-title">Read the record, not a black-box verdict.</h2>
          <p>
            The SDK returns every valid claim and reports malformed cells separately. Your
            application chooses its issuers, schemas, evaluation time, and policy.
          </p>
          <div className="button-row">
            <a className="v-button v-button--primary" href={SDK_URL}>
              Read SDK documentation <ArrowUpRight size={14} aria-hidden="true" />
            </a>
            <a className="v-button v-button--secondary" href="/resolve">
              Open DID resolver
            </a>
          </div>
          <div className="trust-note">
            <ShieldCheck size={15} aria-hidden="true" />
            <span>OAuth tokens and private verifier data never enter public claims.</span>
          </div>
        </div>
        <CodeExample />
      </div>
    </section>
  );
}

function PublicWork() {
  const links = [
    {
      label: "CFDAO proposal",
      detail: "Funding scope and public discussion",
      href: CFDAO_PROPOSAL_URL,
    },
    {
      label: "Delivery roadmap",
      detail: "Milestones, issues, and current status",
      href: ROADMAP_URL,
    },
    {
      label: "Source code",
      detail: "Protocol, SDK, dashboard, and website",
      href: REPOSITORY_URL,
    },
    {
      label: "Scoring method",
      detail: "Policy, trust boundaries, and exclusions",
      href: "/transparency",
    },
  ] as const;

  return (
    <section className="public-work" aria-labelledby="public-work-title">
      <div className="site-content public-work__inner">
        <div className="home-section-heading">
          <span className="eyebrow">CFDAO-backed, built in public</span>
          <h2 id="public-work-title">Follow the work and verify the outcome.</h2>
          <p>
            Vellum's reputation extension is funded through a Nervos Community Fund DAO proposal.
            The scope, implementation, reviews, and milestone progress remain public.
          </p>
        </div>
        <div className="public-work__links">
          {links.map((link) => (
            <a href={link.href} key={link.label}>
              <span>
                <strong>{link.label}</strong>
                <small>{link.detail}</small>
              </span>
              <ArrowUpRight size={16} aria-hidden="true" />
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Home() {
  return (
    <>
      <section className="home-hero">
        <div className="site-content">
          <div className="home-hero__inner">
            <div>
              <StatusMark tone="positive">Live on CKB</StatusMark>
              <h1>Vellum</h1>
              <p>
                Portable identity and verifiable reputation on CKB. Create a did:ckb identity,
                attach issuer-backed evidence, and share a public profile other applications can
                inspect.
              </p>
            </div>
            <div className="home-hero__actions">
              <a className="v-button v-button--primary" href={dashboardUrl()}>
                Manage your identity <ArrowUpRight size={14} aria-hidden="true" />
              </a>
              <a className="v-button v-button--secondary" href={PUBLIC_PROFILE_PATH}>
                View a live profile
              </a>
            </div>
          </div>
          <div className="home-status-grid" aria-label="Vellum network availability">
            <div>
              <small>did:ckb identity</small>
              <strong>Testnet and Mainnet</strong>
            </div>
            <div>
              <small>Claims and reputation</small>
              <strong>CKB Testnet</strong>
            </div>
            <div>
              <small>Public profiles</small>
              <strong>Wallet-free viewing</strong>
            </div>
          </div>
        </div>
      </section>
      <LiveEvidence />
      <ProductModel />
      <AudiencePaths />
      <DeveloperPath />
      <PublicWork />
    </>
  );
}
