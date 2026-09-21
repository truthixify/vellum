import { useQuery } from "@tanstack/react-query";

import { fetchReputation } from "@/lib/reputation";

export function reputationQueryKey(did: string | undefined) {
  return ["reputation", "ckb_testnet", did] as const;
}

export function useReputation(did: string | undefined, enabled = true) {
  const active = enabled && !!did;

  return useQuery({
    queryKey: [...reputationQueryKey(did), active ? "active" : "disabled"],
    queryFn: () => fetchReputation(did!),
    enabled: active,
    retry: 1,
  });
}
