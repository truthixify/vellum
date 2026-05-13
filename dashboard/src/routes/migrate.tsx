import { createFileRoute } from "@tanstack/react-router";
import { Manifest, IdTab, Brackets, MetaStrip, FieldRow, Tag } from "@/components/vellum/Manifest";
import { VButton } from "@/components/vellum/VButton";

export const Route = createFileRoute("/migrate")({
  component: MigratePage,
});

function MigratePage() {
  return (
    <div className="max-w-[1200px] mx-auto px-6 lg:px-12 py-16">
      <div className="mono-caps text-muted-foreground mb-3">REGISTRY · MIGRATION</div>
      <h1 className="text-4xl md:text-5xl font-medium mb-4">Migrate from did:plc.</h1>
      <p className="text-muted-foreground mb-12 max-w-[60ch]">
        Move an existing did:plc identity onto CKB. Authorize with a rotation key, then wait the 72-hour window for finality.
      </p>

      <div className="mb-12 border-2 border-cobalt bg-paper px-6 py-4">
        <div className="mono-caps text-cobalt mb-1">PREVIEW</div>
        <p className="text-sm text-ink max-w-[78ch]">
          The migration UI is a visual preview. The on-chain logic (PLC operation history validation,
          witness construction, rotation-key signature over the CKB tx hash) lands in the next
          iteration. The illustration below shows the source and target shape you will see when it ships.
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-8 mb-16 relative">
        <div className="pt-4 pl-4">
          <Manifest
            idTab={<IdTab color="cobalt">SOURCE · DID:PLC</IdTab>}
            state="ACTIVE"
            footerLeft="VELLUM · MIGRATION SOURCE"
            footerRight="OPS 12"
          >
            <div className="px-6 pt-8 pb-4">
              <div className="mono-caps text-muted-foreground mb-3">SOURCE IDENTIFIER</div>
              <div className="font-mono text-base md:text-lg break-all">did:plc:k4z2tlzy5j7w3e6m4a8q9xyz</div>
            </div>
            <MetaStrip items={[
              { label: "Genesis op", value: "2023-04-12" },
              { label: "Operations", value: "12" },
              { label: "Rotation keys", value: "03" },
              { label: "Last update", value: "2025-04-08" },
            ]} />
            <div className="px-6 py-5 flex flex-wrap gap-2">
              <Tag>DID:PLC</Tag><Tag>VERIFIED</Tag>
            </div>
          </Manifest>
        </div>

        <div className="pt-4 pl-4">
          <Manifest
            idTab={<IdTab color="cobalt">TARGET · DID:CKB</IdTab>}
            state="MIGRATING"
            stateLabel="MIGRATING · 71H 42M REMAINING"
            offset
            offsetColor="ink"
            footerLeft="VELLUM · MIGRATION TARGET"
            footerRight="WINDOW 72H"
          >
            <div className="px-6 pt-8 pb-4">
              <div className="mono-caps text-muted-foreground mb-3">NEW IDENTIFIER</div>
              <Brackets className="block">
                <div className="font-mono text-base md:text-lg break-all">did:ckb:qq8n42pfys9wn3v0c46aaxzhe6up4u4nba</div>
              </Brackets>
            </div>
            <MetaStrip items={[
              { label: "Block", value: "17,402,108" },
              { label: "Local id", value: "→ DID:PLC" },
              { label: "Capacity", value: "614.00 CKB" },
              { label: "Window closes", value: "BLOCK +50" },
            ]} />
            <div className="px-6 py-5 mono-caps text-muted-foreground">
              During this window, a higher-priority rotation key from the source DID can overwrite this migration.
              After 72 hours plus 50 block confirmations, the migration is final.
            </div>
          </Manifest>
        </div>
      </div>

      <div className="border-2 border-ink p-8 max-w-[700px] mx-auto">
        <div className="mono-caps text-muted-foreground mb-3">NEXT</div>
        <h3 className="text-xl font-medium mb-4">Wait for finality.</h3>
        <p className="text-muted-foreground mb-6">
          When the window closes, your did:ckb status band will switch to ACTIVE. We will notify you in-app.
        </p>
        <div className="flex justify-end gap-3">
          <VButton variant="secondary">View on explorer</VButton>
          <VButton variant="verdant">Open my DID</VButton>
        </div>
      </div>
    </div>
  );
}
