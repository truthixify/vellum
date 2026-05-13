import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Manifest, IdTab, Brackets, MetaStrip } from "@/components/vellum/Manifest";
import { VButton } from "@/components/vellum/VButton";

export const Route = createFileRoute("/deactivate")({
  head: () => ({
    meta: [
      { title: "Deactivate DID — Vellum" },
      { name: "description", content: "Permanently deactivate your did:ckb. The Cell is burned, capacity returns, the document becomes unresolvable." },
    ],
  }),
  component: DeactivatePage,
});

const DID = "did:ckb:qq2m72yfxs8wn3v0c46aaxzhe6up4u4nba";
const COOLDOWN_MS = 24 * 60 * 60 * 1000;

function DeactivatePage() {
  const [unlockAt] = useState(() => {
    if (typeof window === "undefined") return Date.now() + COOLDOWN_MS;
    const k = "vellum.deactivate.unlock";
    const stored = window.localStorage.getItem(k);
    if (stored) return Number(stored);
    const t = Date.now() + COOLDOWN_MS;
    window.localStorage.setItem(k, String(t));
    return t;
  });
  const [now, setNow] = useState(() => Date.now());
  const [confirm, setConfirm] = useState("");
  const [stage, setStage] = useState<"idle" | "pending" | "done">("idle");

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const remaining = Math.max(0, unlockAt - now);
  const locked = remaining > 0;
  const matches = confirm.trim() === DID;

  const h = Math.floor(remaining / 3.6e6);
  const m = Math.floor((remaining % 3.6e6) / 6e4);
  const s = Math.floor((remaining % 6e4) / 1e3);

  return (
    <div className="max-w-[920px] mx-auto px-6 lg:px-12 py-16">
      <div className="mono-caps text-alarm mb-3">REGISTRY · IRREVERSIBLE</div>
      <h1 className="text-4xl md:text-5xl font-medium mb-4">Deactivate this DID.</h1>
      <p className="text-muted-foreground mb-12 max-w-[60ch]">
        This action burns the Cell that holds your identity. It cannot be undone, and the same DID string can never be reissued.
      </p>

      <div className="pt-4 pl-4">
        <Manifest
          idTab={<IdTab color="ink">DEACTIVATION ORDER</IdTab>}
          state="CONTESTED"
          stateLabel="DEACTIVATION IS PERMANENT"
          offset
          offsetColor="ink"
          footerLeft="VELLUM · BURN ORDER"
          footerRight="DOC 099"
        >
          <div className="px-6 pt-8 pb-6">
            <div className="mono-caps text-muted-foreground mb-3">IDENTIFIER TO DEACTIVATE</div>
            <Brackets className="block">
              <div className="font-mono text-[18px] md:text-[24px] leading-tight break-all">{DID}</div>
            </Brackets>
          </div>

          <MetaStrip items={[
            { label: "Capacity returned", value: "614.00 CKB" },
            { label: "Document becomes", value: "UNRESOLVABLE" },
            { label: "Recoverable", value: "NO" },
            { label: "Re-mintable", value: "NEVER" },
          ]} />

          <div className="px-6 py-6 space-y-4 border-b border-hairline">
            <Consequence label="ON CHAIN" body="The DID Cell is consumed and not reproduced. Locked CKB returns to your wallet in the same transaction." />
            <Consequence label="OFF CHAIN" body="Apps that read this DID will fail to resolve it. Any reputation or signed records anchored to it lose their anchor." />
            <Consequence label="RECOVERY" body="None. There is no admin, no recovery period, no re-mint of the same string. Lost is lost." />
          </div>

          {stage === "idle" && (
            <>
              <div className="px-6 py-6 border-b border-hairline">
                <div className="mono-label text-muted-foreground mb-2">UI COOL-DOWN</div>
                {locked ? (
                  <div>
                    <div className="font-mono text-3xl mb-2">
                      {String(h).padStart(2, "0")}:{String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
                    </div>
                    <p className="text-sm text-muted-foreground max-w-[58ch]">
                      The deactivate button unlocks after a 24-hour wait. This is a deliberate friction. Leave the page; the timer continues.
                    </p>
                  </div>
                ) : (
                  <div className="mono-caps text-verdant">COOL-DOWN COMPLETE · YOU MAY PROCEED</div>
                )}
              </div>

              <div className="px-6 py-6">
                <label className="mono-label text-muted-foreground mb-2 block">
                  TYPE THE FULL DID TO CONFIRM
                </label>
                <input
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder={DID}
                  className="w-full h-11 bg-paper border border-ink px-3 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-alarm"
                />
              </div>

              <div className="px-6 pb-6 flex flex-wrap justify-between gap-3">
                <Link to="/my"><VButton variant="ghost">← Cancel and return</VButton></Link>
                <VButton
                  variant="destructive"
                  disabled={locked || !matches}
                  onClick={() => { setStage("pending"); setTimeout(() => setStage("done"), 2400); }}
                >
                  Sign burn transaction
                </VButton>
              </div>
            </>
          )}

          {stage === "pending" && (
            <div className="px-6 py-12 text-center">
              <div className="mono-caps text-muted-foreground mb-4">BURNING CELL · WAITING FOR BLOCK…</div>
              <div className="relative h-px bg-hairline overflow-hidden mx-auto max-w-[280px]">
                <div className="sweep absolute inset-0" />
              </div>
            </div>
          )}

          {stage === "done" && (
            <div className="px-6 py-10">
              <div className="mono-caps text-muted-foreground mb-3">CONFIRMED · BLOCK 17,418,902</div>
              <h3 className="text-2xl font-medium mb-2">Deactivated.</h3>
              <p className="text-muted-foreground mb-6">614.00 CKB has been returned to your wallet.</p>
              <Link to="/"><VButton variant="primary">Return home</VButton></Link>
            </div>
          )}
        </Manifest>
      </div>
    </div>
  );
}

function Consequence({ label, body }: { label: string; body: string }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-4">
      <div className="mono-label text-alarm pt-0.5">{label}</div>
      <p className="text-base text-ink">{body}</p>
    </div>
  );
}
