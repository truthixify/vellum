import { ccc, useCcc } from "@ckb-ccc/connector-react";
import { useEffect, useState } from "react";

import { useCopy } from "@/hooks/use-copy";

function truncateAddress(address: string, head = 6, tail = 6): string {
  if (address.length <= head + tail + 1) return address;
  return `${address.slice(0, head)}…${address.slice(-tail)}`;
}

export function WalletButton() {
  const { open, disconnect, signerInfo, wallet, client } = useCcc();
  const [address, setAddress] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const { copied, copy } = useCopy();

  useEffect(() => {
    let cancelled = false;
    async function loadAddress() {
      if (!signerInfo) {
        setAddress(null);
        return;
      }
      try {
        const addr = await signerInfo.signer.getRecommendedAddress();
        if (!cancelled) setAddress(addr);
      } catch (err) {
        console.error("Failed to load wallet address", err);
        if (!cancelled) setAddress(null);
      }
    }
    loadAddress();
    return () => {
      cancelled = true;
    };
  }, [signerInfo]);

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

  const network = client instanceof ccc.ClientPublicMainnet ? "mainnet" : "testnet";

  return (
    <div className="relative">
      <button
        onClick={() => setMenuOpen((v) => !v)}
        className="mono-caps border border-ink px-3 py-2 hover:bg-ink hover:text-paper transition-colors flex items-center gap-2"
      >
        <span
          className="w-2 h-2 bg-verdant"
          aria-hidden
        />
        <span className="font-mono normal-case text-[13px] tracking-tight">
          {address ? truncateAddress(address) : "Loading…"}
        </span>
      </button>
      {menuOpen ? (
        <div className="absolute right-0 mt-2 min-w-[220px] bg-paper border-2 border-ink z-50">
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
