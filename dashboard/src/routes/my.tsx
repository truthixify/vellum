import { ccc, useCcc, useSigner } from "@ckb-ccc/connector-react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
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

import {
  getDidHistory,
  listDidsByLock,
  PROFILE_SERVICE_KEY,
  type DidRecord,
  type HistoryEntry,
} from "@/lib/did-ckb";
import { Avatar } from "@/components/vellum/Avatar";
import { useCopy } from "@/hooks/use-copy";
import { useDocumentTitle } from "@/hooks/use-document-title";

export const Route = createFileRoute("/my")({
  component: MyDid,
});

function MyDid() {
  useDocumentTitle("My DID");
  const signer = useSigner();
  const { client, open } = useCcc();
  const [lock, setLock] = useState<ccc.Script | null>(null);
  const [selectedDid, setSelectedDid] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadLock() {
      if (!signer) {
        setLock(null);
        return;
      }
      try {
        const addressObj = await signer.getRecommendedAddressObj();
        if (!cancelled) setLock(addressObj.script);
      } catch (err) {
        console.error("Failed to load lock script", err);
        if (!cancelled) setLock(null);
      }
    }
    loadLock();
    return () => {
      cancelled = true;
    };
  }, [signer]);

  const networkLabel =
    client instanceof ccc.ClientPublicMainnet ? "MAINNET" : "TESTNET";

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["my-dids", lock?.codeHash, lock?.hashType, lock?.args, networkLabel],
    queryFn: async () => {
      if (!lock) return [] as DidRecord[];
      return listDidsByLock(client, lock);
    },
    enabled: !!lock,
  });

  if (!signer) {
    return (
      <div className="max-w-[920px] mx-auto px-6 lg:px-12 py-32 text-center">
        <div className="mono-caps text-muted-foreground mb-3">REGISTRY · MY DOCUMENT</div>
        <h1 className="text-4xl md:text-5xl font-medium mb-6">
          Connect a wallet to view your DID.
        </h1>
        <p className="text-muted-foreground mb-10 max-w-[60ch] mx-auto">
          Your DID Cells are indexed by the lock script your wallet controls. Connect a
          wallet to read or manage them.
        </p>
        <VButton variant="verdant" onClick={() => open()}>
          Connect wallet
        </VButton>
      </div>
    );
  }

  if (isLoading || !lock) {
    return (
      <div className="max-w-[1320px] mx-auto px-6 lg:px-12 py-24">
        <div className="mono-caps text-muted-foreground">INDEXING CELLS, RESOLVING DIDS…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-[1320px] mx-auto px-6 lg:px-12 py-24">
        <div className="border-2 border-alarm p-10">
          <div className="mono-caps text-alarm mb-2">ERROR</div>
          <p className="text-sm font-mono break-all">
            {error instanceof Error ? error.message : String(error)}
          </p>
          <button onClick={() => refetch()} className="mt-4 mono-caps underline">
            Retry
          </button>
        </div>
      </div>
    );
  }

  const records = data ?? [];

  if (records.length === 0) {
    return (
      <div className="max-w-[920px] mx-auto px-6 lg:px-12 py-32 text-center">
        <div className="mono-caps text-muted-foreground mb-3">REGISTRY · MY DOCUMENT</div>
        <h1 className="text-4xl md:text-5xl font-medium mb-6">No DID yet.</h1>
        <p className="text-muted-foreground mb-10 max-w-[60ch] mx-auto">
          This wallet doesn't control any did:ckb cells on {networkLabel.toLowerCase()}.
          Claim one to get started.
        </p>
        <Link to="/claim">
          <VButton variant="verdant">Claim a DID</VButton>
        </Link>
      </div>
    );
  }

  const active = records.find((r) => r.did === selectedDid) ?? records[0];

  return (
    <div className="max-w-[1320px] mx-auto px-6 lg:px-12 py-12">
      <div className="mono-caps text-muted-foreground mb-3">
        REGISTRY · MY DOCUMENT · {networkLabel}
      </div>
      <h1 className="text-4xl md:text-5xl font-medium mb-8">Your did:ckb.</h1>

      {records.length > 1 && (
        <div className="flex flex-wrap gap-2 mb-8">
          {records.map((r) => (
            <button
              key={r.did}
              onClick={() => setSelectedDid(r.did)}
              className={`mono-caps px-3 py-2 border ${
                active.did === r.did
                  ? "border-verdant bg-verdant text-paper"
                  : "border-ink text-ink hover:bg-ink hover:text-paper"
              }`}
            >
              {truncate(r.did, 14, 6)}
            </button>
          ))}
        </div>
      )}

      <DidHero record={active} networkLabel={networkLabel} />

      <div className="grid lg:grid-cols-3 gap-8 mt-16">
        <div className="lg:col-span-2 pt-4 pl-4">
          <DocumentBody record={active} />
        </div>
        <div className="pt-4 pl-4">
          <LockScriptCard record={active} />
        </div>
      </div>

      <div id="history" className="mt-20">
        <div className="mono-caps text-muted-foreground mb-3">SECTION · ACTIVITY</div>
        <h2 className="text-3xl font-medium mb-8">Operation history.</h2>
        <ActivityFeed record={active} />
      </div>

      <div className="mt-24 border-2 border-alarm">
        <div className="bg-alarm text-paper px-6 py-2.5 mono-caps">
          DANGER ZONE · IRREVERSIBLE
        </div>
        <div className="p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="max-w-[58ch]">
            <h3 className="text-xl font-medium mb-2">Deactivate this DID.</h3>
            <p className="text-muted-foreground text-sm">
              Burn the Cell, return the locked CKB to your wallet, and make this
              identifier permanently unresolvable. The string can never be reissued.
            </p>
          </div>
          <Link
            to="/deactivate"
            search={{ did: active.did }}
            className="shrink-0"
          >
            <VButton variant="destructive">Deactivate DID</VButton>
          </Link>
        </div>
      </div>
    </div>
  );
}

function DidHero({ record, networkLabel }: { record: DidRecord; networkLabel: string }) {
  const capacityCkb = ccc.fixedPointToString(record.cell.cellOutput.capacity, 8);
  const handles = record.document.alsoKnownAs ?? [];
  const services = Object.entries(record.document.services ?? {}).filter(
    ([k]) => k !== PROFILE_SERVICE_KEY,
  );
  const { copied, copy } = useCopy();

  return (
    <div className="pt-4 pl-4">
      <Manifest
        idTab={<IdTab>VL · DID:CKB</IdTab>}
        state="ACTIVE"
        offset
        footerLeft={`VELLUM · DID DOCUMENT · ${networkLabel}`}
        footerRight="LIVE"
      >
        <div className="px-6 pt-8 pb-6">
          <div className="mono-caps text-muted-foreground mb-3">YOUR IDENTIFIER</div>
          <Brackets className="block">
            <div className="font-mono text-[20px] md:text-[36px] leading-tight break-all">
              {record.did}
            </div>
          </Brackets>
          {(record.profile.displayName || record.profile.avatar) && (
            <div className="mt-6 flex items-center gap-5">
              <Avatar
                url={record.profile.avatar}
                fallback={(record.profile.displayName ?? record.did.slice(-2))
                  .slice(0, 2)
                  .toUpperCase()}
                size="lg"
              />
              {record.profile.displayName && (
                <div className="text-3xl font-medium break-words min-w-0">
                  {record.profile.displayName}
                </div>
              )}
            </div>
          )}
          <div className="mono-caps text-muted-foreground mt-4">
            TX {truncate(record.cell.outPoint.txHash, 10, 8)} · CAPACITY {capacityCkb} CKB
          </div>
        </div>
        <MetaStrip
          items={[
            {
              label: "Tx hash",
              value: truncate(record.cell.outPoint.txHash, 8, 6),
            },
            { label: "Handles", value: String(handles.length).padStart(2, "0") },
            { label: "Services", value: String(services.length).padStart(2, "0") },
            {
              label: "Migrated from",
              value: record.localId ? "DID:PLC" : "—",
            },
          ]}
        />
        <div className="px-6 py-5 flex flex-wrap gap-3 justify-end">
          <VButton variant="secondary" onClick={() => copy(record.did)}>
            {copied ? "Copied" : "Copy DID"}
          </VButton>
          <a href="#history">
            <VButton variant="ghost">View history →</VButton>
          </a>
        </div>
      </Manifest>
    </div>
  );
}

function DocumentBody({ record }: { record: DidRecord }) {
  const { profile, document } = record;
  const handles = document.alsoKnownAs ?? [];
  const verificationMethods = Object.entries(document.verificationMethods ?? {});
  const services = Object.entries(document.services ?? {}).filter(
    ([k]) => k !== PROFILE_SERVICE_KEY,
  );
  const monogramSource = (profile.displayName ?? record.did.slice(-2)).slice(0, 2).toUpperCase();

  return (
    <Manifest
      idTab={<IdTab>DOCUMENT BODY</IdTab>}
      footerLeft="VELLUM · PROFILE FIELDS"
      footerRight={`${handles.length + verificationMethods.length + services.length + (profile.displayName ? 1 : 0) + (profile.bio ? 1 : 0)} FIELDS`}
    >
      <div className="flex justify-end px-6 py-3 border-b border-hairline">
        <Link to="/edit" search={{ did: record.did }}>
          <VButton variant="ghost">Edit document →</VButton>
        </Link>
      </div>
      <FieldRow
        label="Display name"
        value={
          profile.displayName ? (
            <span className="text-xl font-medium">{profile.displayName}</span>
          ) : (
            <span className="text-muted-foreground">(unset)</span>
          )
        }
      />
      <FieldRow
        label="Avatar"
        value={<Avatar url={profile.avatar} fallback={monogramSource} size="md" />}
      />
      <FieldRow
        label="Bio"
        value={profile.bio ?? <span className="text-muted-foreground">(unset)</span>}
      />
      {handles.length > 0 ? (
        handles.map((h) => (
          <FieldRow
            key={`h-${h}`}
            label="Handle"
            mono
            value={
              <div className="flex flex-wrap gap-2 items-center">
                <Tag>HANDLE</Tag>
                <span className="font-mono text-sm break-all">{h}</span>
              </div>
            }
          />
        ))
      ) : (
        <FieldRow
          label="Handle"
          mono
          value={<span className="text-muted-foreground font-sans">(unset)</span>}
        />
      )}
      {verificationMethods.map(([k, v]) => (
        <FieldRow
          key={`v-${k}`}
          label={`Verification: ${k}`}
          mono
          value={<span className="font-mono text-sm break-all">{v}</span>}
        />
      ))}
      {services.map(([k, v]) => (
        <FieldRow
          key={`s-${k}`}
          label={`Service: ${k}`}
          mono
          value={
            <div className="flex flex-wrap gap-2 items-center">
              <Tag>{(v as { type?: string }).type ?? "SERVICE"}</Tag>
              <span className="font-mono text-sm break-all">
                {(v as { endpoint?: string }).endpoint ?? ""}
              </span>
            </div>
          }
        />
      ))}
      <div className="px-6 py-4 border-b border-hairline">
        <Link
          to="/edit"
          search={{ did: record.did }}
          className="block w-full border border-dashed border-ink py-3 mono-caps text-center hover:bg-ink hover:text-paper transition-colors"
        >
          + ADD HANDLE
        </Link>
      </div>
      <div className="px-6 py-4">
        <Link
          to="/edit"
          search={{ did: record.did }}
          className="block w-full border border-dashed border-ink py-3 mono-caps text-center hover:bg-ink hover:text-paper transition-colors"
        >
          + ADD SERVICE
        </Link>
      </div>
    </Manifest>
  );
}

function LockScriptCard({ record }: { record: DidRecord }) {
  const lock = record.cell.cellOutput.lock;
  return (
    <Manifest
      idTab={<IdTab color="ink">LOCK SCRIPT</IdTab>}
      footerLeft="VELLUM · KEY MATERIAL"
      footerRight={lock.hashType.toUpperCase()}
    >
      <div className="px-6 py-6 space-y-4">
        <div>
          <div className="mono-label text-muted-foreground mb-1.5">CODE HASH</div>
          <div className="font-mono text-xs break-all">{lock.codeHash}</div>
        </div>
        <div>
          <div className="mono-label text-muted-foreground mb-1.5">HASH TYPE</div>
          <div className="font-mono text-sm">{lock.hashType}</div>
        </div>
        <div>
          <div className="mono-label text-muted-foreground mb-1.5">ARGS</div>
          <div className="font-mono text-xs break-all">{lock.args}</div>
        </div>
      </div>
      <div className="px-6 pb-6">
        <div className="text-xs text-muted-foreground mb-3 max-w-[40ch]">
          Lock script rotation moves control of this DID to a new key
          without changing the identifier. The SDK already supports it via{" "}
          <span className="font-mono">buildUpdateTx</span> with a{" "}
          <span className="font-mono">newLock</span>; the UI for picking the
          target lock lands in a follow-up.
        </div>
        <div className="flex justify-end">
          <VButton variant="ghost" disabled>
            Rotate (next release)
          </VButton>
        </div>
      </div>
    </Manifest>
  );
}

const ACTION_COLOR: Record<HistoryEntry["action"], string> = {
  CREATE: "bg-verdant",
  UPDATE: "bg-ink",
  MIGRATE: "bg-cobalt",
};

const ACTION_BODY: Record<HistoryEntry["action"], string> = {
  CREATE: "Minted DID Metadata Cell",
  UPDATE: "Updated document",
  MIGRATE: "Migrated from did:plc",
};

function ActivityFeed({ record }: { record: DidRecord }) {
  const { client } = useCcc();
  const isMainnet = client instanceof ccc.ClientPublicMainnet;
  const networkLabel = isMainnet ? "mainnet" : "testnet";
  const {
    data: history,
    isLoading,
    error,
  } = useQuery({
    queryKey: [
      "did-history",
      record.args,
      record.cell.outPoint.txHash,
      networkLabel,
    ],
    queryFn: () => getDidHistory(client, record.args, record.cell),
  });

  if (isLoading) {
    return (
      <div className="border-t border-ink py-6 px-2 mono-caps text-muted-foreground">
        INDEXING TRANSACTION CHAIN…
      </div>
    );
  }

  if (error) {
    return (
      <div className="border-t border-ink py-6 px-2">
        <div className="mono-caps text-alarm mb-1">ERROR</div>
        <p className="text-sm font-mono break-all">
          {error instanceof Error ? error.message : String(error)}
        </p>
      </div>
    );
  }

  if (!history || history.length === 0) {
    return (
      <div className="border-t border-ink py-6 px-2 mono-caps text-muted-foreground">
        NO OPERATIONS FOUND
      </div>
    );
  }

  return (
    <>
      <div className="border-t border-ink">
        {history.map((entry, index) => (
          <ActivityEntry
            key={`${entry.txHash}-${entry.outputIndex}`}
            entry={entry}
            isLatest={index === 0}
            isMainnet={isMainnet}
          />
        ))}
      </div>
      {history.length === 50 && (
        <p className="text-xs text-muted-foreground mt-3">
          History walk capped at 50 operations.
        </p>
      )}
    </>
  );
}

function ActivityEntry({
  entry,
  isLatest,
  isMainnet,
}: {
  entry: HistoryEntry;
  isLatest: boolean;
  isMainnet: boolean;
}) {
  const explorerHref = explorerLinkForTx(entry.txHash, isMainnet);
  return (
    <div className="py-5 border-b border-hairline px-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-1">
        <span
          className={`inline-block w-2 h-2 ${ACTION_COLOR[entry.action]} ${
            isLatest ? "pulse-dot" : ""
          }`}
        />
        <span className="mono-caps">{entry.action}</span>
        <span className="font-mono text-xs text-muted-foreground">
          {entry.blockNumber
            ? `BLOCK ${entry.blockNumber.toString()}`
            : "PENDING"}
        </span>
        {isLatest && (
          <span className="mono-caps text-verdant text-[10px] tracking-[0.16em]">
            CURRENT
          </span>
        )}
      </div>
      <div className="flex flex-col md:flex-row md:items-baseline md:justify-between gap-2 pl-5">
        <div className="text-base break-words">
          {ACTION_BODY[entry.action]}
          <span className="text-muted-foreground">
            {" "}
            · capacity{" "}
            <span className="font-mono">
              {ccc.fixedPointToString(entry.capacity, 8)} CKB
            </span>
          </span>
        </div>
        {explorerHref ? (
          <a
            href={explorerHref}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-xs break-all text-cobalt hover:underline shrink-0"
          >
            {truncate(entry.txHash, 10, 8)} ↗
          </a>
        ) : (
          <span className="font-mono text-xs break-all text-muted-foreground">
            {truncate(entry.txHash, 10, 8)}
          </span>
        )}
      </div>
    </div>
  );
}

function explorerLinkForTx(txHash: ccc.Hex, isMainnet: boolean): string {
  const base = isMainnet
    ? "https://explorer.nervos.org/transaction/"
    : "https://pudge.explorer.nervos.org/transaction/";
  return `${base}${txHash}`;
}

function truncate(hex: string, head = 8, tail = 6): string {
  if (hex.length <= head + tail + 1) return hex;
  return `${hex.slice(0, head)}…${hex.slice(-tail)}`;
}
