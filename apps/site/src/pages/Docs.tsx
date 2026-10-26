import { ArrowRight, ArrowUpRight, Check, Copy, FileCheck2, Fingerprint } from "lucide-react";
import { useCopyFeedback } from "@vellum/ui";
import type { ReactNode } from "react";

import { dashboardUrl } from "../config";
import type { DocsPage } from "../lib/docs-route";
import { ISSUE_CLAIM_EXAMPLE, READ_CLAIMS_EXAMPLE } from "./docs-examples";

const REPOSITORY_URL = "https://github.com/truthixify/vellum";
const SDK_URL = `${REPOSITORY_URL}/tree/main/packages/sdk`;
const SDK_EXAMPLE_URL = `${REPOSITORY_URL}/blob/main/packages/sdk/examples/api.ts`;
const SCHEMAS_URL = `${REPOSITORY_URL}/tree/main/docs/schemas`;
const CLAIM_CELL_URL = `${REPOSITORY_URL}/blob/main/docs/claim-cell.md`;
const RENDERER_URL = `${REPOSITORY_URL}/blob/main/apps/site/src/components/ClaimRenderer.tsx`;
const DID_PACKAGE_URL = "https://github.com/ckb-devrel/ccc/tree/master/packages/did-ckb";

const DOCS_NAVIGATION: readonly { href: string; label: string; page: DocsPage }[] = [
  { href: "/docs", label: "Overview", page: "index" },
  { href: "/docs/builders", label: "For builders", page: "builders" },
  { href: "/docs/issuers", label: "For issuers", page: "issuers" },
  { href: "/docs/integrators", label: "For integrators", page: "integrators" },
];

const PAGE_SECTIONS: Record<DocsPage, readonly { id: string; label: string }[]> = {
  index: [
    { id: "choose-path", label: "Choose a path" },
    { id: "record-model", label: "Record model" },
    { id: "network-scope", label: "Network scope" },
    { id: "reference", label: "Reference" },
  ],
  builders: [
    { id: "create", label: "Create a DID" },
    { id: "profile", label: "Edit your profile" },
    { id: "verify", label: "Verify accounts" },
    { id: "score", label: "Understand the score" },
    { id: "share", label: "Share the record" },
  ],
  issuers: [
    { id: "issuer-identity", label: "Issuer identity" },
    { id: "schema", label: "Publish a schema" },
    { id: "capacity", label: "Fund the claim" },
    { id: "issue", label: "Prepare issuance" },
    { id: "signer", label: "Protect the signer" },
  ],
  integrators: [
    { id: "install", label: "Install" },
    { id: "read", label: "Read claims" },
    { id: "results", label: "Handle results" },
    { id: "schemas", label: "Resolve schemas" },
    { id: "renderers", label: "Render safely" },
    { id: "trust", label: "Choose trust policy" },
  ],
};

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href}>
      {children} <ArrowUpRight size={13} aria-hidden="true" />
    </a>
  );
}

function DocsNavigation({ page }: { page: DocsPage }) {
  return (
    <nav className="docs-nav" aria-label="Documentation guides">
      <span>Guides</span>
      {DOCS_NAVIGATION.map((item) => (
        <a
          className={item.page === page ? "active" : undefined}
          href={item.href}
          aria-current={item.page === page ? "page" : undefined}
          key={item.href}
        >
          {item.label}
        </a>
      ))}
      <span>Reference</span>
      <a href={SCHEMAS_URL}>Schema registry</a>
      <a href={CLAIM_CELL_URL}>Claim Cell protocol</a>
      <a href="/transparency">Reputation policy</a>
      <a href={DID_PACKAGE_URL}>did:ckb package</a>
    </nav>
  );
}

function TableOfContents({ page, mobile = false }: { page: DocsPage; mobile?: boolean }) {
  return (
    <nav
      className={mobile ? "docs-mobile-toc" : "docs-toc"}
      aria-label={mobile ? "Sections on this page" : "On this page"}
    >
      <span>On this page</span>
      {PAGE_SECTIONS[page].map((section) => (
        <a href={`#${section.id}`} key={section.id}>
          {section.label}
        </a>
      ))}
    </nav>
  );
}

function DocsCode({ code }: { code: string }) {
  const { copied, copy } = useCopyFeedback();

  return (
    <div className="docs-code">
      <div>
        <span className="mono">TypeScript</span>
        <button
          type="button"
          title="Copy code"
          aria-label="Copy code"
          onClick={() => void copy(code)}
        >
          <Copy size={13} aria-hidden="true" />
          {copied && <span>Copied</span>}
        </button>
      </div>
      <pre>{code}</pre>
    </div>
  );
}

function DocsLayout({
  page,
  eyebrow,
  title,
  description,
  children,
}: {
  page: DocsPage;
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="docs-layout site-content">
      <DocsNavigation page={page} />
      <article className="docs-article">
        <header className="docs-article__header">
          <span className="eyebrow">{eyebrow}</span>
          <h1>{title}</h1>
          <p>{description}</p>
        </header>
        <TableOfContents page={page} mobile />
        {children}
      </article>
      <TableOfContents page={page} />
    </div>
  );
}

function DocsIndex() {
  const paths = [
    {
      href: "/docs/builders",
      label: "Builders",
      title: "Create a portable record",
      body: "Claim a DID, publish a profile, verify accounts, and share the evidence behind your score.",
      action: "Follow the builder guide",
    },
    {
      href: "/docs/issuers",
      label: "Issuers",
      title: "Publish verifiable evidence",
      body: "Control an issuer DID, define a stable schema, fund Claim Cells, and protect the signing boundary.",
      action: "Follow the issuer guide",
    },
    {
      href: "/docs/integrators",
      label: "Integrators",
      title: "Read claims in your app",
      body: "Scan a subject, parse pinned schemas, render unknown data safely, and choose an explicit trust policy.",
      action: "Follow the integration guide",
    },
  ] as const;

  return (
    <DocsLayout
      page="index"
      eyebrow="Documentation"
      title="Build with Vellum"
      description="Task-oriented guides for people creating a record, projects issuing evidence, and applications reading Claim Cells on CKB."
    >
      <section id="choose-path" className="docs-section">
        <h2>Choose your path</h2>
        <div className="docs-path-grid">
          {paths.map((path, index) => (
            <a href={path.href} key={path.href}>
              <span className="mono">
                0{index + 1} · {path.label}
              </span>
              <h3>{path.title}</h3>
              <p>{path.body}</p>
              <strong>
                {path.action} <ArrowRight size={14} aria-hidden="true" />
              </strong>
            </a>
          ))}
        </div>
      </section>

      <section id="record-model" className="docs-section">
        <h2>One record, three responsibilities</h2>
        <dl className="docs-definition-list">
          <div>
            <dt>Subject</dt>
            <dd>Controls the lock on each Claim Cell and decides whether it remains live.</dd>
          </div>
          <div>
            <dt>Issuer</dt>
            <dd>Authorizes what it observed through the controller of a live did:ckb identity.</dd>
          </div>
          <div>
            <dt>Reader</dt>
            <dd>
              Chooses trusted issuer DIDs, schema hashes, evaluation time, and application policy.
            </dd>
          </div>
        </dl>
      </section>

      <section id="network-scope" className="docs-section">
        <h2>Current network scope</h2>
        <div className="docs-notice">
          <Fingerprint size={18} aria-hidden="true" />
          <p>
            did:ckb identity management is live on Testnet and Mainnet. Vellum Claim Cells,
            verification, and reputation are Testnet-only infrastructure and have not been audited
            for Mainnet use.
          </p>
        </div>
      </section>

      <section id="reference" className="docs-section">
        <h2>Protocol reference</h2>
        <div className="docs-link-list">
          <ExternalLink href={CLAIM_CELL_URL}>Claim Cell format and authorization</ExternalLink>
          <ExternalLink href={SCHEMAS_URL}>Published schemas and pinned hashes</ExternalLink>
          <ExternalLink href={SDK_URL}>SDK API and deployment configuration</ExternalLink>
          <a href="/transparency">Versioned reputation policy</a>
        </div>
      </section>

      <div className="docs-pagination">
        <a href="/">Back to product</a>
        <a href="/docs/builders">Start with the builder guide</a>
      </div>
    </DocsLayout>
  );
}

function BuilderDocs() {
  return (
    <DocsLayout
      page="builders"
      eyebrow="For builders"
      title="Create and share your record"
      description="Start with a wallet-controlled did:ckb identity, then add public evidence without turning your reputation into a platform account."
    >
      <section id="create" className="docs-section">
        <h2>1. Create a DID</h2>
        <p>
          Connect a CKB wallet and open the claim flow. Add the profile fields you want to publish,
          review the exact capacity, then sign one transaction. Capacity is locked in the DID Cell,
          not paid to Vellum, and returns when the identity is deactivated.
        </p>
        <a className="docs-action" href={dashboardUrl("/claim")}>
          Claim a DID <ArrowUpRight size={13} aria-hidden="true" />
        </a>
      </section>

      <section id="profile" className="docs-section">
        <h2>2. Edit your profile</h2>
        <p>
          The dashboard reads display name, avatar, and bio from the DID document's
          <code>services.profile</code> entry. Editing the document creates a new on-chain state;
          changing its controller later does not change the DID.
        </p>
        <a className="docs-action" href={dashboardUrl("/my")}>
          Manage your DID <ArrowUpRight size={13} aria-hidden="true" />
        </a>
      </section>

      <section id="verify" className="docs-section">
        <h2>3. Verify accounts</h2>
        <p>
          On Testnet, GitHub, Discord, Telegram, and Bluesky verification can issue public Claim
          Cells for your DID. Vellum uses temporary provider access to verify control; OAuth tokens,
          app passwords, private memberships, and unrelated activity are not written into claims.
        </p>
        <a className="docs-action" href={dashboardUrl("/verify")}>
          Choose a provider <ArrowUpRight size={13} aria-hidden="true" />
        </a>
      </section>

      <section id="score" className="docs-section">
        <h2>4. Understand the score</h2>
        <p>
          Vellum applies the published <code>vellum.reputation.v7</code> policy to active evidence
          from explicitly trusted issuers. The report shows category points, accepted claims, and
          exclusions. It is one transparent interpretation, not a universal trust verdict.
        </p>
        <a className="docs-action" href={dashboardUrl("/reputation")}>
          Inspect a reputation report <ArrowUpRight size={13} aria-hidden="true" />
        </a>
      </section>

      <section id="share" className="docs-section">
        <h2>5. Share the record</h2>
        <p>
          Public profiles work without a connected wallet. Open
          <code>/profile/&lt;encoded-did&gt;</code> to share identity, readable claims, policy
          output, and source transactions from one URL.
        </p>
        <a className="docs-action" href="/profile">
          Find a public profile <ArrowRight size={13} aria-hidden="true" />
        </a>
      </section>

      <div className="docs-pagination">
        <a href="/docs">Documentation overview</a>
        <a href="/docs/issuers">Next: issue evidence</a>
      </div>
    </DocsLayout>
  );
}

function IssuerDocs() {
  return (
    <DocsLayout
      page="issuers"
      eyebrow="For issuers"
      title="Issue evidence people can carry"
      description="A Claim Cell says what your project observed, under a schema readers can inspect and an issuer identity they can choose to trust."
    >
      <section id="issuer-identity" className="docs-section">
        <h2>1. Establish the issuer identity</h2>
        <p>
          V1 issuance requires a live did:ckb issuer. The SDK resolves its current controller and
          requires the issuer signer to control that lock. Rotation changes the authorized key
          without changing the issuer DID readers pin in policy.
        </p>
        <a className="docs-action" href={dashboardUrl("/claim")}>
          Create an issuer DID <ArrowUpRight size={13} aria-hidden="true" />
        </a>
      </section>

      <section id="schema" className="docs-section">
        <h2>2. Publish a stable schema</h2>
        <p>
          Give the payload an immutable versioned ID, publish its JSON manifest and field semantics,
          and identify it with <code>CKB_HASH(JCS(manifest))</code>. A semantic or shape change
          needs a new version and hash. Schema publication does not make an issuer trusted.
        </p>
        <ExternalLink href={SCHEMAS_URL}>Review the schema registry</ExternalLink>
      </section>

      <section id="capacity" className="docs-section">
        <h2>3. Fund the Claim Cell</h2>
        <p>
          By default, <code>issuerSigner</code> supplies the exact occupied capacity and transaction
          fee. A separate <code>payerSigner</code> may fund the transaction, but payment does not
          grant issuer authority. The subject controls the output lock and recovers its capacity if
          they destroy the claim.
        </p>
      </section>

      <section id="issue" className="docs-section">
        <h2>4. Prepare issuance with the SDK</h2>
        <p>
          Load the published Testnet script configuration, then provide the subject, issuer DID,
          schema hash, payload, and issuance time. The helper returns an unsigned, balanced
          transaction so the application can inspect it before collecting signatures.
        </p>
        <DocsCode code={ISSUE_CLAIM_EXAMPLE} />
        <ExternalLink href={SDK_EXAMPLE_URL}>Open the complete executable example</ExternalLink>
      </section>

      <section id="signer" className="docs-section">
        <h2>5. Protect the signing boundary</h2>
        <ul className="docs-checklist">
          <li>
            <Check size={14} aria-hidden="true" /> Keep issuer keys in server-only configuration.
          </li>
          <li>
            <Check size={14} aria-hidden="true" /> Never expose them through public environment
            variables, logs, or claim payloads.
          </li>
          <li>
            <Check size={14} aria-hidden="true" /> Confirm signing did not change the prepared
            transaction hash before broadcast.
          </li>
          <li>
            <Check size={14} aria-hidden="true" /> Record the submitted transaction and wait for the
            confirmations your product requires.
          </li>
        </ul>
      </section>

      <div className="docs-pagination">
        <a href="/docs/builders">Previous: builder guide</a>
        <a href="/docs/integrators">Next: read claims</a>
      </div>
    </DocsLayout>
  );
}

function IntegratorDocs() {
  return (
    <DocsLayout
      page="integrators"
      eyebrow="For integrators"
      title="Read claims without outsourcing trust"
      description="The SDK returns the complete live record and its verification states. Your application remains responsible for schema and issuer policy."
    >
      <section id="install" className="docs-section">
        <h2>1. Install the SDK</h2>
        <p>
          Add <code>@usevellum/sdk</code> and <code>@ckb-ccc/core</code> to an ESM browser or server
          application. Copy the current Testnet Claim Type and DID Lock configuration from the
          executable SDK example rather than retyping deployment hashes.
        </p>
        <ExternalLink href={SDK_URL}>Open SDK installation and deployment details</ExternalLink>
      </section>

      <section id="read" className="docs-section">
        <h2>2. Read every live claim</h2>
        <p>
          Pass an exact subject and an explicit Unix evaluation time. A did:ckb subject uses DID
          Lock; applications may query another complete CKB lock directly when needed.
        </p>
        <DocsCode code={READ_CLAIMS_EXAMPLE} />
        <ExternalLink href={SDK_EXAMPLE_URL}>Open the complete executable example</ExternalLink>
      </section>

      <section id="results" className="docs-section">
        <h2>3. Handle complete and invalid results</h2>
        <p>
          <code>claims</code> contains decoded live cells. <code>invalid</code> reports malformed or
          unsupported cells without hiding valid ones. A failed subject scan rejects the read
          because a partial result could produce an unsafe decision. Treat unavailable, deactivated,
          or ambiguous issuer state as untrusted.
        </p>
      </section>

      <section id="schemas" className="docs-section">
        <h2>4. Resolve the pinned schema</h2>
        <p>
          Match <code>claim.schemaHash</code> against a registry your application ships or pins. The
          Vellum registry keeps each ID, hash, manifest, parser, specification, and valid example
          together. Parse only after the exact hash matches; a familiar display name is not enough.
        </p>
        <ExternalLink href={SCHEMAS_URL}>Inspect published schema definitions</ExternalLink>
      </section>

      <section id="renderers" className="docs-section">
        <h2>5. Render registered payloads safely</h2>
        <p>
          Dispatch renderers by exact schema hash, run the matching payload parser, and catch parser
          rejection. Unknown schemas still belong in the record, but render them as bounded raw data
          and label them unregistered. Never turn renderer support into implicit issuer trust.
        </p>
        <ExternalLink href={RENDERER_URL}>Review the tested Vellum renderer registry</ExternalLink>
      </section>

      <section id="trust" className="docs-section">
        <h2>6. Choose an explicit trust policy</h2>
        <div className="docs-notice">
          <FileCheck2 size={18} aria-hidden="true" />
          <p>
            Pin issuer DIDs and schema hashes for each decision, keep evaluation time explicit, and
            version the resulting policy. Claim validity proves authorization and structure; your
            policy decides whether that evidence is relevant.
          </p>
        </div>
      </section>

      <div className="docs-pagination">
        <a href="/docs/issuers">Previous: issuer guide</a>
        <a href="/transparency">Next: reputation policy</a>
      </div>
    </DocsLayout>
  );
}

export function Docs({ page = "index" }: { page?: DocsPage }) {
  switch (page) {
    case "builders":
      return <BuilderDocs />;
    case "issuers":
      return <IssuerDocs />;
    case "integrators":
      return <IntegratorDocs />;
    default:
      return <DocsIndex />;
  }
}
