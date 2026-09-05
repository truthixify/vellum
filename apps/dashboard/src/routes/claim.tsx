import { ccc, useCcc, useSigner } from "@ckb-ccc/connector-react";
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

import { buildCreateTx } from "@ckb-ccc/identity";
import type { CreateTxResult } from "@ckb-ccc/identity";
import { Avatar } from "@/components/vellum/Avatar";
import { useCopy } from "@/hooks/use-copy";
import { useDocumentTitle } from "@/hooks/use-document-title";

export const Route = createFileRoute("/claim")({
  component: ClaimPage,
});

const STEPS = ["CONFIRM COST", "COMPOSE DOCUMENT", "SIGN AND SUBMIT", "CONFIRMATION"];

type Stage = 0 | 1 | 2 | 3;

function ClaimPage() {
  useDocumentTitle("Claim a DID");
  const signer = useSigner();
  const { client, open } = useCcc();
  const navigate = useNavigate();

  const [step, setStep] = useState<Stage>(0);
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState("");
  const [bio, setBio] = useState("");
  const [handle, setHandle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [built, setBuilt] = useState<CreateTxResult | null>(null);
  const [txHash, setTxHash] = useState<ccc.Hex | null>(null);
  const [confirmation, setConfirmation] = useState<{
    blockNumber?: bigint;
    status: "pending" | "committed";
  } | null>(null);
  const { copied, copy } = useCopy();

  const networkLabel =
    client instanceof ccc.ClientPublicMainnet ? "MAINNET" : "TESTNET";

  async function handleStage() {
    if (!signer) {
      setError("Connect a wallet first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await buildCreateTx(signer, {
        profile: {
          displayName: name.trim() || undefined,
          avatar: avatar.trim() || undefined,
          bio: bio.trim() || undefined,
        },
        alsoKnownAs: handle.trim() ? [handle.trim()] : undefined,
      });
      setBuilt(result);
      setStep(2);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleSign() {
    if (!signer || !built) return;
    setBusy(true);
    setError(null);
    try {
      const hash = await signer.sendTransaction(built.tx);
      setTxHash(hash);
      setConfirmation({ status: "pending" });
      setStep(3);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!txHash || !client || confirmation?.status === "committed") return;
    let cancelled = false;
    const poll = async () => {
      try {
        const onChain = await client.getTransaction(txHash);
        if (!onChain || cancelled) return;
        if (onChain.status === "committed") {
          setConfirmation({
            status: "committed",
            blockNumber: onChain.blockNumber ?? undefined,
          });
          return;
        }
      } catch (err) {
        console.warn("Polling tx failed", err);
      }
      if (!cancelled) setTimeout(poll, 3000);
    };
    void poll();
    return () => {
      cancelled = true;
    };
  }, [txHash, client, confirmation?.status]);

  function copyDid() {
    if (!built) return;
    void copy(built.did);
  }

  return (
    <div className="max-w-[920px] mx-auto px-6 lg:px-12 py-16">
      <div className="mono-caps text-muted-foreground mb-3">
        REGISTRY · ENROLMENT · {networkLabel}
      </div>
      <h1 className="text-4xl md:text-5xl font-medium mb-4">Claim a did:ckb.</h1>
      <p className="text-muted-foreground mb-12 max-w-[58ch]">
        Four steps. Your wallet signs once at the end. Storage is locked, not spent.
      </p>

      <div className="grid grid-cols-4 mb-12">
        {STEPS.map((label, i) => (
          <div
            key={label}
            className={`px-3 py-3 border-t-2 ${
              i <= step ? "border-verdant" : "border-hairline"
            }`}
          >
            <div className="mono-caps text-muted-foreground">
              STEP {String(i + 1).padStart(2, "0")} / 04
            </div>
            <div className="mono-caps mt-1 text-ink hidden md:block">{label}</div>
          </div>
        ))}
      </div>

      {error ? (
        <div className="mb-8 border-2 border-alarm bg-paper px-4 py-3">
          <div className="mono-caps text-alarm mb-1">ERROR</div>
          <p className="text-sm font-mono break-all">{error}</p>
        </div>
      ) : null}

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
              <div className="mono-caps text-muted-foreground mb-3">
                CAPACITY LOCKED ON CHAIN
              </div>
              <Brackets className="block">
                <div className="font-mono text-[48px] md:text-[64px] leading-none">
                  ~300 to 600 CKB
                </div>
              </Brackets>
              <p className="text-xs text-muted-foreground mt-4 max-w-[58ch]">
                The exact figure depends on your document size and lock script. The
                review step before signing will show the precise amount.
              </p>
            </div>
            <MetaStrip
              items={[
                { label: "Type", value: "STORAGE RENT" },
                { label: "Reserve", value: "200 CKB" },
                { label: "Network fee", value: "< 0.01 CKB" },
                { label: "Recoverable", value: "YES" },
              ]}
            />
            <div className="px-6 py-6 text-sm text-muted-foreground">
              CKB is locked, not spent. The capacity sits inside your DID Cell and
              returns to your wallet in full when you deactivate. The 200 CKB
              reserve is padding so you can grow the document later without topping
              up the cell.
            </div>
            <div className="px-6 pb-6 flex justify-end gap-3">
              <Link to="/">
                <VButton variant="secondary">Cancel</VButton>
              </Link>
              <VButton variant="verdant" onClick={() => setStep(1)}>
                Continue
              </VButton>
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
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full h-11 bg-paper border border-ink px-3"
                  placeholder="Margot Weil"
                />
              </Field>
              <Field label="Bio">
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value.slice(0, 240))}
                  rows={3}
                  className="w-full bg-paper border border-ink px-3 py-2 resize-none"
                  placeholder="Up to 240 characters."
                />
                <div className="mono-caps text-muted-foreground mt-1.5">
                  {bio.length} / 240
                </div>
              </Field>
              <Field label="Handle">
                <div className="flex gap-2 items-center">
                  <Tag>HANDLE</Tag>
                  <input
                    value={handle}
                    onChange={(e) => setHandle(e.target.value)}
                    placeholder="at://you.bsky.social"
                    className="flex-1 h-11 bg-paper border border-ink px-3 font-mono text-sm"
                  />
                </div>
              </Field>
              <Field label="Avatar URL">
                <div className="flex items-start gap-4 flex-wrap sm:flex-nowrap">
                  <Avatar
                    url={avatar}
                    fallback={(name || "??").slice(0, 2).toUpperCase()}
                    size="md"
                  />
                  <div className="flex-1 min-w-0">
                    <input
                      value={avatar}
                      onChange={(e) => setAvatar(e.target.value)}
                      placeholder="Leave empty for the DID-seeded pixel-art default"
                      className="w-full h-11 bg-paper border border-ink px-3 font-mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground mt-1.5 max-w-[58ch]">
                      Leave empty and we'll generate a pixel-art avatar from
                      your new DID. Paste any image URL to override.
                      ipfs:// goes through a public gateway.
                    </p>
                  </div>
                </div>
              </Field>
            </div>
            <div className="px-6 pb-6 flex justify-between">
              <VButton variant="ghost" onClick={() => setStep(0)}>
                ← Back
              </VButton>
              {signer ? (
                <VButton
                  variant="verdant"
                  onClick={handleStage}
                  disabled={!name || busy}
                >
                  {busy ? "Preparing transaction…" : "Stage for signing"}
                </VButton>
              ) : (
                <VButton variant="verdant" onClick={() => open()}>
                  Connect wallet
                </VButton>
              )}
            </div>
          </Manifest>
        )}

        {step === 2 && built && (
          <Manifest
            idTab={<IdTab>STEP 03 / 04 · SIGN</IdTab>}
            state="PENDING"
            stateLabel="READY TO SIGN"
            offset
            footerLeft="VELLUM · TRANSACTION SUMMARY"
            footerRight="DOC 001"
          >
            <div className="px-6 pt-8 pb-4">
              <div className="mono-caps text-muted-foreground mb-3">
                IDENTIFIER (PREVIEW)
              </div>
              <Brackets className="block">
                <div className="font-mono text-[20px] md:text-[26px] leading-tight break-all">
                  {built.did}
                </div>
              </Brackets>
            </div>
            <div>
              <FieldRow
                label="Display name"
                value={
                  <span className="text-xl font-medium">{name || "(unset)"}</span>
                }
              />
              <FieldRow
                label="Bio"
                value={bio || <span className="text-muted-foreground">(unset)</span>}
              />
              <FieldRow
                label="Handle"
                mono
                value={
                  handle || (
                    <span className="text-muted-foreground font-sans">(unset)</span>
                  )
                }
              />
              <FieldRow
                label="Capacity to lock"
                mono
                value={
                  <span className="font-medium">
                    {ccc.fixedPointToString(built.tx.outputs[0].capacity, 8)} CKB
                  </span>
                }
              />
              <FieldRow
                label="Inputs"
                mono
                value={String(built.tx.inputs.length)}
              />
              <FieldRow
                label="Outputs"
                mono
                value={String(built.tx.outputs.length)}
              />
              <FieldRow label="Network" mono value={networkLabel} />
            </div>
            <div className="px-6 py-5 border-t border-hairline text-xs text-muted-foreground max-w-[58ch]">
              Your wallet will prompt once. After you approve, the create
              transaction is broadcast to the CKB network and the DID is
              minted on chain.
            </div>
            <div className="px-6 py-6 flex justify-between gap-3">
              <VButton variant="ghost" onClick={() => setStep(1)}>
                ← Back
              </VButton>
              <VButton variant="verdant" onClick={handleSign} disabled={busy}>
                {busy ? "Waiting for wallet…" : "Sign create transaction"}
              </VButton>
            </div>
          </Manifest>
        )}

        {step === 3 && built && (
          <Manifest
            idTab={<IdTab>STEP 04 / 04 · CONFIRMATION</IdTab>}
            state={confirmation?.status === "committed" ? "ACTIVE" : "PENDING"}
            stateLabel={
              confirmation?.status === "committed"
                ? "ACTIVE · ON CHAIN"
                : "PENDING · WAITING FOR BLOCK"
            }
            offset
            footerLeft={
              confirmation?.blockNumber
                ? `VELLUM · STAMPED · BLOCK ${confirmation.blockNumber.toString()}`
                : "VELLUM · TRANSACTION SUBMITTED"
            }
            footerRight="DOC 001"
          >
            <div className="px-6 pt-8 pb-4">
              <div className="mono-caps text-muted-foreground mb-3">
                YOUR IDENTIFIER
              </div>
              <Brackets className="block">
                <div className="font-mono text-[20px] md:text-[26px] leading-tight break-all">
                  {built.did}
                </div>
              </Brackets>
            </div>
            <MetaStrip
              items={[
                {
                  label: "Status",
                  value: confirmation?.status === "committed" ? "ACTIVE" : "PENDING",
                },
                {
                  label: "Capacity",
                  value: `${ccc.fixedPointToString(built.tx.outputs[0].capacity, 8)} CKB`,
                },
                {
                  label: "Tx hash",
                  value: txHash ? truncate(txHash) : "…",
                },
                { label: "Network", value: networkLabel },
              ]}
            />
            {confirmation?.status !== "committed" ? (
              <div className="px-6 py-6 border-t border-hairline">
                <div className="flex items-center gap-3 mb-3">
                  <span className="pulse-dot inline-block w-2 h-2 bg-amber" />
                  <span className="mono-caps text-muted-foreground">
                    Waiting for confirmation on chain
                  </span>
                </div>
                <p className="text-sm text-muted-foreground max-w-[58ch]">
                  The transaction has been submitted. We're polling the indexer for
                  inclusion in a committed block. This usually takes seconds; if it
                  takes longer than a minute, check the tx hash on an explorer.
                </p>
              </div>
            ) : null}
            <div className="px-6 py-6 flex flex-wrap gap-3 justify-end">
              <VButton variant="secondary" onClick={copyDid}>
                {copied ? "Copied" : "Copy DID"}
              </VButton>
              {confirmation?.status === "committed" ? (
                <VButton
                  variant="verdant"
                  onClick={() => navigate({ to: "/my" })}
                >
                  View my DID
                </VButton>
              ) : (
                <VButton variant="verdant" disabled>
                  Waiting for block…
                </VButton>
              )}
            </div>
          </Manifest>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mono-label text-muted-foreground mb-2 flex items-center gap-2">
        {label} {required && <span className="text-alarm">*</span>}
      </div>
      {children}
    </div>
  );
}

function truncate(hex: string, head = 8, tail = 6): string {
  if (hex.length <= head + tail + 1) return hex;
  return `${hex.slice(0, head)}…${hex.slice(-tail)}`;
}
