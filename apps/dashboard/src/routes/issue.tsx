import { AlertCircle, Check } from "lucide-react";
import { createFileRoute } from "@tanstack/react-router";
import { PreviewBadge, StatusMark } from "@vellum/ui";
import { useState } from "react";

import { useDocumentTitle } from "@/hooks/use-document-title";

export const Route = createFileRoute("/issue")({ component: IssueClaim });

const SCHEMAS = [
  {
    key: "contribution",
    title: "Contribution",
    id: "vellum.contribution/1",
    description: "A bounded statement about protocol or community work.",
  },
  {
    key: "credential",
    title: "Education credential",
    id: "vellum.credential.education/1",
    description: "Completion evidence issued by a learning provider.",
  },
  {
    key: "attestation",
    title: "Review attestation",
    id: "vellum.attestation.review/2",
    description: "A scoped peer-review statement with a source reference.",
  },
] as const;

function IssueClaim() {
  useDocumentTitle("Issue a claim");
  const [selected, setSelected] = useState<(typeof SCHEMAS)[number]>(SCHEMAS[0]);
  const [schemaQuery, setSchemaQuery] = useState("");
  const visibleSchemas = SCHEMAS.filter((schema) =>
    `${schema.title} ${schema.id}`.toLowerCase().includes(schemaQuery.trim().toLowerCase()),
  );
  return (
    <div className="preview-page preview-page--wide">
      <header className="preview-page__header">
        <div>
          <h1>Issue a claim</h1>
          <p>
            Compose evidence about another identity under a published schema. The subject can always
            see who prepared it.
          </p>
        </div>
        <PreviewBadge label="Preview data - signing unavailable" />
      </header>
      <div className="issue-layout">
        <section className="schema-picker">
          <label htmlFor="schema-search">Schema</label>
          <input
            id="schema-search"
            placeholder="Search schemas"
            value={schemaQuery}
            onChange={(event) => setSchemaQuery(event.target.value)}
          />
          <div>
            {visibleSchemas.map((schema) => (
              <button
                key={schema.key}
                className={selected.key === schema.key ? "active" : ""}
                onClick={() => setSelected(schema)}
              >
                <strong>{schema.title}</strong>
                <span className="mono">{schema.id}</span>
              </button>
            ))}
            {visibleSchemas.length === 0 && (
              <p className="schema-picker__empty">No matching schemas</p>
            )}
          </div>
        </section>
        <section className="claim-form">
          <h2>{selected.title}</h2>
          <p>{selected.description}</p>
          <div className="form-stack">
            <label>
              Subject identity
              <input value="did:ckb:0x8f2a...c41d" readOnly />
              <small className="positive">
                <Check size={12} />
                Example resolved - Rae Maddox on CKB Testnet
              </small>
            </label>
            <label>
              Statement
              <input defaultValue="Protocol contribution - 14 merged pull requests" />
              <small>Plain description shown in the evidence ledger. 120 characters maximum.</small>
            </label>
            <div className="form-grid">
              <label>
                Merged pull requests
                <input defaultValue="14" inputMode="numeric" />
                <small>Integer, required by the schema.</small>
              </label>
              <label>
                Repository
                <input defaultValue="vellum/protocol" />
                <small>Optional source reference.</small>
              </label>
            </div>
            <div className="form-grid">
              <label>
                Issued at
                <input defaultValue="2026-09-07" type="date" />
              </label>
              <label>
                Expires
                <input className="invalid" defaultValue="2026-09-01" type="date" />
                <small className="danger">
                  <AlertCircle size={12} />
                  Expiry must be after the issued date
                </small>
              </label>
            </div>
          </div>
          <div className="form-submit">
            <button className="v-button v-button--quiet" disabled>
              Sign and issue
            </button>
            <span>Issuance is not wired to a Claim Cell adapter.</span>
          </div>
        </section>
        <aside className="claim-preview">
          <div className="preview-surface">
            <h3>Claim preview</h3>
            <div>
              <small>Schema</small>
              <strong className="mono">{selected.id}</strong>
              <small>Subject</small>
              <strong className="mono">did:ckb:0x8f2a...c41d</strong>
              <pre>{`{\n  "merged": 14,\n  "repo": "vellum/protocol",\n  "expiresAt": null\n}`}</pre>
              <span>Normalized value that would be written.</span>
            </div>
          </div>
          <div className="preview-surface">
            <h3>Issuing as</h3>
            <div>
              <strong>Example issuer</strong>
              <span className="mono">did:ckb:0x91c4...7ab2</span>
              <StatusMark tone="neutral" icon={false}>
                Registry not deployed
              </StatusMark>
              <span>Listing would describe registry state, not prove the statement true.</span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
