import { ccc, useCcc, useSigner } from "@ckb-ccc/connector-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";

import {
  Manifest,
  IdTab,
  Brackets,
  FieldRow,
} from "@/components/vellum/Manifest";
import { VButton } from "@/components/vellum/VButton";
import { useCopy } from "@/hooks/use-copy";
import { useDocumentTitle } from "@/hooks/use-document-title";

import { buildUpdateTx, resolveDid, type DidRecord } from "@ckb-ccc/identity";

const searchSchema = z.object({
  did: z.string().optional(),
});

export const Route = createFileRoute("/rotate")({
  validateSearch: searchSchema,
  component: RotatePage,
});

type Stage = "compose" | "review" | "pending" | "done";

function RotatePage() {
  useDocumentTitle("Rotate lock script");
  const { did } = Route.useSearch();
  const signer = useSigner();
  const { client, open } = useCcc();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const {
    data: record,
    isLoading,
    error: loadError,
  } = useQuery({
    queryKey: ["did", did, "rotate"],
    queryFn: async (): Promise<DidRecord | null> => {
      if (!did) return null;
      return resolveDid(client, did);
    },
    enabled: !!did,
  });

  const [target, setTarget] = useState("");
  const [resolvedScript, setResolvedScript] = useState<ccc.Script | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>("compose");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tx, setTx] = useState<ccc.Transaction | null>(null);
  const [txHash, setTxHash] = useState<ccc.Hex | null>(null);
  const [blockNumber, setBlockNumber] = useState<bigint | null>(null);
  const { copied, copy } = useCopy();

  // Parse the target address as the user types. Debounced via React's
  // microtask scheduler: every state change runs validation, but parsing
  // a CKB address is cheap so we don't bother throttling.
  useEffect(() => {
    let cancelled = false;
    const trimmed = target.trim();
    if (!trimmed) {
      setResolvedScript(null);
      setParseError(null);
      return;
    }
    async function parse() {
      try {
        const addr = await ccc.Address.fromString(trimmed, client);
        if (!cancelled) {
          setResolvedScript(addr.script);
          setParseError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setResolvedScript(null);
          setParseError(
            err instanceof Error
              ? err.message
              : "Could not parse this address against the current network.",
          );
        }
      }
    }
    void parse();
    return () => {
      cancelled = true;
    };
  }, [target, client]);

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
          queryClient.invalidateQueries({ queryKey: ["did", did] });
          queryClient.invalidateQueries({ queryKey: ["my-dids"] });
          queryClient.invalidateQueries({ queryKey: ["did-history"] });
          return;
        }
      } catch (err) {
        console.warn("poll failed", err);
      }
      if (!cancelled) setTimeout(poll, 3000);
    };
    void poll();
    return () => {
      cancelled = true;
    };
  }, [txHash, stage, client, did, queryClient]);

  if (!did) {
    return (
      <Guard
        title="No DID specified"
        body="Rotation needs an explicit DID. Pick the one you want to rotate from your dashboard."
      />
    );
  }

  if (isLoading) {
    return (
      <Status>
        <div className="mono-caps text-muted-foreground">
          RESOLVING DID · INDEXING CELLS…
        </div>
      </Status>
    );
  }

  if (loadError || !record) {
    return (
      <Guard
        title="DID not found on chain"
        body={`No Live Cell matches ${did} on the current network.`}
      />
    );
  }

  const currentLock = record.cell.cellOutput.lock;
  const sameAsCurrent: boolean = !!(
    resolvedScript &&
    resolvedScript.codeHash.toLowerCase() === currentLock.codeHash.toLowerCase() &&
    resolvedScript.hashType === currentLock.hashType &&
    resolvedScript.args.toLowerCase() === currentLock.args.toLowerCase()
  );

  async function handleStage() {
    if (!signer || !resolvedScript) return;
    setBusy(true);
    setError(null);
    try {
      const built = await buildUpdateTx(signer, {
        did: did!,
        document: record!.document,
        newLock: resolvedScript,
      });
      setTx(built);
      setStage("review");
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleSign() {
    if (!signer || !tx) return;
    setBusy(true);
    setError(null);
    try {
      const hash = await signer.sendTransaction(tx);
      setTxHash(hash);
      setStage("pending");
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const networkLabel =
    client instanceof ccc.ClientPublicMainnet ? "MAINNET" : "TESTNET";

  return (
    <div className="max-w-[920px] mx-auto px-6 lg:px-12 py-16">
      <div className="mono-caps text-alarm mb-3">REGISTRY · KEY ROTATION</div>
      <h1 className="text-4xl md:text-5xl font-medium mb-4">Rotate lock script.</h1>
      <p className="text-muted-foreground mb-10 max-w-[60ch]">
        Move control of this DID to a different key without changing the
        identifier. The current Lock Script signs the rotation; afterwards
        only the new Lock can update or deactivate the DID. The DID string
        does not change.
      </p>

      <div className="mb-12 border-2 border-alarm bg-paper px-4 py-3">
        <div className="mono-caps text-alarm mb-1">IRREVERSIBLE BY DEFAULT</div>
        <p className="text-sm text-ink max-w-[78ch]">
          If you lose access to the new key after rotation, you also lose
          control of the DID. The current Lock Script signs the rotation
          transaction, so test with a key you control fully before rotating
          to a multi-sig or a hardware-backed lock.
        </p>
      </div>

      {error ? (
        <div className="mb-8 border-2 border-alarm bg-paper px-4 py-3">
          <div className="mono-caps text-alarm mb-1">ERROR</div>
          <p className="text-sm font-mono break-all">{error}</p>
        </div>
      ) : null}

      <div className="pt-4 pl-4">
        {stage === "compose" && (
          <Manifest
            idTab={<IdTab>STAGE 01 / 03 · COMPOSE</IdTab>}
            state="DRAFT"
            stateLabel="DRAFT · NEW LOCK"
            footerLeft="VELLUM · LOCK ROTATION"
            footerRight="DOC 002"
          >
            <div className="px-6 pt-6 pb-4">
              <div className="mono-caps text-muted-foreground mb-3">
                ROTATING
              </div>
              <Brackets className="block">
                <div className="font-mono text-[18px] md:text-[22px] leading-tight break-all">
                  {record.did}
                </div>
              </Brackets>
            </div>
            <div className="px-6 py-5 border-t border-hairline space-y-4">
              <div>
                <div className="mono-caps text-muted-foreground mb-2">
                  CURRENT LOCK
                </div>
                <ScriptCard script={currentLock} />
              </div>
              <div>
                <div className="mono-caps text-muted-foreground mb-2">
                  TARGET CKB ADDRESS
                </div>
                <input
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  placeholder="ckt1q… or ckb1q…"
                  className={`w-full h-11 bg-paper border px-3 font-mono text-sm ${
                    parseError ? "border-alarm" : "border-ink"
                  }`}
                />
                <p className="text-xs text-muted-foreground mt-1.5">
                  Paste the address that should control this DID after
                  rotation. The address's Lock Script becomes the new owner.
                </p>
                {parseError && (
                  <p className="text-xs text-alarm mt-1.5">{parseError}</p>
                )}
                {sameAsCurrent && (
                  <p className="text-xs text-amber mt-1.5">
                    Target Lock Script matches the current one. No rotation
                    needed.
                  </p>
                )}
              </div>
              {resolvedScript && !sameAsCurrent && (
                <div>
                  <div className="mono-caps text-muted-foreground mb-2">
                    NEW LOCK (RESOLVED)
                  </div>
                  <ScriptCard script={resolvedScript} highlight />
                </div>
              )}
            </div>
            <div className="px-6 pb-6 flex justify-between gap-3">
              <Link to="/my">
                <VButton variant="ghost">← Cancel</VButton>
              </Link>
              {signer ? (
                <VButton
                  variant="destructive"
                  onClick={handleStage}
                  disabled={busy || !resolvedScript || sameAsCurrent}
                >
                  {busy ? "Preparing transaction…" : "Stage rotation"}
                </VButton>
              ) : (
                <VButton variant="destructive" onClick={() => open()}>
                  Connect wallet
                </VButton>
              )}
            </div>
          </Manifest>
        )}

        {stage === "review" && tx && resolvedScript && (
          <Manifest
            idTab={<IdTab>STAGE 02 / 03 · SIGN</IdTab>}
            state="PENDING"
            stateLabel="READY TO SIGN"
            offset
            offsetColor="ink"
            footerLeft="VELLUM · LOCK ROTATION SUMMARY"
            footerRight="DOC 002"
          >
            <div className="px-6 pt-8 pb-4">
              <div className="mono-caps text-muted-foreground mb-3">
                IDENTIFIER
              </div>
              <Brackets className="block">
                <div className="font-mono text-[18px] md:text-[22px] leading-tight break-all">
                  {record.did}
                </div>
              </Brackets>
            </div>
            <div>
              <FieldRow
                label="From lock"
                mono
                value={
                  <span className="font-mono text-xs break-all">
                    code {truncate(currentLock.codeHash, 8, 6)} · args{" "}
                    {truncate(currentLock.args, 8, 6)}
                  </span>
                }
              />
              <FieldRow
                label="To lock"
                mono
                value={
                  <span className="font-mono text-xs break-all">
                    code {truncate(resolvedScript.codeHash, 8, 6)} · args{" "}
                    {truncate(resolvedScript.args, 8, 6)}
                  </span>
                }
              />
              <FieldRow
                label="Document changes"
                mono
                value="none (rotation only)"
              />
              <FieldRow label="Network" mono value={networkLabel} />
            </div>
            <div className="px-6 py-5 border-t border-hairline text-xs text-muted-foreground max-w-[58ch]">
              Your wallet will prompt once with the current Lock Script
              signing the rotation. After confirmation, only the new Lock
              can update or deactivate this DID.
            </div>
            <div className="px-6 pb-6 flex justify-between gap-3">
              <VButton variant="ghost" onClick={() => setStage("compose")}>
                ← Back
              </VButton>
              <VButton
                variant="destructive"
                onClick={handleSign}
                disabled={busy}
              >
                {busy ? "Waiting for wallet…" : "Sign rotation transaction"}
              </VButton>
            </div>
          </Manifest>
        )}

        {stage === "pending" && (
          <Manifest
            idTab={<IdTab>STAGE 03 / 03 · CONFIRMATION</IdTab>}
            state="PENDING"
            stateLabel="PENDING · WAITING FOR BLOCK"
            offset
            offsetColor="ink"
            footerLeft="VELLUM · ROTATION SUBMITTED"
            footerRight="DOC 002"
          >
            <div className="px-6 pt-8 pb-6">
              <div className="mono-caps text-muted-foreground mb-3">
                ROTATING
              </div>
              <Brackets className="block">
                <div className="font-mono text-[18px] md:text-[22px] leading-tight break-all">
                  {record.did}
                </div>
              </Brackets>
            </div>
            <div className="px-6 py-6 border-t border-hairline">
              <div className="flex items-center gap-3 mb-3">
                <span className="pulse-dot inline-block w-2 h-2 bg-amber" />
                <span className="mono-caps text-muted-foreground">
                  Waiting for confirmation on chain
                </span>
              </div>
              {txHash && (
                <div className="font-mono text-xs text-muted-foreground break-all">
                  TX {txHash}
                </div>
              )}
            </div>
          </Manifest>
        )}

        {stage === "done" && (
          <Manifest
            idTab={<IdTab>STAGE 03 / 03 · CONFIRMED</IdTab>}
            state="ACTIVE"
            stateLabel="ACTIVE · ROTATED"
            offset
            footerLeft={
              blockNumber
                ? `VELLUM · STAMPED · BLOCK ${blockNumber.toString()}`
                : "VELLUM · ROTATION CONFIRMED"
            }
            footerRight="DOC 002"
          >
            <div className="px-6 pt-8 pb-4">
              <div className="mono-caps text-muted-foreground mb-3">ROTATED</div>
              <Brackets className="block">
                <div className="font-mono text-[18px] md:text-[22px] leading-tight break-all">
                  {record.did}
                </div>
              </Brackets>
              <p className="text-sm text-muted-foreground mt-6 max-w-[58ch]">
                The DID identifier is unchanged. The new Lock Script now
                controls updates and deactivation.
              </p>
            </div>
            <div className="px-6 py-6 flex flex-wrap gap-3 justify-end">
              <VButton variant="secondary" onClick={() => copy(record.did)}>
                {copied ? "Copied" : "Copy DID"}
              </VButton>
              <VButton
                variant="verdant"
                onClick={() => navigate({ to: "/my" })}
              >
                View my DID
              </VButton>
            </div>
          </Manifest>
        )}
      </div>
    </div>
  );
}

function ScriptCard({
  script,
  highlight = false,
}: {
  script: ccc.Script | ccc.ScriptLike;
  highlight?: boolean;
}) {
  return (
    <div
      className={`border p-3 space-y-2 ${
        highlight ? "border-verdant bg-paper" : "border-ink bg-paper"
      }`}
    >
      <div>
        <div className="mono-label text-muted-foreground mb-0.5">CODE HASH</div>
        <div className="font-mono text-xs break-all">{String(script.codeHash)}</div>
      </div>
      <div>
        <div className="mono-label text-muted-foreground mb-0.5">HASH TYPE</div>
        <div className="font-mono text-sm">{String(script.hashType)}</div>
      </div>
      <div>
        <div className="mono-label text-muted-foreground mb-0.5">ARGS</div>
        <div className="font-mono text-xs break-all">{String(script.args)}</div>
      </div>
    </div>
  );
}

function Guard({ title, body }: { title: string; body: string }) {
  return (
    <div className="max-w-[920px] mx-auto px-6 lg:px-12 py-24 text-center">
      <h1 className="text-3xl font-medium mb-4">{title}</h1>
      <p className="text-muted-foreground mb-8 max-w-[58ch] mx-auto">{body}</p>
      <Link to="/my">
        <VButton variant="secondary">Back to my DID</VButton>
      </Link>
    </div>
  );
}

function Status({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-[920px] mx-auto px-6 lg:px-12 py-24">{children}</div>
  );
}

function truncate(hex: string, head = 8, tail = 6): string {
  if (hex.length <= head + tail + 1) return hex;
  return `${hex.slice(0, head)}…${hex.slice(-tail)}`;
}
