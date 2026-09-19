import { createContext, useContext } from "react";

import type { DidRecord } from "@/lib/did-ckb";

export type VellumNetwork = "testnet" | "mainnet";

export type ActiveIdentityContextValue = {
  records: DidRecord[];
  activeIdentity: DidRecord | undefined;
  activeDid: string | undefined;
  setActiveDid: (did: string) => void;
  address: string | null;
  network: VellumNetwork;
  isConnected: boolean;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<unknown>;
};

export const ActiveIdentityContext = createContext<ActiveIdentityContextValue | null>(null);

export function useActiveIdentity(): ActiveIdentityContextValue {
  const value = useContext(ActiveIdentityContext);
  if (!value) throw new Error("useActiveIdentity must be used inside ActiveIdentityProvider");
  return value;
}
