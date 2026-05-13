import { createFileRoute, Link } from "@tanstack/react-router";
import { Manifest, IdTab, Brackets, MetaStrip, FieldRow, Tag } from "@/components/vellum/Manifest";
import { VButton } from "@/components/vellum/VButton";

export const Route = createFileRoute("/my")({
  head: () => ({
    meta: [
      { title: "My DID — Vellum" },
      { name: "description", content: "Manage your did:ckb. Edit your document, rotate the Lock Script, view operation history." },
    ],
  }),
  component: MyDid,
});

const FEED = [
  { t: "Block 17,402,108", action: "UPDATE", body: ["Updated", "bio"], hash: "0x9a4e...11cf", color: "ink" as const },
  { t: "Block 17,381,442", action: "UPDATE", body: ["Added", "services.profile"], hash: "0x2c91...88a4", color: "ink" as const },
  { t: "Block 17,322,008", action: "ROTATE", body: ["Rotated", "lockScript"], hash: "0x7d3b...02e1", color: "ink" as const },
  { t: "Block 17,314,192", action: "CREATE", body: ["Minted", "did:ckb"], hash: "0x4c8a...e91f", color: "verdant" as const },
];

function MyDid() {
  return (
    <div className="max-w-[1320px] mx-auto px-6 lg:px-12 py-12">
      <div className="mono-caps text-muted-foreground mb-3">REGISTRY · MY DOCUMENT</div>
      <h1 className="text-4xl md:text-5xl font-medium mb-12">Your did:ckb.</h1>

      {/* Hero */}
      <div className="pt-4 pl-4 mb-16">
        <Manifest
          idTab={<IdTab>VL · DID:CKB</IdTab>}
          state="ACTIVE"
          offset
          footerLeft="VELLUM · DID DOCUMENT"
          footerRight="REV 04 / 04"
        >
          <div className="px-6 pt-8 pb-6">
            <div className="mono-caps text-muted-foreground mb-3">YOUR IDENTIFIER</div>
            <Brackets className="block">
              <div className="font-mono text-[24px] md:text-[44px] leading-tight break-all">
                did:ckb:qq2m72yfxs8wn3v0c46aaxzhe6up4u4nba
              </div>
            </Brackets>
            <div className="mt-6 text-3xl font-medium">Margot Weil</div>
            <div className="mono-caps text-muted-foreground mt-2">CREATED · BLOCK 17,314,192 · CAPACITY 614.00 CKB</div>
          </div>
          <MetaStrip
            items={[
              { label: "Block of last update", value: "17,402,108" },
              { label: "Operations", value: "04" },
              { label: "Also known as", value: "01" },
              { label: "Services", value: "02" },
            ]}
          />
          <div className="px-6 py-5 flex flex-wrap gap-3 justify-end">
            <VButton variant="secondary">Copy DID</VButton>
            <Link to="#history"><VButton variant="ghost">View history →</VButton></Link>
          </div>
        </Manifest>
      </div>

      {/* Two columns */}
      <div className="grid lg:grid-cols-3 gap-8 mb-20">
        <div className="lg:col-span-2 pt-4 pl-4">
          <Manifest
            idTab={<IdTab>DOCUMENT BODY</IdTab>}
            footerLeft="VELLUM · PROFILE FIELDS"
            footerRight="04 FIELDS"
          >
            <div className="flex justify-end px-6 py-3 border-b border-hairline">
              <VButton variant="ghost">Edit document</VButton>
            </div>
            <FieldRow label="Display name" value={<span className="text-xl font-medium">Margot Weil</span>} action={<VButton variant="ghost">Edit</VButton>} />
            <FieldRow label="Avatar" value={
              <div className="w-16 h-16 border border-ink bg-paper flex items-center justify-center font-mono font-medium">MW</div>
            } action={<VButton variant="ghost">Edit</VButton>} />
            <FieldRow label="Bio" value="Conservation lab tech. Writes about ledgers, paper, and the long now." action={<VButton variant="ghost">Edit</VButton>} />
            <FieldRow label="Handle" mono value={
              <div className="flex flex-wrap gap-2 items-center"><Tag>AT PROTOCOL</Tag>@margot.bsky.social</div>
            } action={<VButton variant="ghost">Edit</VButton>} />
            <FieldRow label="Service" mono value={
              <div className="flex flex-wrap gap-2 items-center"><Tag>PROFILE</Tag>https://margot.weil/profile</div>
            } action={<VButton variant="ghost">Edit</VButton>} />
            <div className="px-6 py-4 border-b border-hairline">
              <button className="w-full border border-dashed border-ink py-3 mono-caps hover:bg-ink hover:text-paper">+ ADD HANDLE</button>
            </div>
            <div className="px-6 py-4">
              <button className="w-full border border-dashed border-ink py-3 mono-caps hover:bg-ink hover:text-paper">+ ADD SERVICE</button>
            </div>
          </Manifest>
        </div>

        <div className="pt-4 pl-4">
          <Manifest
            idTab={<IdTab color="ink">LOCK SCRIPT</IdTab>}
            footerLeft="VELLUM · KEY MATERIAL"
            footerRight="REV 02"
          >
            <div className="px-6 py-6 space-y-4">
              <div>
                <div className="mono-label text-muted-foreground mb-1.5">CODE HASH</div>
                <div className="font-mono text-xs break-all">0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a26c6b25b06c0d65e9cd</div>
              </div>
              <div>
                <div className="mono-label text-muted-foreground mb-1.5">HASH TYPE</div>
                <div className="font-mono text-sm">type</div>
              </div>
              <div>
                <div className="mono-label text-muted-foreground mb-1.5">ARGS</div>
                <div className="font-mono text-xs break-all">0x8a3fc418bd5e7f12c0a93b87c5e2d1f4a8b3c41d</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Tag>SECP256K1</Tag>
              </div>
            </div>
            <div className="px-6 pb-6 flex justify-end">
              <VButton variant="ghost">Rotate →</VButton>
            </div>
          </Manifest>
        </div>
      </div>

      {/* Activity feed */}
      <div id="history">
        <div className="mono-caps text-muted-foreground mb-3">SECTION · ACTIVITY</div>
        <h2 className="text-3xl font-medium mb-8">Operation history.</h2>
        <div className="border-t border-ink">
          {FEED.map((e) => (
            <div key={e.hash} className="py-5 border-b border-hairline px-2">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-1">
                <span className={`inline-block w-2 h-2 rounded-full ${e.color === "verdant" ? "bg-verdant" : "bg-ink"}`} />
                <span className="mono-caps">{e.action}</span>
                <span className="font-mono text-xs text-muted-foreground">{e.t}</span>
              </div>
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 pl-5">
                <div className="text-base break-words">
                  {e.body[0]} <span className="font-mono text-sm break-all">{e.body[1]}</span>
                </div>
                <a className="mono-caps text-cobalt hover:underline shrink-0 break-all" href="#">{e.hash} VIEW ↗</a>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Danger zone */}
      <div className="mt-24 border-2 border-alarm">
        <div className="bg-alarm text-paper px-6 py-2.5 mono-caps">DANGER ZONE · IRREVERSIBLE</div>
        <div className="p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="max-w-[58ch]">
            <h3 className="text-xl font-medium mb-2">Deactivate this DID.</h3>
            <p className="text-muted-foreground text-sm">
              Burn the Cell, return the locked 614.00 CKB to your wallet, and make this identifier permanently unresolvable. The string can never be reissued.
            </p>
          </div>
          <Link to="/deactivate" className="shrink-0">
            <VButton variant="destructive">Deactivate DID</VButton>
          </Link>
        </div>
      </div>
    </div>
  );
}
