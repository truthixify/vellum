import { useCcc } from "@ckb-ccc/connector-react";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import {
  Manifest,
  IdTab,
  Brackets,
  MetaStrip,
  FieldRow,
  Tag,
} from "@/components/vellum/Manifest";
import { VButton } from "@/components/vellum/VButton";

import {
  isDidCkb,
  resolveDid,
  PROFILE_SERVICE_KEY,
  type DidRecord,
} from "@/lib/did-ckb";
import { Avatar } from "@/components/vellum/Avatar";
import { useCopy } from "@/hooks/use-copy";

export const Route = createFileRoute("/resolve")({
  component: ResolvePage,
});

type Status = "idle" | "loading" | "ok" | "not_found" | "error";

function ResolvePage() {
  const { client } = useCcc();
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [record, setRecord] = useState<DidRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleResolve(e: React.FormEvent) {
    e.preventDefault();
    const did = input.trim();
    if (!did) return;
    setError(null);
    setRecord(null);

    if (!isDidCkb(did)) {
      setStatus("error");
      setError("Not a valid did:ckb identifier. Expected did:ckb:<32 chars base32>.");
      return;
    }
    setStatus("loading");
    try {
      const r = await resolveDid(client, did);
      if (!r) {
        setStatus("not_found");
        return;
      }
      setRecord(r);
      setStatus("ok");
    } catch (err) {
      console.error(err);
      setStatus("error");
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="max-w-[1100px] mx-auto px-6 lg:px-12 py-16">
      <div className="mono-caps text-muted-foreground mb-3">REGISTRY · LOOKUP</div>
      <h1 className="text-4xl md:text-5xl font-medium mb-12">Resolve any DID.</h1>

      <form onSubmit={handleResolve} className="flex flex-col sm:flex-row gap-3 mb-16">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="did:ckb:..."
          className="flex-1 h-14 bg-paper border border-ink px-4 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-verdant"
        />
        <VButton
          type="submit"
          variant="verdant"
          className="h-14 px-8"
          disabled={status === "loading"}
        >
          {status === "loading" ? "Resolving…" : "Resolve"}
        </VButton>
      </form>

      {status === "idle" && <EmptyState />}

      {status === "loading" && (
        <div className="border-2 border-ink p-20 text-center">
          <div className="mono-caps text-muted-foreground">
            RESOLVING DID, INDEXING CELLS…
          </div>
        </div>
      )}

      {status === "not_found" && (
        <div className="border-2 border-ink p-20 text-center">
          <div className="mono-caps text-alarm mb-2">NOT FOUND</div>
          <p className="text-muted-foreground">
            No Live DID Cell matches that identifier on the current network.
          </p>
        </div>
      )}

      {status === "error" && error && (
        <div className="border-2 border-alarm p-10">
          <div className="mono-caps text-alarm mb-2">ERROR</div>
          <p className="text-sm font-mono break-all">{error}</p>
        </div>
      )}

      {status === "ok" && record && <ResolvedManifest record={record} />}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="border-2 border-ink p-20 text-center">
      <div className="w-12 h-12 mx-auto mb-6 border-2 border-verdant" />
      <div className="mono-caps text-muted-foreground">PASTE A DID TO RESOLVE</div>
      <p className="mt-3 text-muted-foreground">Public records are free to read.</p>
    </div>
  );
}

function ResolvedManifest({ record }: { record: DidRecord }) {
  const { document, profile } = record;
  const handles = document.alsoKnownAs ?? [];
  const verificationMethods = Object.entries(document.verificationMethods ?? {});
  const services = Object.entries(document.services ?? {}).filter(
    ([key]) => key !== PROFILE_SERVICE_KEY,
  );
  const localIdString = record.localId
    ? new TextDecoder().decode(toBytes(record.localId))
    : null;
  const { copied, copy } = useCopy();

  return (
    <div className="pt-4 pl-4">
      <Manifest
        idTab={<IdTab>VL · DID:CKB</IdTab>}
        state="ACTIVE"
        offset
        footerLeft="VELLUM · PUBLIC RECORD · READ-ONLY"
        footerRight="LIVE"
      >
        <div className="px-6 pt-8 pb-6">
          <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
            <div className="mono-caps text-muted-foreground">
              REGISTERED IDENTIFIER
            </div>
            <VButton variant="secondary" onClick={() => copy(record.did)}>
              {copied ? "Copied" : "Copy DID"}
            </VButton>
          </div>
          <Brackets className="block">
            <div className="font-mono text-[20px] md:text-[28px] leading-tight break-all">
              {record.did}
            </div>
          </Brackets>
        </div>
        <MetaStrip
          items={[
            {
              label: "Tx hash",
              value: truncate(record.cell.outPoint.txHash, 8, 6),
            },
            {
              label: "Handles",
              value: String(handles.length).padStart(2, "0"),
            },
            {
              label: "Verification keys",
              value: String(verificationMethods.length).padStart(2, "0"),
            },
            {
              label: "Services",
              value: String(services.length).padStart(2, "0"),
            },
          ]}
        />
        <div>
          {profile.displayName && (
            <FieldRow
              label="Display name"
              value={
                <span className="text-2xl font-medium">{profile.displayName}</span>
              }
            />
          )}
          {profile.bio && <FieldRow label="Bio" value={profile.bio} />}
          {profile.avatar && (
            <FieldRow
              label="Avatar"
              value={
                <div className="flex items-center gap-4 flex-wrap">
                  <Avatar
                    url={profile.avatar}
                    fallback={(profile.displayName ?? record.did.slice(-2))
                      .slice(0, 2)
                      .toUpperCase()}
                    size="lg"
                  />
                  <a
                    href={profile.avatar}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-xs text-muted-foreground hover:text-cobalt underline break-all"
                  >
                    {profile.avatar}
                  </a>
                </div>
              }
            />
          )}
          {handles.length > 0 && (
            <FieldRow
              label="Handles"
              mono
              value={
                <div className="flex flex-wrap gap-2 items-center">
                  {handles.map((h) => (
                    <span key={h} className="font-mono text-sm break-all">
                      {h}
                    </span>
                  ))}
                </div>
              }
            />
          )}
          {verificationMethods.map(([k, v]) => (
            <FieldRow
              key={`vm-${k}`}
              label={`Verification: ${k}`}
              mono
              value={<span className="font-mono text-sm break-all">{v}</span>}
            />
          ))}
          {services.map(([k, v]) => (
            <FieldRow
              key={`svc-${k}`}
              label={`Service: ${k}`}
              mono
              value={
                <div className="flex flex-col gap-1">
                  <div className="flex gap-2 items-center">
                    <Tag>{(v as { type?: string }).type ?? "SERVICE"}</Tag>
                  </div>
                  <span className="font-mono text-sm break-all">
                    {(v as { endpoint?: string }).endpoint ?? ""}
                  </span>
                </div>
              }
            />
          ))}
          {localIdString && (
            <FieldRow
              label="Migrated from"
              mono
              value={
                <div className="flex flex-wrap gap-2 items-center">
                  <Tag variant="cobalt">MIGRATED FROM PLC</Tag>
                  <span className="break-all font-mono text-sm">{localIdString}</span>
                </div>
              }
            />
          )}
        </div>
      </Manifest>
    </div>
  );
}

function truncate(hex: string, head = 8, tail = 6): string {
  if (hex.length <= head + tail + 1) return hex;
  return `${hex.slice(0, head)}…${hex.slice(-tail)}`;
}

function toBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}
