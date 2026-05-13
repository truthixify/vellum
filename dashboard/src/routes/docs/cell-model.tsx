import { createFileRoute } from "@tanstack/react-router";

import { useDocumentTitle } from "@/hooks/use-document-title";

export const Route = createFileRoute("/docs/cell-model")({
  component: CellModelPage,
});

function CellModelPage() {
  useDocumentTitle("Cell model · Docs");
  return (
    <>
      <div className="mono-caps text-muted-foreground mb-3">PRIMER · CKB</div>
      <h1 className="text-4xl md:text-5xl font-medium mb-6">Cell model.</h1>
      <p className="text-base leading-[1.6] text-ink mb-12 max-w-[60ch]">
        Nervos CKB uses an evolved UTXO model. Where Bitcoin tracks coins, CKB tracks
        Cells, and a Cell can carry arbitrary data plus the rules that govern it. Your
        did:ckb lives inside one of these Cells.
      </p>

      <Section title="What is a Cell">
        <p>A Cell has four parts:</p>
        <ul className="list-disc pl-6 my-4 space-y-1.5">
          <li>
            <strong>Capacity</strong>. CKB tokens locked as storage rent. One CKByte
            buys you one byte of state. A typical DID Cell uses around 600 CKBytes
            (about ~600 CKB).
          </li>
          <li>
            <strong>Data</strong>. Arbitrary binary content. For a DID, this is the
            Molecule-encoded <Code>DidCkbData</Code>.
          </li>
          <li>
            <strong>Lock Script</strong>. A small program that says who can spend the
            Cell. Standard locks are secp256k1, multi-sig, omnilock.
          </li>
          <li>
            <strong>Type Script</strong>. An optional program that says how the Cell
            can change. The did-ckb Type Script enforces the create/update/deactivate
            rules.
          </li>
        </ul>
      </Section>

      <Section title="Live and Dead Cells">
        <p>
          A Cell is either <strong>Live</strong> (created, not yet spent) or{" "}
          <strong>Dead</strong> (spent in some later transaction). Live Cells are
          what a resolver searches. Dead Cells are history; you can read them via
          past transactions but they no longer represent current state.
        </p>
        <p>
          Updating a DID means consuming the current Live Cell and producing a new
          one with the same identifier. The first Cell becomes Dead; the new one is
          Live. The identifier stays put.
        </p>
      </Section>

      <Section title="Why this matters for identity">
        <p>
          On account-based chains (Ethereum, Solana), an identity is a key. Rotate
          the key and you lose the identity. On CKB, the identity is the Cell, and
          the key is the Lock Script on that Cell. You can rotate the Lock Script in
          a single transaction and the Cell's type-script args (the identifier) stay
          identical.
        </p>
        <p>
          The Cell is the document. The Lock Script is the seal. Replacing the seal
          does not replace the document.
        </p>
      </Section>

      <Section title="Storage rent, not gas-per-edit">
        <p>
          CKB charges for the bytes you occupy on chain, not for each edit. The DID
          Cell holds your ~600 CKB while it exists. Updates pay only the network fee
          (well under 0.01 CKB). Deactivation burns the Cell and returns the locked
          capacity to your wallet in the same transaction. Lost is genuinely lost
          only if you lose the key, not because the chain ate your money.
        </p>
      </Section>

      <Section title="Further reading">
        <p>
          The canonical reference is{" "}
          <a
            href="https://github.com/nervosnetwork/rfcs/blob/master/rfcs/0002-ckb/0002-ckb.md"
            target="_blank"
            rel="noreferrer"
            className="text-cobalt underline"
          >
            Nervos CKB RFC-0002
          </a>
          . For a Cell-specific deep dive,{" "}
          <a
            href="https://docs.nervos.org/docs/script/type-id"
            target="_blank"
            rel="noreferrer"
            className="text-cobalt underline"
          >
            the type-id pattern
          </a>{" "}
          documentation is closest to what did:ckb does for identifiers.
        </p>
      </Section>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-12">
      <h2 className="text-2xl font-medium mb-4 border-b border-ink pb-3">{title}</h2>
      <div className="text-base leading-[1.65] text-ink space-y-4">{children}</div>
    </section>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="font-mono text-[0.92em] bg-paper border border-hairline px-1.5 py-0.5">
      {children}
    </code>
  );
}
