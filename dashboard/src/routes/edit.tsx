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
import { Avatar } from "@/components/vellum/Avatar";
import { VButton } from "@/components/vellum/VButton";
import { useCopy } from "@/hooks/use-copy";

import {
  buildDocument,
  buildUpdateTx,
  defaultAvatarUrl,
  PROFILE_SERVICE_KEY,
  resolveDid,
  type DidRecord,
} from "@/lib/did-ckb";

const searchSchema = z.object({
  did: z.string().optional(),
});

export const Route = createFileRoute("/edit")({
  validateSearch: searchSchema,
  component: EditPage,
});

type HandleEntry = { id: string; value: string };
type KvEntry = { id: string; key: string; value: string };
type ServiceEntry = {
  id: string;
  key: string;
  type: string;
  endpoint: string;
};
type Stage = "compose" | "review" | "pending" | "done";

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

function EditPage() {
  const { did } = Route.useSearch();
  const signer = useSigner();
  const { client, open } = useCcc();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const {
    data: record,
    isLoading: loadingRecord,
    error: loadError,
  } = useQuery({
    queryKey: ["did", did, "edit"],
    queryFn: async (): Promise<DidRecord | null> => {
      if (!did) return null;
      return resolveDid(client, did);
    },
    enabled: !!did,
  });

  const [displayName, setDisplayName] = useState("");
  const [avatar, setAvatar] = useState("");
  const [bio, setBio] = useState("");
  const [handles, setHandles] = useState<HandleEntry[]>([]);
  const [vms, setVms] = useState<KvEntry[]>([]);
  const [services, setServices] = useState<ServiceEntry[]>([]);

  const [stage, setStage] = useState<Stage>("compose");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tx, setTx] = useState<ccc.Transaction | null>(null);
  const [txHash, setTxHash] = useState<ccc.Hex | null>(null);
  const [blockNumber, setBlockNumber] = useState<bigint | null>(null);

  const { copied, copy } = useCopy();

  useEffect(() => {
    if (!record) return;
    setDisplayName(record.profile.displayName ?? "");
    setAvatar(record.profile.avatar ?? "");
    setBio(record.profile.bio ?? "");
    setHandles(
      (record.document.alsoKnownAs ?? []).map((v) => ({
        id: genId(),
        value: v,
      })),
    );
    setVms(
      Object.entries(record.document.verificationMethods ?? {}).map(
        ([k, v]) => ({ id: genId(), key: k, value: v }),
      ),
    );
    setServices(
      Object.entries(record.document.services ?? {})
        .filter(([k]) => k !== PROFILE_SERVICE_KEY)
        .map(([k, v]) => ({
          id: genId(),
          key: k,
          type: (v as { type?: string }).type ?? "",
          endpoint: (v as { endpoint?: string }).endpoint ?? "",
        })),
    );
  }, [record]);

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
        body="Editing needs an explicit DID. Pick the one you want to update from your dashboard."
        cta={{ to: "/my", label: "Back to My DID" }}
      />
    );
  }

  if (loadingRecord) {
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
        cta={{ to: "/my", label: "Back to My DID" }}
      />
    );
  }

  function addHandle() {
    setHandles((rows) => [...rows, { id: genId(), value: "" }]);
  }
  function removeHandle(id: string) {
    setHandles((rows) => rows.filter((r) => r.id !== id));
  }
  function updateHandle(id: string, value: string) {
    setHandles((rows) => rows.map((r) => (r.id === id ? { ...r, value } : r)));
  }
  function addVm() {
    setVms((rows) => [...rows, { id: genId(), key: "", value: "" }]);
  }
  function removeVm(id: string) {
    setVms((rows) => rows.filter((r) => r.id !== id));
  }
  function updateVm(id: string, patch: Partial<Omit<KvEntry, "id">>) {
    setVms((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  function addService() {
    setServices((rows) => [
      ...rows,
      { id: genId(), key: "", type: "", endpoint: "" },
    ]);
  }
  function removeService(id: string) {
    setServices((rows) => rows.filter((r) => r.id !== id));
  }
  function updateService(
    id: string,
    patch: Partial<Omit<ServiceEntry, "id">>,
  ) {
    setServices((rows) =>
      rows.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    );
  }

  async function handleStage() {
    if (!signer) {
      setError("Connect a wallet first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const cleanHandles = handles
        .map((h) => h.value.trim())
        .filter((v) => v.length > 0);
      const cleanVms = Object.fromEntries(
        vms
          .filter((v) => v.key.trim() && v.value.trim())
          .map((v) => [v.key.trim(), v.value.trim()]),
      );
      const cleanServices = Object.fromEntries(
        services
          .filter((s) => s.key.trim() && s.type.trim() && s.endpoint.trim())
          .map((s) => [
            s.key.trim(),
            { type: s.type.trim(), endpoint: s.endpoint.trim() },
          ]),
      );
      const trimmedAvatar = avatar.trim();
      const document = buildDocument(
        {
          displayName: displayName.trim() || undefined,
          // Empty field falls back to the DiceBear default seeded on the DID,
          // matching the convention used on first claim.
          avatar: trimmedAvatar || defaultAvatarUrl(did!),
          bio: bio.trim() || undefined,
        },
        {
          alsoKnownAs: cleanHandles.length ? cleanHandles : undefined,
          verificationMethods: Object.keys(cleanVms).length
            ? cleanVms
            : undefined,
          services: Object.keys(cleanServices).length
            ? cleanServices
            : undefined,
        },
      );
      const built = await buildUpdateTx(signer, { did: did!, document });
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
      <div className="mono-caps text-muted-foreground mb-3">
        REGISTRY · EDIT DOCUMENT · {networkLabel}
      </div>
      <h1 className="text-4xl md:text-5xl font-medium mb-4">Edit DID.</h1>
      <p className="text-muted-foreground mb-10 max-w-[58ch]">
        Update your document on chain. Capacity is reused, you pay only the
        network fee. The Lock Script on the cell authorizes the update.
      </p>

      <div className="mb-12 border border-ink p-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="mono-caps text-muted-foreground mb-1">EDITING</div>
          <div className="font-mono text-sm break-all">{record.did}</div>
        </div>
        <VButton variant="secondary" onClick={() => copy(record.did)}>
          {copied ? "Copied" : "Copy DID"}
        </VButton>
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
            stateLabel="DRAFT · COMPOSING"
            footerLeft="VELLUM · DOCUMENT BODY"
            footerRight="REV +01"
          >
            <div className="px-6 py-6 space-y-6">
              <Section title="Profile">
                <Field label="Display name">
                  <input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full h-11 bg-paper border border-ink px-3"
                    placeholder="Your name"
                  />
                </Field>
                <Field label="Avatar URL">
                  <div className="flex items-start gap-4">
                    <Avatar
                      url={avatar.trim() || defaultAvatarUrl(record.did)}
                      fallback={(displayName || record.did.slice(-2))
                        .slice(0, 2)
                        .toUpperCase()}
                      size="md"
                    />
                    <div className="flex-1 min-w-0">
                      <input
                        value={avatar}
                        onChange={(e) => setAvatar(e.target.value)}
                        className="w-full h-11 bg-paper border border-ink px-3 font-mono text-sm"
                        placeholder="Leave empty for the DID-seeded pixel-art default"
                      />
                      <p className="text-xs text-muted-foreground mt-1.5">
                        Leave empty and we'll generate a pixel-art avatar
                        from your DID. Paste a URL to override. ipfs:// goes
                        through a public gateway.
                      </p>
                    </div>
                  </div>
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
              </Section>

              <Section
                title="Handles"
                subtitle="Other identifiers you want to claim, like at://you.bsky.social or nostr://you@example.com."
              >
                {handles.length === 0 ? null : (
                  <div className="space-y-2">
                    {handles.map((h) => (
                      <div key={h.id} className="flex gap-2 items-center">
                        <input
                          value={h.value}
                          onChange={(e) => updateHandle(h.id, e.target.value)}
                          placeholder="at://you.bsky.social"
                          className="flex-1 h-11 bg-paper border border-ink px-3 font-mono text-sm"
                        />
                        <RemoveButton onClick={() => removeHandle(h.id)} />
                      </div>
                    ))}
                  </div>
                )}
                <AddRow onClick={addHandle} label="+ Add handle" />
              </Section>

              <Section
                title="Verification methods"
                subtitle="Named public keys this DID is bound to. Used by the AT Protocol, Nostr, and custom integrations."
              >
                {vms.length === 0 ? null : (
                  <div className="space-y-2">
                    {vms.map((vm) => (
                      <div key={vm.id} className="grid grid-cols-1 sm:grid-cols-[160px_minmax(0,1fr)_auto] gap-2 items-center">
                        <input
                          value={vm.key}
                          onChange={(e) => updateVm(vm.id, { key: e.target.value })}
                          placeholder="atproto"
                          className="h-11 bg-paper border border-ink px-3 mono-caps"
                        />
                        <input
                          value={vm.value}
                          onChange={(e) => updateVm(vm.id, { value: e.target.value })}
                          placeholder="did:key:..."
                          className="h-11 bg-paper border border-ink px-3 font-mono text-sm"
                        />
                        <RemoveButton onClick={() => removeVm(vm.id)} />
                      </div>
                    ))}
                  </div>
                )}
                <AddRow onClick={addVm} label="+ Add verification method" />
              </Section>

              <Section
                title="Services"
                subtitle="Endpoints other apps should look at for this DID. The profile service is managed for you and not listed here."
              >
                {services.length === 0 ? null : (
                  <div className="space-y-2">
                    {services.map((s) => (
                      <div
                        key={s.id}
                        className="grid grid-cols-1 sm:grid-cols-[160px_160px_minmax(0,1fr)_auto] gap-2 items-center"
                      >
                        <input
                          value={s.key}
                          onChange={(e) => updateService(s.id, { key: e.target.value })}
                          placeholder="atproto_pds"
                          className="h-11 bg-paper border border-ink px-3 mono-caps"
                        />
                        <input
                          value={s.type}
                          onChange={(e) => updateService(s.id, { type: e.target.value })}
                          placeholder="AtprotoPersonalDataServer"
                          className="h-11 bg-paper border border-ink px-3 mono-caps"
                        />
                        <input
                          value={s.endpoint}
                          onChange={(e) => updateService(s.id, { endpoint: e.target.value })}
                          placeholder="https://example.com"
                          className="h-11 bg-paper border border-ink px-3 font-mono text-sm"
                        />
                        <RemoveButton onClick={() => removeService(s.id)} />
                      </div>
                    ))}
                  </div>
                )}
                <AddRow onClick={addService} label="+ Add service" />
              </Section>
            </div>
            <div className="px-6 pb-6 flex justify-between gap-3">
              <Link to="/my">
                <VButton variant="ghost">← Cancel</VButton>
              </Link>
              {signer ? (
                <VButton
                  variant="verdant"
                  onClick={handleStage}
                  disabled={busy}
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

        {stage === "review" && tx && (
          <Manifest
            idTab={<IdTab>STAGE 02 / 03 · SIGN</IdTab>}
            state="PENDING"
            stateLabel="READY TO SIGN"
            offset
            footerLeft="VELLUM · TRANSACTION SUMMARY"
            footerRight="REV +01"
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
                label="Display name"
                value={<span>{displayName || "(unset)"}</span>}
              />
              <FieldRow
                label="Bio"
                value={bio || <span className="text-muted-foreground">(unset)</span>}
              />
              <FieldRow
                label="Handles"
                mono
                value={
                  handles.filter((h) => h.value.trim()).length === 0
                    ? "(none)"
                    : handles
                        .filter((h) => h.value.trim())
                        .map((h) => h.value)
                        .join(", ")
                }
              />
              <FieldRow
                label="Capacity"
                mono
                value={
                  <span>
                    {ccc.fixedPointToString(tx.outputs[0].capacity, 8)} CKB
                    {tx.outputs[0].capacity >
                    BigInt(record.cell.cellOutput.capacity)
                      ? " (cell grown)"
                      : " (unchanged)"}
                  </span>
                }
              />
              <FieldRow
                label="Inputs"
                mono
                value={String(tx.inputs.length)}
              />
              <FieldRow label="Network" mono value={networkLabel} />
            </div>
            <div className="px-6 py-6 flex justify-between gap-3">
              <VButton variant="ghost" onClick={() => setStage("compose")}>
                ← Back to compose
              </VButton>
              <VButton variant="verdant" onClick={handleSign} disabled={busy}>
                {busy ? "Waiting for wallet…" : "Sign and submit"}
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
            footerLeft="VELLUM · UPDATE SUBMITTED"
            footerRight="REV +01"
          >
            <div className="px-6 pt-8 pb-6">
              <div className="mono-caps text-muted-foreground mb-3">UPDATING</div>
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
            stateLabel="ACTIVE · ON CHAIN"
            offset
            footerLeft={
              blockNumber
                ? `VELLUM · STAMPED · BLOCK ${blockNumber.toString()}`
                : "VELLUM · UPDATE CONFIRMED"
            }
            footerRight="REV +01"
          >
            <div className="px-6 pt-8 pb-4">
              <div className="mono-caps text-muted-foreground mb-3">UPDATED</div>
              <Brackets className="block">
                <div className="font-mono text-[18px] md:text-[22px] leading-tight break-all">
                  {record.did}
                </div>
              </Brackets>
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

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-hairline pt-5 first:border-t-0 first:pt-0">
      <div className="mono-caps text-muted-foreground mb-1">{title}</div>
      {subtitle ? (
        <p className="text-sm text-muted-foreground mb-4 max-w-[58ch]">
          {subtitle}
        </p>
      ) : (
        <div className="mb-3" />
      )}
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mono-label text-muted-foreground mb-2">{label}</div>
      {children}
    </div>
  );
}

function AddRow({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full border border-dashed border-ink py-3 mono-caps hover:bg-ink hover:text-paper transition-colors"
    >
      {label}
    </button>
  );
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mono-caps text-alarm border border-alarm h-11 px-3 hover:bg-alarm hover:text-paper transition-colors"
      aria-label="Remove"
    >
      ×
    </button>
  );
}

function Guard({
  title,
  body,
  cta,
}: {
  title: string;
  body: string;
  cta: { to: "/my"; label: string };
}) {
  return (
    <div className="max-w-[920px] mx-auto px-6 lg:px-12 py-24 text-center">
      <h1 className="text-3xl font-medium mb-4">{title}</h1>
      <p className="text-muted-foreground mb-8 max-w-[58ch] mx-auto">{body}</p>
      <Link to={cta.to}>
        <VButton variant="secondary">{cta.label}</VButton>
      </Link>
    </div>
  );
}

function Status({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-[920px] mx-auto px-6 lg:px-12 py-24">{children}</div>
  );
}
