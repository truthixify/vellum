import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/docs/resolution")({
  component: ResolutionPage,
});

function ResolutionPage() {
  return (
    <>
      <div className="mono-caps text-muted-foreground mb-3">SPEC · RESOLUTION</div>
      <h1 className="text-4xl md:text-5xl font-medium mb-6">Resolution.</h1>
      <p className="text-base leading-[1.6] text-ink mb-12 max-w-[60ch]">
        Resolution is the act of turning a DID string into a document. With did:ckb
        the chain is the only source of truth, so a resolver is just an indexer
        query plus a decode.
      </p>

      <Section title="From string to args">
        <p>
          Every did:ckb decodes to 20 bytes via{" "}
          <Code>base32(lowercase, no padding)</Code>. Those 20 bytes are the args of
          the did-ckb Type Script. The args plus the type script's code hash uniquely
          identify the Cell that holds the document.
        </p>
        <CodeBlock>{`did:ckb:qq2m72a2vas4e5ovcpxoedscguuu4nba
        |
        v   base32 decode
20 bytes   →   used as type-script args`}</CodeBlock>
      </Section>

      <Section title="Indexer lookup">
        <p>
          Vellum uses CCC's <Code>findCellsByType</Code> against the chain client.
          The query is exact on <Code>code_hash + hash_type + args</Code>. In the
          common case it returns one Live Cell.
        </p>
        <CodeBlock>{`const type = {
  codeHash: deployment.codeHash,
  hashType: "type",
  args: didToArgs(did),
};
for await (const cell of client.findCellsByType(type, true)) {
  // decode cell.outputData
}`}</CodeBlock>
      </Section>

      <Section title="Decoding">
        <p>Two layers wrap the document:</p>
        <ul className="list-disc pl-6 my-4 space-y-1.5">
          <li>
            <strong>Outer</strong>. Molecule union <Code>DidCkbData</Code> with
            variant <Code>DidCkbDataV1</Code>, carrying <Code>document</Code> bytes
            and an optional <Code>local_id</Code> string.
          </li>
          <li>
            <strong>Inner</strong>. The <Code>document</Code> field is DAG-CBOR
            encoded JSON. Decode it to get the live{" "}
            <Code>verificationMethods</Code>, <Code>alsoKnownAs</Code>, and{" "}
            <Code>services</Code> map.
          </li>
        </ul>
      </Section>

      <Section title="Conflict resolution">
        <p>
          The identifier algorithm makes collisions structurally impossible (you'd
          need to spend the same input twice, which CKB forbids). The spec still
          provides a deterministic tie-breaker for resolvers that see anomalies: pick
          the Cell created earliest by block height, with outPoint ordering as the
          secondary key.
        </p>
        <p>
          Until a real collision is observed in the wild, conflict resolution code is
          defensive scaffolding rather than load-bearing.
        </p>
      </Section>

      <Section title="Reverse lookup">
        <p>
          Going from a CKB address to the DIDs it controls is the same query the
          other way around: filter Live Cells by Lock Script, restricting to the
          did-ckb Type Script <Code>code_hash</Code>. The Vellum dashboard does this
          on the <Link to="/my" className="text-cobalt underline">My DID</Link>{" "}
          surface to populate the multi-DID switcher.
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
