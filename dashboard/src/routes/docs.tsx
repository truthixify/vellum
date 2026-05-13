import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/docs")({
  component: DocsPage,
});

const SECTIONS = [
  ["What is a DID?", "A Decentralized Identifier is a string you control without an issuing authority. did:ckb is a method that anchors that string to a single Cell on the Nervos CKB blockchain. The string is yours for as long as the Cell exists."],
  ["What is a Cell?", "CKB's atomic unit of state. A Cell holds capacity (CKB locked as storage rent), a Lock Script (who can spend it), and arbitrary data (your DID document). Updating the document means consuming the Cell and producing a new one with the same identifier."],
  ["The cost model", "Storage on CKB is rent, not fee-per-edit. You lock ~600 CKB to hold the Cell. Editing costs only network fee (~0.01 CKB). Deactivating returns your locked capacity in full."],
  ["Key rotation vs. DID rotation", "Your Lock Script controls who can update the DID. Rotating the Lock Script changes the key but keeps the DID. The DID itself does not rotate; only the controlling key does."],
  ["The migration window", "Migrating from did:plc creates a new did:ckb in MIGRATING state for 72 hours. During this window, a higher-priority rotation key from the source DID can overwrite the migration. After the window plus 50 confirmations, it is final."],
  ["Resolver behavior", "Anyone can read a did:ckb document by querying CKB. Vellum's resolver is one of many; the chain is the source of truth."],
  ["Recovering a contested DID", "If two live Cells claim the same identifier (extremely rare), the one with earliest block height wins. The other is marked CONTESTED."],
];

function DocsPage() {
  return (
    <div className="max-w-[1200px] mx-auto px-6 lg:px-12 py-16">
      <div className="grid lg:grid-cols-[240px_1fr] gap-16">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="mono-caps text-muted-foreground mb-4">CONTENTS</div>
          <ul className="space-y-3">
            {SECTIONS.map(([t]) => (
              <li key={t}>
                <a href={`#${slug(t)}`} className="mono-caps text-ink hover:text-cobalt block">{t}</a>
              </li>
            ))}
          </ul>
        </aside>

        <article className="max-w-[64ch]">
          <div className="mono-caps text-muted-foreground mb-3">SPEC</div>
          <h1 className="text-4xl md:text-5xl font-medium mb-12">did:ckb documentation.</h1>
          {SECTIONS.map(([t, b]) => (
            <section key={t} id={slug(t)} className="mb-16">
              <h2 className="text-2xl font-medium mb-4 border-b border-ink pb-3">{t}</h2>
              <p className="text-base leading-[1.6] text-ink">{b}</p>
            </section>
          ))}

          <section className="mb-16">
            <h2 className="text-2xl font-medium mb-4 border-b border-ink pb-3">Document schema</h2>
            <div className="border border-ink border-l-[3px] bg-paper">
              <pre className="font-mono text-xs p-5 overflow-x-auto">
{`{
  "id": "did:ckb:qq2m72yfxs8wn3v0c46aaxzhe6up4u4nba",
  "verificationMethod": [...],
  "services": {
    "profile": "https://example.com/profile"
  },
  "alsoKnownAs": ["did:plc:k4z2tlzy5j7w3e6m"]
}`}
              </pre>
            </div>
          </section>
        </article>
      </div>
    </div>
  );
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
