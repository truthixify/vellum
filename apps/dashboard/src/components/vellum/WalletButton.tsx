import { ccc, useCcc } from "@ckb-ccc/connector-react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { listDidsByLock, type DidRecord } from "@ckb-ccc/identity";
import { useCopy } from "@/hooks/use-copy";
import { Avatar } from "./Avatar";

function truncate(value: string, head = 6, tail = 6): string {
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

function initials(record: DidRecord | undefined, fallback: string): string {
  const source = record?.profile.displayName ?? fallback;
  return source.replace(/[^a-zA-Z0-9]+/g, "").slice(0, 2).toUpperCase() || "??";
}

export function WalletButton() {
  const { open, disconnect, signerInfo, wallet, client } = useCcc();
  const [address, setAddress] = useState<string | null>(null);
  const [lock, setLock] = useState<ccc.Script | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const { copied, copy } = useCopy();

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(e: MouseEvent | TouchEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setMenuOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!signerInfo) {
        setAddress(null);
        setLock(null);
        return;
      }
      try {
        const addrObj = await signerInfo.signer.getRecommendedAddressObj();
        if (cancelled) return;
        setAddress(addrObj.toString());
        setLock(addrObj.script);
      } catch (err) {
        console.error("Failed to load wallet address", err);
        if (!cancelled) {
          setAddress(null);
          setLock(null);
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [signerInfo]);

  const network = client instanceof ccc.ClientPublicMainnet ? "mainnet" : "testnet";

  // Shares the cache with /my; same query key so navigating between pages
  // doesn't refetch when the wallet hasn't changed.
  const { data: dids } = useQuery({
    queryKey: ["my-dids", lock?.codeHash, lock?.hashType, lock?.args, network],
    queryFn: async () => {
      if (!lock) return [] as DidRecord[];
      return listDidsByLock(client, lock);
    },
    enabled: !!lock,
  });

  const primaryDid = dids && dids.length > 0 ? dids[0] : undefined;
  const displayName = primaryDid?.profile.displayName;
  const avatarUrl = primaryDid?.profile.avatar;
  const fallbackInitials = initials(primaryDid, address ?? "??");

  if (!signerInfo) {
    return (
      <button
        onClick={() => open()}
        className="mono-caps bg-verdant text-paper px-4 py-2 hover:bg-[var(--verdant-hover)] active:bg-[var(--verdant-press)] transition-colors"
      >
        Connect wallet
      </button>
    );
  }

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        onClick={() => setMenuOpen((v) => !v)}
        className="border border-ink h-10 px-3 flex items-center gap-2 hover:bg-ink hover:text-paper transition-colors"
      >
        {primaryDid ? (
          <Avatar
            url={avatarUrl}
            fallback={fallbackInitials}
            size="xs"
            className="border-0"
          />
        ) : (
          <span className="w-2 h-2 bg-verdant" aria-hidden />
        )}
        <span className="font-mono normal-case text-[13px] tracking-tight max-w-[14ch] truncate">
          {displayName ?? (address ? truncate(address) : "Loading…")}
        </span>
      </button>
      {menuOpen ? (
        <div className="absolute right-0 mt-2 min-w-[260px] bg-paper border-2 border-ink z-50">
          {primaryDid ? (
            <div className="px-4 py-3 border-b border-hairline flex items-center gap-3">
              <Avatar
                url={avatarUrl}
                fallback={fallbackInitials}
                size="sm"
              />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">
                  {displayName ?? "(no display name)"}
                </div>
                <div className="font-mono text-xs text-muted-foreground truncate">
                  {truncate(primaryDid.did, 14, 8)}
                </div>
              </div>
            </div>
          ) : null}
          <div className="px-4 py-3 border-b border-hairline">
            <div className="mono-caps text-muted-foreground">Wallet</div>
            <div className="text-sm font-medium">{wallet?.name ?? "Connected"}</div>
          </div>
          <div className="px-4 py-3 border-b border-hairline">
            <div className="mono-caps text-muted-foreground">Network</div>
            <div className="text-sm font-mono">{network.toUpperCase()}</div>
          </div>
          <button
            onClick={() => {
              if (address) void copy(address);
            }}
            disabled={!address}
            className="w-full text-left px-4 py-3 mono-caps hover:bg-ink hover:text-paper transition-colors border-b border-hairline"
          >
            {copied ? "Address copied" : "Copy address"}
          </button>
          <button
            onClick={() => {
              setMenuOpen(false);
              open();
            }}
            className="w-full text-left px-4 py-3 mono-caps hover:bg-ink hover:text-paper transition-colors border-b border-hairline"
          >
            Switch wallet
          </button>
          <button
            onClick={() => {
              setMenuOpen(false);
              disconnect();
            }}
            className="w-full text-left px-4 py-3 mono-caps text-alarm hover:bg-alarm hover:text-paper transition-colors"
          >
            Disconnect
          </button>
        </div>
      ) : null}
    </div>
  );
}
