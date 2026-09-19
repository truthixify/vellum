import { ccc, useCcc } from "@ckb-ccc/connector-react";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import {
  ActiveIdentityContext,
  type ActiveIdentityContextValue,
  type VellumNetwork,
} from "@/lib/active-identity-context";
import { chooseActiveDid } from "@/lib/active-identity-selection";
import { listDidsByLock, type DidRecord } from "@/lib/did-ckb";

const EMPTY_DID_RECORDS: DidRecord[] = [];

function storageKey(network: VellumNetwork, lock: ccc.Script): string {
  return `vellum:active-did:${network}:${lock.codeHash}:${lock.hashType}:${lock.args}`;
}

export function ActiveIdentityProvider({ children }: { children: ReactNode }) {
  const { client, signerInfo } = useCcc();
  const [address, setAddress] = useState<string | null>(null);
  const [lock, setLock] = useState<ccc.Script | null>(null);
  const [selectedDid, setSelectedDidState] = useState<string | null>(null);
  const network: VellumNetwork = client instanceof ccc.ClientPublicMainnet ? "mainnet" : "testnet";

  useEffect(() => {
    let cancelled = false;

    async function loadWalletIdentity() {
      setAddress(null);
      setLock(null);
      setSelectedDidState(null);

      if (!signerInfo) {
        return;
      }

      try {
        const addressObject = await signerInfo.signer.getRecommendedAddressObj();
        if (cancelled) return;
        setAddress(addressObject.toString());
        setLock(addressObject.script);
      } catch (error) {
        console.error("Failed to load wallet address", error);
        if (!cancelled) {
          setAddress(null);
          setLock(null);
          setSelectedDidState(null);
        }
      }
    }

    void loadWalletIdentity();
    return () => {
      cancelled = true;
    };
  }, [signerInfo]);

  const key = lock ? storageKey(network, lock) : null;
  const identities = useQuery({
    queryKey: ["my-dids", lock?.codeHash, lock?.hashType, lock?.args, network],
    queryFn: async () => {
      if (!lock) return [] as DidRecord[];
      return listDidsByLock(client, lock);
    },
    enabled: !!lock,
  });

  const records = identities.data ?? EMPTY_DID_RECORDS;

  useEffect(() => {
    if (!key || identities.isLoading) return;

    let storedDid: string | null = null;
    try {
      storedDid = window.localStorage.getItem(key);
    } catch {
      // Selection still works when storage is unavailable.
    }

    setSelectedDidState((current) => chooseActiveDid(records, current, storedDid));
  }, [identities.isLoading, key, records]);

  const setActiveDid = useCallback(
    (did: string) => {
      if (!records.some((record) => record.did === did)) return;
      setSelectedDidState(did);
      if (!key) return;
      try {
        window.localStorage.setItem(key, did);
      } catch {
        // The in-memory selection remains authoritative for this session.
      }
    },
    [key, records],
  );

  const activeIdentity = records.find((record) => record.did === selectedDid) ?? records[0];
  const value = useMemo<ActiveIdentityContextValue>(
    () => ({
      records,
      activeIdentity,
      activeDid: activeIdentity?.did,
      setActiveDid,
      address,
      network,
      isConnected: !!signerInfo,
      isLoading: identities.isLoading || (!!signerInfo && !lock),
      error: identities.error instanceof Error ? identities.error : null,
      refetch: identities.refetch,
    }),
    [
      records,
      activeIdentity,
      setActiveDid,
      address,
      network,
      signerInfo,
      identities.isLoading,
      identities.error,
      identities.refetch,
      lock,
    ],
  );

  return <ActiveIdentityContext.Provider value={value}>{children}</ActiveIdentityContext.Provider>;
}
