import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Manifest, IdTab, Brackets, MetaStrip, FieldRow, Tag } from "@/components/vellum/Manifest";
import { VButton } from "@/components/vellum/VButton";

export const Route = createFileRoute("/claim")({
  head: () => ({
    meta: [
      { title: "Claim a DID — Vellum" },
      { name: "description", content: "Mint a new did:ckb. A four-step wizard: confirm cost, write the document, sign, confirm." },
    ],
  }),
  component: ClaimPage,
});

const STEPS = ["CONFIRM COST", "COMPOSE DOCUMENT", "SIGN AND SUBMIT", "CONFIRMATION"];

function ClaimPage() {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [handle, setHandle] = useState("");

  return (
    <div className="max-w-[920px] mx-auto px-6 lg:px-12 py-16">
      <div className="mono-caps text-muted-foreground mb-3">REGISTRY · ENROLMENT</div>
      <h1 className="text-4xl md:text-5xl font-medium mb-4">Claim a did:ckb.</h1>
      <p className="text-muted-foreground mb-12 max-w-[58ch]">
        Four steps. Your wallet signs once at the end. Storage is locked, not spent.
      </p>

      {/* Progress strip */}
      <div className="grid grid-cols-4 mb-12">
        {STEPS.map((label, i) => (
          <div key={label} className={`px-3 py-3 border-t-2 ${i <= step ? "border-verdant" : "border-hairline"}`}>
            <div className="mono-caps text-muted-foreground">STEP {String(i + 1).padStart(2, "0")} / 04</div>
            <div className="mono-caps mt-1 text-ink hidden md:block">{label}</div>
          </div>
        ))}
      </div>

      <div className="pt-4 pl-4">
        {step === 0 && (
          <Manifest
            idTab={<IdTab>STEP 01 / 04 · COST</IdTab>}
            state="DRAFT"
            stateLabel="DRAFT · UNSIGNED"
            offset
            footerLeft="VELLUM · CAPACITY ESTIMATE"
            footerRight="DOC 001"
          >
            <div className="px-6 pt-8 pb-4">
              <div className="mono-caps text-muted-foreground mb-3">TOTAL CAPACITY LOCKED</div>
              <Brackets className="block">
                <div className="font-mono text-[48px] md:text-[64px] leading-none">614.00 CKB</div>
              </Brackets>
            </div>
            <MetaStrip items={[
              { label: "Base capacity", value: "590.00 CKB" },
              { label: "Padding", value: "24.00 CKB" },
              { label: "Network fee", value: "< 0.01 CKB" },
              { label: "Recoverable", value: "YES" },
            ]} />
            <div className="px-6 py-6 text-sm text-muted-foreground">
              The capacity is locked on chain in your DID Cell. Deactivate any time to recover it in full.
            </div>
            <div className="px-6 pb-6 flex justify-end gap-3">
              <Link to="/"><VButton variant="secondary">Cancel</VButton></Link>
              <VButton variant="verdant" onClick={() => setStep(1)}>Continue</VButton>
            </div>
          </Manifest>
        )}

        {step === 1 && (
          <Manifest
            idTab={<IdTab>STEP 02 / 04 · COMPOSE</IdTab>}
            state="DRAFT"
            stateLabel="DRAFT · COMPOSING"
            footerLeft="VELLUM · DOCUMENT BODY"
            footerRight="DOC 001"
          >
            <div className="px-6 py-6 space-y-6">
              <Field label="Display name" required>
                <input value={name} onChange={(e) => setName(e.target.value)} className="w-full h-11 bg-paper border border-ink px-3" />
              </Field>
              <Field label="Bio">
                <textarea value={bio} onChange={(e) => setBio(e.target.value.slice(0, 240))} rows={3} className="w-full bg-paper border border-ink px-3 py-2 resize-none" />
                <div className="mono-caps text-muted-foreground mt-1.5">{bio.length} / 240</div>
              </Field>
              <Field label="Handle">
                <div className="flex gap-2 items-center">
                  <Tag>AT PROTOCOL</Tag>
                  <input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@you.bsky.social" className="flex-1 h-11 bg-paper border border-ink px-3 font-mono text-sm" />
                </div>
              </Field>
              <Field label="Avatar">
                <div className="w-40 h-40 border border-ink relative flex items-center justify-center">
                  <span className="absolute top-1 left-1 w-3 h-3 border-t border-l border-verdant" />
                  <span className="absolute top-1 right-1 w-3 h-3 border-t border-r border-verdant" />
                  <span className="absolute bottom-1 left-1 w-3 h-3 border-b border-l border-verdant" />
                  <span className="absolute bottom-1 right-1 w-3 h-3 border-b border-r border-verdant" />
                  <div className="mono-caps text-muted-foreground text-center px-4">DROP IMAGE<br/>OR CLICK</div>
                </div>
              </Field>
            </div>
            <div className="px-6 pb-6 flex justify-between">
              <VButton variant="ghost" onClick={() => setStep(0)}>← Back</VButton>
              <VButton variant="verdant" onClick={() => setStep(2)} disabled={!name}>Stage for signing</VButton>
            </div>
          </Manifest>
        )}

        {step === 2 && (
          <Manifest
            idTab={<IdTab>STEP 03 / 04 · SIGN</IdTab>}
            state="PENDING"
            stateLabel="READY TO SIGN"
            offset
            footerLeft="VELLUM · TRANSACTION SUMMARY"
            footerRight="DOC 001"
          >
            <div className="px-6 pt-8 pb-4">
              <div className="mono-caps text-muted-foreground mb-3">PROPOSED IDENTIFIER (PRELIMINARY)</div>
              <Brackets className="block">
                <div className="font-mono text-[20px] md:text-[26px] leading-tight break-all">did:ckb:qq2m72yfxs8wn3v0c46aaxzhe6up4u4nba</div>
              </Brackets>
            </div>
            <div>
              <FieldRow label="Display name" value={<span className="text-xl font-medium">{name || "—"}</span>} />
              <FieldRow label="Bio" value={bio || <span className="text-muted-foreground">—</span>} />
              <FieldRow label="Handle" mono value={handle || <span className="text-muted-foreground font-sans">—</span>} />
              <FieldRow label="Capacity" mono value="614.00 CKB" />
              <FieldRow label="Network fee" mono value="< 0.01 CKB" />
            </div>
            <div className="px-6 py-6 flex justify-between">
              <VButton variant="ghost" onClick={() => setStep(1)}>← Back</VButton>
              <VButton variant="verdant" onClick={() => setStep(3)}>Sign and submit</VButton>
            </div>
          </Manifest>
        )}

        {step === 3 && (
          <Manifest
            idTab={<IdTab>STEP 04 / 04 · CONFIRMED</IdTab>}
            state="ACTIVE"
            offset
            footerLeft="VELLUM · STAMPED · BLOCK 17,314,192"
            footerRight="DOC 001"
          >
            <div className="px-6 pt-8 pb-4">
              <div className="mono-caps text-muted-foreground mb-3">YOUR IDENTIFIER</div>
              <Brackets className="block">
                <div className="font-mono text-[20px] md:text-[26px] leading-tight break-all">did:ckb:qq2m72yfxs8wn3v0c46aaxzhe6up4u4nba</div>
              </Brackets>
            </div>
            <MetaStrip items={[
              { label: "Block", value: "17,314,192" },
              { label: "Tx hash", value: "0x4c8a...e91f" },
              { label: "Capacity", value: "614.00 CKB" },
              { label: "Status", value: "ACTIVE" },
            ]} />
            <div className="px-6 py-6 flex flex-wrap gap-3 justify-end">
              <VButton variant="secondary">Copy DID</VButton>
              <Link to="/my"><VButton variant="verdant">View my DID</VButton></Link>
            </div>
          </Manifest>
        )}
      </div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <div className="mono-label text-muted-foreground mb-2 flex items-center gap-2">
        {label} {required && <span className="text-alarm">*</span>}
      </div>
      {children}
    </div>
  );
}
