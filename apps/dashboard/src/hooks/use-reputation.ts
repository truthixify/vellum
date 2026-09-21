import { useQuery } from "@tanstack/react-query";

import { fetchReputation } from "@/lib/reputation";

export function useReputation(did: string | undefined, enabled = true) {
  const active = enabled && !!did;

  return useQuery({
    queryKey: ["reputation", "ckb_testnet", did, active ? "active" : "disabled"],
    queryFn: () => fetchReputation(did!),
    enabled: active,
    staleTime: 60_000,
    retry: 1,
  });
}
