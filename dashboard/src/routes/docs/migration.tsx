import { createFileRoute } from "@tanstack/react-router";

import { useDocumentTitle } from "@/hooks/use-document-title";

export const Route = createFileRoute("/docs/migration")({
  component: MigrationPage,
});

function MigrationPage() {
  useDocumentTitle("Migration · Docs");
  return (
    <>
      <div className="mono-caps text-muted-foreground mb-3">SPEC · WIP-02</div>
      <h1 className="text-4xl md:text-5xl font-medium mb-6">did:plc migration.</h1>
      <p className="text-base leading-[1.6] text-ink mb-12 max-w-[60ch]">
        Migration brings an existing did:plc identity (typical for AT Protocol /
        Bluesky users) onto CKB without abandoning the history. The migration is
        authorized by one of the source DID's rotation keys, and there is a 72-hour
        window after submission during which a higher-priority key can contest.
      </p>

      <div className="border-2 border-verdant bg-paper px-6 py-4 mb-12">
        <div className="mono-caps text-verdant mb-1">LIVE</div>
        <p className="text-sm text-ink">
          Migration is wired end-to-end on Vellum. The dashboard fetches the
          source did:plc log from <span className="font-mono">plc.directory</span>,
          signs the CKB tx hash with one of the genesis rotation keys you
          provide, attaches the witness, and submits. Start a migration from
          the <a className="text-cobalt underline" href="/migrate">/migrate</a>{" "}
          route.
        </p>
      </div>

      <Section title="What flows on chain">
        <p>The migration transaction has three notable pieces:</p>
        <ul className="list-disc pl-6 my-4 space-y-1.5">
          <li>
            A new DID Metadata Cell with <Code>local_id</Code> set to the source
            did:plc string (UTF-8 encoded). The args of this Cell follow the same
            type-id algorithm as a plain create.
          </li>
          <li>
            A witness in the corresponding slot of <Code>tx.witnesses</Code>,
            structured as <Code>WitnessArgs.output_type</Code> carrying a Molecule{" "}
            <Code>DidCkbWitness</Code>. Inside is a <Code>PlcAuthorization</Code>{" "}
            with the source DID's operation history, a signature over the CKB tx
            hash, and the rotation-key indices used.
          </li>
          <li>
            Cell deps for the did-ckb Type Script, plus whatever the chosen Lock
            Script needs.
          </li>
        </ul>
      </Section>

      <Section title="The 72-hour window">
        <p>
          The migration is not final the moment it lands on chain. For 72 hours
          (measured by block timestamps), a higher-priority rotation key from the
          source did:plc can submit a competing migration and overwrite the
          candidate. After 72 hours plus 50 confirmations, the migration is sealed.
        </p>
        <p>
          Higher priority means lexicographically earlier{" "}
          <Code>rotation_key_indices</Code> in the witness. This mirrors the
          recovery semantics of the underlying did:plc method.
        </p>
      </Section>

      <Section title="What gets validated on chain">
        <p>
          The did-ckb Type Script in mint mode (no input DID Cell, one output) walks
          the operation history end-to-end:
        </p>
        <ul className="list-disc pl-6 my-4 space-y-1.5">
          <li>
            Every operation must be DAG-CBOR encoded with{" "}
            <Code>type = "plc_operation"</Code> or, for the genesis,{" "}
            <Code>type = "create"</Code> (the legacy format).
          </li>
          <li>
            The genesis must have <Code>prev = null</Code>. Every subsequent
            operation's <Code>prev</Code> must match the CID of the previous one.
          </li>
          <li>
            Each operation's <Code>sig</Code> is verified against the relevant
            rotation key (secp256k1 or secp256r1).
          </li>
          <li>
            The PLC method-specific identifier is recomputed from the genesis and
            must equal the <Code>local_id</Code> in the output Cell.
          </li>
          <li>
            The final signature in the witness must be a valid signature over the
            CKB transaction hash, produced by a rotation key of the last operation
            in history.
          </li>
        </ul>
      </Section>

      <Section title="Status today">
        <p>
          The on-chain side is shipped and tested in the upstream did-ckb repository.
          The dashboard wiring (form, witness assembly, signature path) is open and
          will land alongside a small JS helper module that wraps{" "}
          <Code>@did-plc/lib</Code> for the operation history construction.
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
