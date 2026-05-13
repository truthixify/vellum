import { createFileRoute, Link } from "@tanstack/react-router";

import { useDocumentTitle } from "@/hooks/use-document-title";

export const Route = createFileRoute("/docs/")({
  component: DocsIndex,
});

const CARDS: Array<{
  to: "/docs/did-ckb" | "/docs/cell-model" | "/docs/resolution" | "/docs/migration";
  number: string;
  title: string;
  body: string;
}> = [
  {
    to: "/docs/did-ckb",
    number: "01",
    title: "did:ckb method",
    body:
      "The identifier algorithm (type-id style BLAKE2b truncated to 20 bytes), the document shape compatible with did:plc, and the create/update/deactivate lifecycle as enforced by the on-chain Type Script.",
  },
  {
    to: "/docs/cell-model",
    number: "02",
    title: "CKB Cell model",
    body:
      "A primer on the unit of state your DID lives in. Capacity (storage rent), Lock Script (who controls it), Type Script (state-transition rules), and what Live vs Dead means.",
  },
  {
    to: "/docs/resolution",
    number: "03",
    title: "Resolution",
    body:
      "How a did:ckb identifier becomes a document. Indexer queries by type-script args, molecule + DAG-CBOR decoding, conflict resolution when more than one cell claims an identifier, and the reverse-lookup path from a CKB address.",
  },
  {
    to: "/docs/migration",
    number: "04",
    title: "did:plc migration",
    body:
      "How an existing AT Protocol identity lands on CKB without losing its history. The 72-hour finalisation window, the rotation-key contest path, and what the local_id field is doing.",
  },
];

function DocsIndex() {
  useDocumentTitle("Docs");
  return (
    <>
      <div className="mono-caps text-muted-foreground mb-3">DOCUMENTATION · 0.1</div>
      <h1 className="text-4xl md:text-5xl font-medium mb-6">Vellum documentation.</h1>
      <p className="text-base leading-[1.6] text-ink mb-3">
        Vellum is a reference dashboard for{" "}
        <span className="font-mono">did:ckb</span>, the Decentralized Identifier method
        defined in <span className="font-mono">WIP-01</span> and implemented in the
        upstream <span className="font-mono">did-ckb</span> repository. These pages
        explain the method in the level of detail a holder, an integrator, or a
        reviewer would need.
      </p>
      <p className="text-base leading-[1.6] text-ink mb-12">
        Start with the method spec, then read about the Cell model if you have not
        worked with CKB before. The resolution page covers how documents are read off
        the chain, and the migration page covers bringing an existing{" "}
        <span className="font-mono">did:plc</span> identity over.
      </p>

      <div className="grid sm:grid-cols-2 gap-6 mb-16">
        {CARDS.map((card) => (
          <Link
            key={card.to}
            to={card.to}
            className="block border-2 border-ink p-6 hover:bg-ink hover:text-paper transition-colors group"
          >
            <div className="mono-caps text-muted-foreground group-hover:text-paper mb-2">
              {card.number}
            </div>
            <h3 className="text-xl font-medium mb-3">{card.title}</h3>
            <p className="text-sm leading-[1.55]">{card.body}</p>
          </Link>
        ))}
      </div>

      <div className="border border-ink p-6 bg-paper">
        <div className="mono-caps text-muted-foreground mb-2">CONVENTIONS</div>
        <p className="text-sm leading-[1.6]">
          Mono blocks are encoded on chain.{" "}
          <span className="font-mono">did:ckb:&lt;32 base32 chars&gt;</span> is the
          canonical identifier string.{" "}
          <span className="font-mono">testnet</span> code hash{" "}
          <span className="font-mono break-all">
            0x510150477b10d6ab551a509b71265f3164e9fd4137fcb5a4322f49f03092c7c5
          </span>{" "}
          and <span className="font-mono">mainnet</span> code hash{" "}
          <span className="font-mono break-all">
            0x4a06164dc34dccade5afe3e847a97b6db743e79f5477fa3295acf02849c5984a
          </span>{" "}
          are what the resolver and tx builder use today.
        </p>
      </div>
    </>
  );
}
