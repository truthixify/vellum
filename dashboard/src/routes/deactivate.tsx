import { ccc, useCcc, useSigner } from "@ckb-ccc/connector-react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";

import {
  Manifest,
  IdTab,
  Brackets,
  MetaStrip,
} from "@/components/vellum/Manifest";
import { VButton } from "@/components/vellum/VButton";

import { buildDeactivateTx } from "@/lib/did-ckb";

const searchSchema = z.object({
  did: z.string().optional(),
});

export const Route = createFileRoute("/deactivate")({
  validateSearch: searchSchema,
  component: DeactivatePage,
});

const COOLDOWN_MS = 24 * 60 * 60 * 1000;

function unlockKey(did: string): string {
  return `vellum.deactivate.unlock.${did}`;
}

function DeactivatePage() {
  const { did } = Route.useSearch();
  const signer = useSigner();
  const { client, open } = useCcc();
  const navigate = useNavigate();

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const unlockAt = useMemo(() => {
    if (!did) return null;
    if (typeof window === "undefined") return Date.now() + COOLDOWN_MS;
    const k = unlockKey(did);
    const stored = window.localStorage.getItem(k);
    if (stored) return Number(stored);
    const t = Date.now() + COOLDOWN_MS;
    window.localStorage.setItem(k, String(t));
    return t;
  }, [did]);

  const [confirm, setConfirm] = useState("");
  const [stage, setStage] = useState<"idle" | "pending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<ccc.Hex | null>(null);
  const [blockNumber, setBlockNumber] = useState<bigint | null>(null);

  useEffect(() => {
    if (!txHash || stage !== "pending") return;
    let cancelled = false;
    const poll = async () => {
      try {
        const onChain = await client.getTransaction(txHash);
        if (!onChain || cancelled) return;
        if (onChain.status === "committed") {
          setBlockNumber(onChain.blockNumber ?? null);
          setStage("done");
          return;
        }
      } catch (err) {
        console.warn("Poll deactivate tx failed", err);
      }
      if (!cancelled) setTimeout(poll, 3000);
    };
    void poll();
    return () => {
      cancelled = true;
    };
  }, [txHash, stage, client]);

  if (!did) {
    return (
      <div className="max-w-[920px] mx-auto px-6 lg:px-12 py-24 text-center">
        <h1 className="text-3xl font-medium mb-4">No DID selected</h1>
        <p className="text-muted-foreground mb-8 max-w-[58ch] mx-auto">
          Deactivation needs an explicit DID. Go back to your dashboard and select the
          one you want to retire.
        </p>
        <Link to="/my">
          <VButton variant="secondary">Back to my DID</VButton>
        </Link>
      </div>
    );
  }

  const remaining = unlockAt ? Math.max(0, unlockAt - now) : 0;
  const locked = remaining > 0;
  const matches = confirm.trim() === did;

  const h = Math.floor(remaining / 3.6e6);
  const m = Math.floor((remaining % 3.6e6) / 6e4);
  const s = Math.floor((remaining % 6e4) / 1e3);

  async function handleBurn() {
    if (!signer || !did) return;
    setError(null);
    try {
      const tx = await buildDeactivateTx(signer, did);
      setStage("pending");
      const hash = await signer.sendTransaction(tx);
      setTxHash(hash);
      try {
        window.localStorage.removeItem(unlockKey(did));
      } catch {
        // ignore
      }
    } catch (err) {
      console.error(err);
      setStage("idle");
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="max-w-[920px] mx-auto px-6 lg:px-12 py-16">
      <div className="mono-caps text-alarm mb-3">REGISTRY · IRREVERSIBLE</div>
      <h1 className="text-4xl md:text-5xl font-medium mb-4">Deactivate this DID.</h1>
      <p className="text-muted-foreground mb-12 max-w-[60ch]">
        This action burns the Cell that holds your identity. It cannot be undone, and
        the same DID string can never be reissued.
      </p>

      {error ? (
        <div className="mb-8 border-2 border-alarm bg-paper px-4 py-3">
          <div className="mono-caps text-alarm mb-1">ERROR</div>
          <p className="text-sm font-mono break-all">{error}</p>
        </div>
      ) : null}

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
            <div className="mono-caps text-muted-foreground mb-3">
              IDENTIFIER TO DEACTIVATE
            </div>
            <Brackets className="block">
              <div className="font-mono text-[18px] md:text-[24px] leading-tight break-all">
                {did}
              </div>
            </Brackets>
          </div>

          <MetaStrip
            items={[
              { label: "Capacity returned", value: "~614 CKB" },
              { label: "Document becomes", value: "UNRESOLVABLE" },
              { label: "Recoverable", value: "NO" },
              { label: "Re-mintable", value: "NEVER" },
            ]}
          />

          <div className="px-6 py-6 space-y-4 border-b border-hairline">
            <Consequence
              label="ON CHAIN"
              body="The DID Cell is consumed and not reproduced. Locked CKB returns to your wallet in the same transaction."
            />
            <Consequence
              label="OFF CHAIN"
              body="Apps that read this DID will fail to resolve it. Any reputation or signed records anchored to it lose their anchor."
            />
            <Consequence
              label="RECOVERY"
              body="None. There is no admin, no recovery period, no re-mint of the same string. Lost is lost."
            />
          </div>

          {stage === "idle" && (
            <>
              <div className="px-6 py-6 border-b border-hairline">
                <div className="mono-label text-muted-foreground mb-2">UI COOL-DOWN</div>
                {locked ? (
                  <div>
                    <div className="font-mono text-3xl mb-2">
                      {String(h).padStart(2, "0")}:{String(m).padStart(2, "0")}:
                      {String(s).padStart(2, "0")}
                    </div>
                    <p className="text-sm text-muted-foreground max-w-[58ch]">
                      The deactivate button unlocks after a 24-hour wait. This is a
                      deliberate friction. Leave the page; the timer continues.
                    </p>
                  </div>
                ) : (
                  <div className="mono-caps text-verdant">
                    COOL-DOWN COMPLETE · YOU MAY PROCEED
                  </div>
                )}
              </div>

              <div className="px-6 py-6">
                <label className="mono-label text-muted-foreground mb-2 block">
                  TYPE THE FULL DID TO CONFIRM
                </label>
                <input
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder={did}
                  className="w-full h-11 bg-paper border border-ink px-3 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-alarm"
                />
              </div>

              <div className="px-6 pb-6 flex flex-wrap justify-between gap-3">
                <Link to="/my">
                  <VButton variant="ghost">← Cancel and return</VButton>
                </Link>
                {signer ? (
                  <VButton
                    variant="destructive"
                    disabled={locked || !matches}
                    onClick={handleBurn}
                  >
                    Sign burn transaction
                  </VButton>
                ) : (
                  <VButton variant="destructive" onClick={() => open()}>
                    Connect wallet
                  </VButton>
                )}
              </div>
            </>
          )}

          {stage === "pending" && (
            <div className="px-6 py-12 text-center">
              <div className="mono-caps text-muted-foreground mb-4">
                BURNING CELL · WAITING FOR BLOCK…
              </div>
              <div className="relative h-px bg-hairline overflow-hidden mx-auto max-w-[280px]">
                <div className="sweep absolute inset-0" />
              </div>
              {txHash && (
                <div className="font-mono text-xs text-muted-foreground mt-6 break-all">
                  TX {txHash}
                </div>
              )}
            </div>
          )}

          {stage === "done" && (
            <div className="px-6 py-10">
              <div className="mono-caps text-muted-foreground mb-3">
                CONFIRMED · BLOCK {blockNumber?.toString() ?? "—"}
              </div>
              <h3 className="text-2xl font-medium mb-2">Deactivated.</h3>
              <p className="text-muted-foreground mb-6">
                Capacity has been returned to your wallet.
              </p>
              <VButton variant="primary" onClick={() => navigate({ to: "/" })}>
                Return home
              </VButton>
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
