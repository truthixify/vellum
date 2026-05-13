import { createFileRoute, Link } from "@tanstack/react-router";
import { Manifest, IdTab, Brackets, MetaStrip, FieldRow, Tag } from "@/components/vellum/Manifest";
import { VButton } from "@/components/vellum/VButton";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Vellum — Your identity, on paper that lasts" },
      { name: "description", content: "Claim a permanent did:ckb. Write a profile, rotate keys, migrate from did:plc, resolve any DID on the network." },
      { property: "og:title", content: "Vellum — Your identity, on paper that lasts" },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div>
      {/* Top stamp */}
      <div className="border-b border-hairline">
        <div className="max-w-[1100px] mx-auto px-6 lg:px-12 py-3 flex justify-between mono-caps text-muted-foreground">
          <span>VELLUM · DID:CKB DASHBOARD</span>
          <span className="hidden md:inline">REGISTRY · OPEN</span>
        </div>
      </div>

      {/* Hero */}
      <section className="max-w-[1100px] mx-auto px-6 lg:px-12 pt-24 pb-32 relative">
        <div className="mono-caps text-muted-foreground mb-8">DOCUMENT · 001 · INTRODUCTION</div>
        <h1 className="text-[56px] md:text-[80px] leading-[0.98] tracking-tight font-medium max-w-[16ch]">
          Your identity, on <span className="text-verdant">paper</span> that lasts.
        </h1>
        <p className="text-[22px] leading-[1.5] text-ink mt-10 max-w-[58ch]">
          Vellum lets you claim a Cell on the Nervos CKB blockchain that holds your identity.
          It survives wallet rotation, travels between apps, and is resolvable by anyone.
        </p>
        <div className="flex flex-wrap gap-3 mt-10">
          <Link to="/claim"><VButton variant="verdant">Claim a DID</VButton></Link>
          <Link to="/resolve"><VButton variant="secondary">Resolve a DID</VButton></Link>
        </div>
        <div className="mt-16 flex items-center gap-4 mono-caps text-muted-foreground">
          <span className="w-12 h-px bg-ink" />
          <span>SCROLL FOR REGISTRY</span>
        </div>
      </section>

      {/* What you get */}
      <section className="max-w-[1100px] mx-auto px-6 lg:px-12 py-24 border-t border-hairline">
        <div className="mono-caps text-muted-foreground mb-2">SECTION · 02</div>
        <h2 className="text-4xl md:text-5xl font-medium max-w-[20ch] mb-16">What you get when you claim a DID.</h2>
        <div className="grid md:grid-cols-3 gap-8">
          {[
            { n: "01", t: "A permanent identifier", b: "The string survives key rotation. Lose your wallet, mint a new one, the DID stays." },
            { n: "02", t: "One profile, every app", b: "Display name, avatar, bio, handles, services. Written once on chain. Read by anyone." },
            { n: "03", t: "Portable across protocols", b: "Link did:plc, Nostr keys, AT Protocol handles. Your identity travels with you." },
          ].map((c) => (
            <div key={c.n} className="border border-ink p-8 bg-paper">
              <div className="mono-caps text-verdant mb-6">FEATURE · {c.n}</div>
              <h3 className="text-2xl font-medium mb-3">{c.t}</h3>
              <p className="text-muted-foreground">{c.b}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-[1100px] mx-auto px-6 lg:px-12 py-24 border-t border-hairline">
        <div className="mono-caps text-muted-foreground mb-2">SECTION · 03</div>
        <h2 className="text-4xl md:text-5xl font-medium mb-16">How it works.</h2>
        <div className="relative">
          {/* Single horizontal connector behind the tab row, desktop only */}
          <div className="hidden md:block absolute top-3 left-0 right-0 h-px bg-ink" aria-hidden />
          <ol className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-y-10 md:gap-y-0 gap-x-6 relative">
            {[
              ["01", "Connect", "Wallet supplies the signing key."],
              ["02", "Compose", "Write your profile fields."],
              ["03", "Sign", "Sign the create transaction."],
              ["04", "Confirm", "DID lands on chain in seconds."],
              ["05", "Manage", "Edit, rotate, deactivate any time."],
            ].map(([n, t, b]) => (
              <li key={n} className="relative">
                <div className="bg-paper inline-flex relative z-10"><IdTab>STEP · {n}</IdTab></div>
                <h3 className="text-lg font-medium mt-5 mb-2">{t}</h3>
                <p className="text-sm text-muted-foreground">{b}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Sample manifest */}
      <section className="max-w-[1100px] mx-auto px-6 lg:px-12 py-24 border-t border-hairline">
        <div className="mono-caps text-muted-foreground mb-2">SECTION · 04 · SPECIMEN</div>
        <h2 className="text-4xl md:text-5xl font-medium mb-16">What goes in a DID.</h2>
        <div className="pt-4 pl-4">
          <Manifest
            idTab={<IdTab>VL · DID:CKB · SPECIMEN</IdTab>}
            state="ACTIVE"
            offset
            footerLeft="VELLUM · DID DOCUMENT · SPECIMEN"
            footerRight="PAGE 01 / 01"
          >
            <div className="px-6 pt-8 pb-6">
              <div className="mono-caps text-muted-foreground mb-3">REGISTERED IDENTIFIER</div>
              <Brackets className="block">
                <div className="font-mono text-[22px] md:text-[32px] leading-tight break-all">
                  did:ckb:qq2m72yfxs8wn3v0c46aaxzhe6up4u4nba
                </div>
              </Brackets>
            </div>
            <MetaStrip
              items={[
                { label: "Created", value: "BLOCK 17,314,192" },
                { label: "Capacity", value: "614.00 CKB" },
                { label: "Operations", value: "04" },
                { label: "Status", value: "ACTIVE" },
              ]}
            />
            <div>
              <FieldRow label="Display name" value={<span className="text-2xl font-medium">Margot Weil</span>} />
              <FieldRow label="Avatar" value={
                <div className="w-20 h-20 border border-ink bg-paper flex items-center justify-center text-2xl font-medium font-mono">MW</div>
              } />
              <FieldRow label="Bio" value="Conservation lab tech. Writes about ledgers, paper, and the long now." />
              <FieldRow label="Handles" mono value={
                <div className="flex flex-wrap gap-2 items-center">
                  <Tag>AT PROTOCOL</Tag><span>@margot.bsky.social</span>
                </div>
              } />
              <FieldRow label="Services" mono value={
                <div className="flex flex-wrap gap-2 items-center">
                  <Tag>PROFILE</Tag><span>https://margot.weil/profile</span>
                </div>
              } />
            </div>
          </Manifest>
        </div>
      </section>

      {/* Cost */}
      <section className="max-w-[1100px] mx-auto px-6 lg:px-12 py-24 border-t border-hairline">
        <div className="mono-caps text-muted-foreground mb-2">SECTION · 05 · COST</div>
        <h2 className="text-4xl md:text-5xl font-medium mb-12 max-w-[18ch]">Honest about what it costs.</h2>
        <div className="border-2 border-ink bg-paper p-10 grid md:grid-cols-3 gap-8">
          <div>
            <div className="mono-caps text-muted-foreground mb-2">STORAGE RENT</div>
            <div className="text-3xl font-medium">~600 CKB</div>
            <p className="text-sm text-muted-foreground mt-2">Locked on chain. Recoverable on deactivation.</p>
          </div>
          <div>
            <div className="mono-caps text-muted-foreground mb-2">NETWORK FEE</div>
            <div className="text-3xl font-medium">&lt; 0.01 CKB</div>
            <p className="text-sm text-muted-foreground mt-2">
              <span className="border-b-[1.5px] border-verdant">Per transaction</span>. No subscription.
            </p>
          </div>
          <div>
            <div className="mono-caps text-muted-foreground mb-2">OWNERSHIP</div>
            <div className="text-3xl font-medium">Yours</div>
            <p className="text-sm text-muted-foreground mt-2">No platform holds the keys. Your wallet is the only authority.</p>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="max-w-[1100px] mx-auto px-6 lg:px-12 py-24 border-t border-hairline">
        <div className="mono-caps text-muted-foreground mb-2">SECTION · 06</div>
        <h2 className="text-4xl md:text-5xl font-medium mb-12">Questions.</h2>
        <div className="border-t border-ink">
          {[
            ["What if I lose my keys?", "Rotate the Lock Script using a recovery key, or have a multi-sig configured. The DID itself does not move; only the key controlling it does."],
            ["What if I change my name?", "Edit the document. The DID string never changes. Your display name, handles, and services are mutable."],
            ["Can someone else claim my DID?", "No. The string is derived from your initial Cell. It is unique on chain."],
            ["What happens if I deactivate?", "The Cell is burned, your locked CKB returns to your wallet, and the DID becomes unresolvable. Permanent."],
            ["Can I migrate from did:plc?", "Yes. Sign a migration tx with one of your did:plc rotation keys. After a 72-hour window the new did:ckb is final."],
            ["Why CKB and not Ethereum?", "CKB's Cell model gives you a single piece of state you actually own. Storage is rent, not gas-per-edit."],
          ].map(([q, a]) => (
            <details key={q} className="group border-b border-ink py-6 px-2">
              <summary className="cursor-pointer flex justify-between items-start gap-6 list-none">
                <span className="text-lg md:text-xl font-medium">{q}</span>
                <span className="mono-caps text-muted-foreground shrink-0 group-open:hidden">OPEN +</span>
                <span className="mono-caps text-muted-foreground shrink-0 hidden group-open:inline">CLOSE −</span>
              </summary>
              <p className="mt-4 text-muted-foreground max-w-[64ch]">{a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* CTA stamp */}
      <section className="border-t-2 border-ink bg-paper">
        <div className="max-w-[1100px] mx-auto px-6 lg:px-12 py-32 text-center">
          <div className="mono-caps text-muted-foreground mb-8">REGISTRY · OPEN FOR ENROLMENT</div>
          <h2 className="text-5xl md:text-7xl font-medium mb-12">Claim your name.</h2>
          <div className="flex flex-wrap gap-3 justify-center">
            <Link to="/claim"><VButton variant="verdant">Claim a DID</VButton></Link>
            <Link to="/resolve"><VButton variant="secondary">Resolve a DID</VButton></Link>
          </div>
        </div>
      </section>
    </div>
  );
}
