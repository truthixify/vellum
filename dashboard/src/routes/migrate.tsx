import { ccc, useCcc, useSigner } from "@ckb-ccc/connector-react";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import {
  Manifest,
  IdTab,
  Brackets,
  MetaStrip,
  FieldRow,
  Tag,
} from "@/components/vellum/Manifest";
import { VButton } from "@/components/vellum/VButton";
import { useCopy } from "@/hooks/use-copy";
import { useDocumentTitle } from "@/hooks/use-document-title";

import { buildMigrationTx } from "@ckb-ccc/identity";
import {
  fetchPlcLog,
  getGenesisOperation,
  getRotationKeys,
  type PlcOperation,
  type PlcRotationKey,
} from "@ckb-ccc/identity/plc";

export const Route = createFileRoute("/migrate")({
  component: MigratePage,
});

type Stage =
  | "source"
  | "compose"
  | "review"
  | "pending"
  | "done"
  | "error";

function MigratePage() {
  useDocumentTitle("Migrate from did:plc");
  const signer = useSigner();
  const { client, open } = useCcc();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { copied, copy } = useCopy();

  const networkLabel =
    client instanceof ccc.ClientPublicMainnet ? "MAINNET" : "TESTNET";

  const [sourceInput, setSourceInput] = useState("");
  const [log, setLog] = useState<PlcOperation[] | null>(null);
  const [genesis, setGenesis] = useState<PlcOperation | null>(null);
  const [rotationKeys, setRotationKeys] = useState<PlcRotationKey[]>([]);
  const [fetchingLog, setFetchingLog] = useState(false);
  const [sourceError, setSourceError] = useState<string | null>(null);

  const [selectedKeyIndex, setSelectedKeyIndex] = useState(0);
  const [privateKey, setPrivateKey] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [stage, setStage] = useState<Stage>("source");
  const [tx, setTx] = useState<ccc.Transaction | null>(null);
  const [resultDid, setResultDid] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<ccc.Hex | null>(null);
  const [blockNumber, setBlockNumber] = useState<bigint | null>(null);
  const [windowSettlesAt, setWindowSettlesAt] = useState<number | null>(null);

  useEffect(() => {
    if (!txHash || stage !== "pending") return;
    let cancelled = false;
    const poll = async () => {
      try {
        const onChain = await client.getTransaction(txHash);
        if (!onChain || cancelled) return;
        if (onChain.status === "committed") {
          setBlockNumber(onChain.blockNumber ?? null);
          setWindowSettlesAt(Date.now() + 72 * 60 * 60 * 1000);
          setStage("done");
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
  }, [txHash, stage, client, queryClient]);

  async function handleFetchSource(e?: React.FormEvent) {
    e?.preventDefault();
    setSourceError(null);
    const did = sourceInput.trim();
    if (!did.startsWith("did:plc:")) {
      setSourceError("Expected a did:plc:... identifier");
      return;
    }
    setFetchingLog(true);
    try {
      const ops = await fetchPlcLog(did);
      const g = getGenesisOperation(ops);
      const keys = getRotationKeys(g);
      setLog(ops);
      setGenesis(g);
      setRotationKeys(keys);
      // Pre-populate compose fields from the PLC document
      if (typeof g.alsoKnownAs?.[0] === "string") {
        setDisplayName(g.alsoKnownAs[0].replace(/^at:\/\//, ""));
      }
      setStage("compose");
    } catch (err) {
      console.error(err);
      setSourceError(err instanceof Error ? err.message : String(err));
    } finally {
      setFetchingLog(false);
    }
  }

  async function handleStage() {
    if (!signer || !genesis) return;
    setBusy(true);
    setError(null);
    try {
      const built = await buildMigrationTx(signer, {
        sourceDid: sourceInput.trim(),
        genesisOperation: genesis,
        rotationKeyIndex: selectedKeyIndex,
        rotationPrivateKeyHex: privateKey.trim(),
        profile: {
          displayName: displayName.trim() || undefined,
          bio: bio.trim() || undefined,
        },
        alsoKnownAs:
          genesis.alsoKnownAs && genesis.alsoKnownAs.length > 0
            ? genesis.alsoKnownAs
            : undefined,
        verificationMethods:
          genesis.verificationMethods &&
          Object.keys(genesis.verificationMethods).length > 0
            ? genesis.verificationMethods
            : undefined,
        services:
          genesis.services && Object.keys(genesis.services).length > 0
            ? genesis.services
            : undefined,
      });
      setTx(built.tx);
      setResultDid(built.did);
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
      setPrivateKey(""); // wipe from memory after use
      setStage("pending");
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-[1100px] mx-auto px-6 lg:px-12 py-16">
      <div className="mono-caps text-cobalt mb-3">REGISTRY · MIGRATION · {networkLabel}</div>
      <h1 className="text-4xl md:text-5xl font-medium mb-4">Migrate from did:plc.</h1>
      <p className="text-muted-foreground mb-10 max-w-[60ch]">
        Move an existing did:plc identity onto CKB. The genesis operation is
        anchored in your did:ckb's <span className="font-mono">local_id</span>{" "}
        field, signed by one of the PLC rotation keys. After a 72-hour
        finalisation window, the migration is sealed.
      </p>

      {error ? (
        <div className="mb-8 border-2 border-alarm bg-paper px-4 py-3">
          <div className="mono-caps text-alarm mb-1">ERROR</div>
          <p className="text-sm font-mono break-all">{error}</p>
        </div>
      ) : null}

      {stage === "source" && (
        <div className="pt-4 pl-4">
          <Manifest
            idTab={<IdTab color="cobalt">STAGE 01 / 04 · SOURCE</IdTab>}
            state="DRAFT"
            stateLabel="SOURCE · DID:PLC"
            footerLeft="VELLUM · MIGRATION SOURCE"
            footerRight="STAGE 01"
          >
            <div className="px-6 pt-6 pb-3">
              <div className="mono-caps text-muted-foreground mb-3">
                SOURCE IDENTIFIER
              </div>
              <form onSubmit={handleFetchSource} className="flex flex-col sm:flex-row gap-3">
                <input
                  value={sourceInput}
                  onChange={(e) => setSourceInput(e.target.value)}
                  placeholder="did:plc:bxvfvvygwbcnbmknn73t6pbu"
                  className={`flex-1 h-12 bg-paper border px-4 font-mono text-sm focus:outline-none ${
                    sourceError ? "border-alarm" : "border-ink"
                  }`}
                />
                <VButton
                  type="submit"
                  variant="verdant"
                  className="h-12 px-6"
                  disabled={fetchingLog}
                >
                  {fetchingLog ? "Fetching…" : "Fetch from PLC directory"}
                </VButton>
              </form>
              {sourceError && (
                <p className="text-xs text-alarm mt-2">{sourceError}</p>
              )}
              <p className="text-xs text-muted-foreground mt-3 max-w-[58ch]">
                We pull your PLC operation log from{" "}
                <span className="font-mono">plc.directory</span>. Only the
                genesis operation is needed for the on-chain witness (WIP-02
                §3.1.1).
              </p>
            </div>
          </Manifest>
        </div>
      )}

      {stage !== "source" && genesis && (
        <div className="grid lg:grid-cols-2 gap-8 mb-12">
          <div className="pt-4 pl-4">
            <Manifest
              idTab={<IdTab color="cobalt">SOURCE · DID:PLC</IdTab>}
              state="MIGRATING"
              stateLabel="PLC SOURCE"
              footerLeft="VELLUM · PLC GENESIS"
              footerRight={`OPS ${log?.length ?? 1}`}
            >
              <div className="px-6 pt-6 pb-3">
                <div className="mono-caps text-muted-foreground mb-2">
                  SOURCE IDENTIFIER
                </div>
                <div className="font-mono text-sm md:text-base break-all">
                  {sourceInput.trim()}
                </div>
              </div>
              <MetaStrip
                items={[
                  { label: "Genesis type", value: genesis.type ?? "—" },
                  {
                    label: "Rotation keys",
                    value: String(rotationKeys.length).padStart(2, "0"),
                  },
                  {
                    label: "Operations",
                    value: String(log?.length ?? 1).padStart(2, "0"),
                  },
                  {
                    label: "Handles",
                    value: String(genesis.alsoKnownAs?.length ?? 0).padStart(
                      2,
                      "0",
                    ),
                  },
                ]}
              />
              <div className="px-6 py-5">
                <div className="mono-caps text-muted-foreground mb-2">
                  ROTATION KEYS
                </div>
                <ul className="space-y-2">
                  {rotationKeys.map((rk, i) => (
                    <li key={rk.didKey} className="flex items-center gap-2 flex-wrap">
                      <Tag>#{i}</Tag>
                      <Tag>{rk.curve.toUpperCase()}</Tag>
                      <span className="font-mono text-xs break-all">
                        {rk.didKey}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </Manifest>
          </div>

          <div className="pt-4 pl-4">
            <Manifest
              idTab={<IdTab color="cobalt">TARGET · DID:CKB</IdTab>}
              state={
                stage === "done" ? "MIGRATING" : stage === "pending" ? "PENDING" : "DRAFT"
              }
              stateLabel={
                stage === "done"
                  ? "MIGRATING · 72H WINDOW"
                  : stage === "pending"
                    ? "PENDING · WAITING FOR BLOCK"
                    : "DRAFT · NOT SUBMITTED"
              }
              offset={stage !== "compose"}
              offsetColor="ink"
              footerLeft="VELLUM · MIGRATION TARGET"
              footerRight={
                stage === "done" && windowSettlesAt
                  ? `WINDOW CLOSES ${new Date(windowSettlesAt).toUTCString()}`
                  : "WINDOW 72H"
              }
            >
              <div className="px-6 pt-6 pb-3">
                <div className="mono-caps text-muted-foreground mb-2">
                  NEW IDENTIFIER
                </div>
                <Brackets className="block">
                  <div className="font-mono text-sm md:text-base break-all min-h-[1.5em]">
                    {resultDid ?? "computed after staging"}
                  </div>
                </Brackets>
              </div>
              <MetaStrip
                items={[
                  {
                    label: "Block",
                    value: blockNumber ? blockNumber.toString() : "…",
                  },
                  { label: "Local id", value: "→ DID:PLC" },
                  {
                    label: "Tx hash",
                    value: txHash ? truncate(txHash) : "…",
                  },
                  { label: "Network", value: networkLabel },
                ]}
              />
            </Manifest>
          </div>
        </div>
      )}

      {stage === "compose" && genesis && (
        <div className="pt-4 pl-4">
          <Manifest
            idTab={<IdTab color="cobalt">STAGE 02 / 04 · AUTHORIZE</IdTab>}
            state="DRAFT"
            stateLabel="DRAFT · AUTHORIZE"
            footerLeft="VELLUM · MIGRATION AUTHORIZATION"
            footerRight="STAGE 02"
          >
            <div className="px-6 pt-6 pb-3 space-y-6">
              <div>
                <div className="mono-caps text-muted-foreground mb-2">
                  CHOOSE A ROTATION KEY TO SIGN WITH
                </div>
                <ul className="space-y-2">
                  {rotationKeys.map((rk, i) => (
                    <li key={rk.didKey}>
                      <label className="flex items-start gap-3 cursor-pointer p-3 border border-ink hover:bg-paper">
                        <input
                          type="radio"
                          name="rotation"
                          checked={selectedKeyIndex === i}
                          onChange={() => setSelectedKeyIndex(i)}
                          className="mt-1 accent-verdant"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <Tag>#{i}</Tag>
                            <Tag>{rk.curve.toUpperCase()}</Tag>
                          </div>
                          <div className="font-mono text-xs break-all">
                            {rk.didKey}
                          </div>
                        </div>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <div className="mono-caps text-muted-foreground mb-2">
                  ROTATION KEY · PRIVATE (HEX, 32 BYTES)
                </div>
                <input
                  type="password"
                  value={privateKey}
                  onChange={(e) => setPrivateKey(e.target.value)}
                  placeholder="0x…"
                  className="w-full h-11 bg-paper border border-ink px-3 font-mono text-sm focus:outline-none"
                  autoComplete="off"
                  spellCheck={false}
                />
                <p className="text-xs text-alarm mt-2 max-w-[78ch]">
                  This private key is used once to sign the CKB transaction
                  hash and is never stored, logged, or transmitted by Vellum.
                  Only paste a key you trust this browser session with.
                </p>
              </div>

              <div>
                <div className="mono-caps text-muted-foreground mb-2">
                  NEW DOCUMENT FIELDS
                </div>
                <div className="space-y-3">
                  <input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Display name"
                    className="w-full h-11 bg-paper border border-ink px-3"
                  />
                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value.slice(0, 240))}
                    placeholder="Short bio (optional)"
                    rows={2}
                    className="w-full bg-paper border border-ink px-3 py-2 resize-none"
                  />
                  <p className="text-xs text-muted-foreground">
                    Handles, verification methods, and services from the PLC
                    document are carried over automatically. The avatar
                    defaults to a DID-seeded pixel-art image, which you can
                    change later via /edit.
                  </p>
                </div>
              </div>
            </div>
            <div className="px-6 pb-6 flex justify-between gap-3">
              <Link to="/">
                <VButton variant="ghost">← Cancel</VButton>
              </Link>
              {signer ? (
                <VButton
                  variant="verdant"
                  onClick={handleStage}
                  disabled={busy || !privateKey.trim() || rotationKeys.length === 0}
                >
                  {busy ? "Preparing transaction…" : "Stage migration"}
                </VButton>
              ) : (
                <VButton variant="verdant" onClick={() => open()}>
                  Connect wallet
                </VButton>
              )}
            </div>
          </Manifest>
        </div>
      )}

      {stage === "review" && tx && resultDid && (
        <div className="pt-4 pl-4">
          <Manifest
            idTab={<IdTab color="cobalt">STAGE 03 / 04 · SIGN</IdTab>}
            state="PENDING"
            stateLabel="READY TO SIGN"
            offset
            offsetColor="ink"
            footerLeft="VELLUM · MIGRATION SUMMARY"
            footerRight="STAGE 03"
          >
            <div className="px-6 pt-6 pb-3">
              <div className="mono-caps text-muted-foreground mb-2">
                NEW IDENTIFIER
              </div>
              <Brackets className="block">
                <div className="font-mono text-sm md:text-base break-all">
                  {resultDid}
                </div>
              </Brackets>
            </div>
            <div>
              <FieldRow
                label="Source"
                mono
                value={
                  <span className="font-mono text-xs break-all">
                    {sourceInput.trim()}
                  </span>
                }
              />
              <FieldRow
                label="Capacity"
                mono
                value={`${ccc.fixedPointToString(tx.outputs[0].capacity, 8)} CKB`}
              />
              <FieldRow
                label="Signed by"
                mono
                value={
                  <span className="font-mono text-xs break-all">
                    rotation key #{selectedKeyIndex} · {rotationKeys[selectedKeyIndex]?.curve}
                  </span>
                }
              />
              <FieldRow label="Network" mono value={networkLabel} />
            </div>
            <div className="px-6 py-5 border-t border-hairline text-xs text-muted-foreground max-w-[78ch]">
              Your wallet will prompt once to authorize the CKB transaction's
              lock script. The PLC rotation-key signature has already been
              attached to the witness. After approval, the migration cell
              lands on chain in <Tag variant="cobalt">MIGRATING</Tag> state
              for 72 hours before sealing.
            </div>
            <div className="px-6 pb-6 flex justify-between gap-3">
              <VButton variant="ghost" onClick={() => setStage("compose")}>
                ← Back to authorize
              </VButton>
              <VButton variant="verdant" onClick={handleSign} disabled={busy}>
                {busy ? "Waiting for wallet…" : "Sign migration transaction"}
              </VButton>
            </div>
          </Manifest>
        </div>
      )}

      {stage === "pending" && (
        <div className="pt-4 pl-4">
          <Manifest
            idTab={<IdTab color="cobalt">STAGE 04 / 04 · CONFIRMATION</IdTab>}
            state="PENDING"
            stateLabel="PENDING · WAITING FOR BLOCK"
            offset
            footerLeft="VELLUM · MIGRATION SUBMITTED"
            footerRight="STAGE 04"
          >
            <div className="px-6 py-10 text-center">
              <div className="mono-caps text-muted-foreground mb-4">
                BURNING NOTHING · MINTING THE TARGET CELL
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
          </Manifest>
        </div>
      )}

      {stage === "done" && resultDid && (
        <div className="pt-4 pl-4">
          <Manifest
            idTab={<IdTab color="cobalt">STAGE 04 / 04 · MIGRATING</IdTab>}
            state="MIGRATING"
            stateLabel="MIGRATING · 72H WINDOW OPEN"
            offset
            footerLeft={
              blockNumber
                ? `VELLUM · STAMPED · BLOCK ${blockNumber.toString()}`
                : "VELLUM · MIGRATION CONFIRMED"
            }
            footerRight="STAGE 04"
          >
            <div className="px-6 pt-6 pb-3">
              <div className="mono-caps text-muted-foreground mb-2">
                NEW IDENTIFIER
              </div>
              <Brackets className="block">
                <div className="font-mono text-sm md:text-base break-all">
                  {resultDid}
                </div>
              </Brackets>
              <p className="text-sm text-muted-foreground mt-6 max-w-[78ch]">
                The migration cell is live on chain. During the next 72 hours,
                a higher-priority rotation key from the source did:plc can
                submit a competing migration and overwrite this one. After
                the window closes, the migration is final and the status
                flips to <Tag>ACTIVE</Tag>.
              </p>
            </div>
            <div className="px-6 py-6 flex flex-wrap gap-3 justify-end">
              <VButton variant="secondary" onClick={() => copy(resultDid)}>
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
        </div>
      )}
    </div>
  );
}

function truncate(hex: string, head = 8, tail = 6): string {
  if (hex.length <= head + tail + 1) return hex;
  return `${hex.slice(0, head)}…${hex.slice(-tail)}`;
}
