import { useCcc } from "@ckb-ccc/connector-react";
import { Check, ChevronDown, WalletCards } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useCopy } from "@/hooks/use-copy";
import { useActiveIdentity } from "@/lib/active-identity-context";
import type { DidRecord } from "@/lib/did-ckb";
import { Avatar } from "./Avatar";

function truncate(value: string, head = 6, tail = 6): string {
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

function initials(record: DidRecord | undefined, fallback: string): string {
  const source = record?.profile.displayName ?? fallback;
  return (
    source
      .replace(/[^a-zA-Z0-9]+/g, "")
      .slice(0, 2)
      .toUpperCase() || "??"
  );
}

export function WalletButton() {
  const { open, disconnect, signerInfo, wallet } = useCcc();
  const { address, activeIdentity, records, setActiveDid, network } = useActiveIdentity();
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const { copied, copy } = useCopy();

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(e: MouseEvent | TouchEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
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

  const primaryDid = activeIdentity;
  const displayName = primaryDid?.profile.displayName;
  const avatarUrl = primaryDid?.profile.avatar;
  const fallbackInitials = initials(primaryDid, address ?? "??");

  if (!signerInfo) {
    return (
      <button
        onClick={() => open()}
        className="dashboard-wallet dashboard-wallet--connect"
        aria-label="Connect wallet"
        title="Connect wallet"
      >
        <WalletCards size={14} strokeWidth={1.8} aria-hidden="true" />
        <span>Connect wallet</span>
      </button>
    );
  }

  return (
    <div className="dashboard-wallet-wrap" ref={wrapperRef}>
      <button
        onClick={() => setMenuOpen((v) => !v)}
        className="dashboard-wallet"
        aria-expanded={menuOpen}
        aria-haspopup="menu"
      >
        {primaryDid ? (
          <Avatar url={avatarUrl} fallback={fallbackInitials} size="xs" className="border-0" />
        ) : (
          <span className="dashboard-wallet__status" aria-hidden />
        )}
        <span className="dashboard-wallet__label">
          {displayName ?? (address ? truncate(address) : "Loading…")}
        </span>
        <ChevronDown size={13} strokeWidth={1.8} aria-hidden="true" />
      </button>
      {menuOpen ? (
        <div className="dashboard-wallet-menu" role="menu">
          {primaryDid ? (
            <div className="dashboard-wallet-menu__identity">
              <Avatar url={avatarUrl} fallback={fallbackInitials} size="sm" />
              <div>
                <div className="dashboard-wallet-menu__name">
                  {displayName ?? "(no display name)"}
                </div>
                <div className="dashboard-wallet-menu__did">{truncate(primaryDid.did, 14, 8)}</div>
              </div>
            </div>
          ) : null}
          {records.length > 1 ? (
            <div className="dashboard-wallet-menu__identities" role="group" aria-label="Active DID">
              <span className="dashboard-wallet-menu__eyebrow">Active identity</span>
              {records.map((record) => (
                <button
                  key={record.did}
                  type="button"
                  className="dashboard-wallet-menu__did-option"
                  onClick={() => {
                    setActiveDid(record.did);
                    setMenuOpen(false);
                  }}
                >
                  <span>{record.profile.displayName ?? truncate(record.did, 12, 6)}</span>
                  {record.did === primaryDid?.did ? (
                    <Check size={13} strokeWidth={2} aria-label="Selected" />
                  ) : null}
                </button>
              ))}
            </div>
          ) : null}
          <div className="dashboard-wallet-menu__fact">
            <span>Wallet</span>
            <strong>{wallet?.name ?? "Connected"}</strong>
          </div>
          <div className="dashboard-wallet-menu__fact">
            <span>Network</span>
            <strong className="mono">{network.toUpperCase()}</strong>
          </div>
          <button
            onClick={() => {
              if (address) void copy(address);
            }}
            disabled={!address}
            className="dashboard-wallet-menu__action"
          >
            {copied ? "Address copied" : "Copy address"}
          </button>
          <button
            onClick={() => {
              setMenuOpen(false);
              open();
            }}
            className="dashboard-wallet-menu__action"
          >
            Switch wallet
          </button>
          <button
            onClick={() => {
              setMenuOpen(false);
              disconnect();
            }}
            className="dashboard-wallet-menu__action dashboard-wallet-menu__action--danger"
          >
            Disconnect
          </button>
        </div>
      ) : null}
    </div>
  );
}
