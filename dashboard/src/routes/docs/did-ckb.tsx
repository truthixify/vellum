import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/docs/did-ckb")({
  component: DidCkbPage,
});

function DidCkbPage() {
  return (
    <>
      <div className="mono-caps text-muted-foreground mb-3">SPEC · WIP-01</div>
      <h1 className="text-4xl md:text-5xl font-medium mb-6">did:ckb method.</h1>
      <p className="text-base leading-[1.6] text-ink mb-12 max-w-[60ch]">
        A Decentralized Identifier method that puts the entire identity record into a
        single Cell on the Nervos CKB blockchain. The identifier is permanent for the
        life of the Cell, and the document inside it is rendered directly from chain
        state with no central authority.
      </p>

      <Section title="Identifier format">
        <p>
          Every did:ckb starts with <Code>did:ckb:</Code> followed by a 32-character,
          lowercase, no-padding base32 (RFC 4648) string. The 32 characters decode to
          20 raw bytes.
        </p>
        <CodeBlock>{`did:ckb:qq2m72a2vas4e5ovcpxoedscguuu4nba`}</CodeBlock>
      </Section>

      <Section title="Identifier algorithm">
        <p>
          The 20 args bytes are the first 20 bytes of a BLAKE2b 32-byte digest with
          personalization <Code>ckb-default-hash</Code>. The pre-image is, in order:
        </p>
        <ul className="list-disc pl-6 my-4 space-y-1.5">
          <li>
            <Code>inputs[0].since</Code> as 8 bytes little-endian
          </li>
          <li>
            <Code>inputs[0].previous_output.tx_hash</Code> as 32 bytes
          </li>
          <li>
            <Code>inputs[0].previous_output.index</Code> as 4 bytes little-endian
          </li>
          <li>
            output index of the DID Metadata Cell as 8 bytes little-endian
          </li>
        </ul>
        <p>
          The construction is identical to CKB's type-id pattern, which makes
          collision practically impossible (a Cell can only be spent once) and means
          front-running is structurally prevented (you can't predict the args without
          owning the input).
        </p>
      </Section>

      <Section title="Document shape">
        <p>
          The Cell data is a Molecule-encoded <Code>DidCkbData</Code> union with a
          single variant today: <Code>DidCkbDataV1</Code>, carrying a
          DAG-CBOR-encoded document and an optional <Code>local_id</Code> string used
          for migration. The document itself uses fields compatible with{" "}
          <Code>did:plc</Code>:
        </p>
        <CodeBlock>{`{
  "verificationMethods": { "atproto": "did:key:zSigningKey" },
  "alsoKnownAs": ["at://alice.example"],
  "services": {
    "atproto_pds": {
      "type": "AtprotoPersonalDataServer",
      "endpoint": "https://example.com"
    },
    "profile": {
      "type": "VellumProfile",
      "endpoint": "inline",
      "displayName": "Margot Weil",
      "bio": "Conservation lab tech."
    }
  }
}`}</CodeBlock>
        <p>
          The on-chain Type Script only validates that the document is valid CBOR; it
          does not enforce a schema. The <Code>services.profile</Code> convention is
          Vellum-specific and carries the human-friendly profile inline.
        </p>
      </Section>

      <Section title="Operations">
        <p>The Type Script recognises three transaction shapes:</p>
        <ul className="list-disc pl-6 my-4 space-y-1.5">
          <li>
            <strong>Create</strong>: no DID Cell in inputs, exactly one in outputs.
            The args must match the identifier algorithm above. If{" "}
            <Code>local_id</Code> is set, the witness must carry valid PLC
            authorization (see Migration).
          </li>
          <li>
            <strong>Update</strong>: one DID Cell in, one out, same args, same{" "}
            <Code>local_id</Code>. Authorization comes from the Lock Script.
          </li>
          <li>
            <strong>Deactivate</strong>: one DID Cell in, no Cell with the same args
            out. The Cell's capacity returns to the spender. Permanent.
          </li>
        </ul>
      </Section>

      <Section title="Authorization">
        <p>
          The Lock Script on the DID Cell is the authority. Updating or deactivating
          requires its signature. The Lock Script can be rotated in an update
          transaction without changing the identifier, which is the whole point: your
          key changes, your DID does not.
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

function CodeBlock({ children }: { children: string }) {
  return (
    <div className="border border-ink border-l-[3px] bg-paper my-4">
      <pre className="font-mono text-xs p-5 overflow-x-auto leading-[1.55]">
        {children}
      </pre>
    </div>
  );
}
