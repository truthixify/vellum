import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Manifest, IdTab, Brackets, MetaStrip, FieldRow, Tag } from "@/components/vellum/Manifest";
import { VButton } from "@/components/vellum/VButton";

export const Route = createFileRoute("/resolve")({
  head: () => ({
    meta: [
      { title: "Resolve a DID — Vellum" },
      { name: "description", content: "Look up any did:ckb identifier and view its on-chain document." },
      { property: "og:title", content: "Resolve a DID — Vellum" },
    ],
  }),
  component: ResolvePage,
});

function ResolvePage() {
  const [did, setDid] = useState("");
  const [resolved, setResolved] = useState<string | null>(null);

  return (
    <div className="max-w-[1100px] mx-auto px-6 lg:px-12 py-16">
      <div className="mono-caps text-muted-foreground mb-3">REGISTRY · LOOKUP</div>
      <h1 className="text-4xl md:text-5xl font-medium mb-12">Resolve any DID.</h1>

      <form
        onSubmit={(e) => { e.preventDefault(); setResolved(did || "did:ckb:qq2m72yfxs8wn3v0c46aaxzhe6up4u4nba"); }}
        className="flex flex-col sm:flex-row gap-3 mb-16"
      >
        <input
          value={did}
          onChange={(e) => setDid(e.target.value)}
          placeholder="did:ckb:..."
          className="flex-1 h-14 bg-paper border border-ink px-4 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-verdant"
        />
        <VButton type="submit" variant="verdant" className="h-14 px-8">Resolve</VButton>
      </form>

      {!resolved && (
        <div className="border-2 border-ink p-20 text-center">
          <div className="w-12 h-12 mx-auto mb-6 border-2 border-verdant" />
          <div className="mono-caps text-muted-foreground">PASTE A DID TO RESOLVE</div>
          <p className="mt-3 text-muted-foreground">Public records are free to read.</p>
        </div>
      )}

      {resolved && (
        <div className="pt-4 pl-4">
          <Manifest
            idTab={<IdTab>VL · DID:CKB</IdTab>}
            state="ACTIVE"
            offset
            footerLeft="VELLUM · PUBLIC RECORD · READ-ONLY"
            footerRight="REV 04 / 04"
          >
            <div className="px-6 pt-8 pb-6">
              <div className="mono-caps text-muted-foreground mb-3">REGISTERED IDENTIFIER</div>
              <Brackets className="block">
                <div className="font-mono text-[20px] md:text-[28px] leading-tight break-all">{resolved}</div>
              </Brackets>
            </div>
            <MetaStrip
              items={[
                { label: "Block of last update", value: "17,402,108" },
                { label: "Operations", value: "04" },
                { label: "Also known as", value: "01" },
                { label: "Services", value: "02" },
              ]}
            />
            <div>
              <FieldRow label="Display name" value={<span className="text-2xl font-medium">Margot Weil</span>} />
              <FieldRow label="Bio" value="Conservation lab tech. Writes about ledgers, paper, and the long now." />
              <FieldRow label="Handles" mono value={
                <div className="flex flex-wrap gap-2 items-center">
                  <Tag>AT PROTOCOL</Tag><span>@margot.bsky.social</span>
                </div>
              } />
              <FieldRow label="Verification method" mono value={
                <div className="flex flex-wrap gap-2 items-center">
                  <Tag>SECP256K1</Tag><span className="break-all">0x8a3f...c41d</span>
                </div>
              } />
              <FieldRow label="Also known as" mono value={
                <div className="flex flex-wrap gap-2 items-center">
                  <Tag variant="cobalt">MIGRATED FROM PLC</Tag>
                  <span className="break-all">did:plc:k4z2tlzy5j7w3e6m</span>
                </div>
              } />
            </div>
          </Manifest>
        </div>
      )}
    </div>
  );
}
