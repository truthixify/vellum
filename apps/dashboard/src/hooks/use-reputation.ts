import { useQuery } from "@tanstack/react-query";

import { fetchReputation } from "@/lib/reputation";

export function useReputation(did: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ["reputation", did],
    queryFn: () => fetchReputation(did!),
    enabled: enabled && !!did,
    staleTime: 60_000,
    retry: 1,
  });
}
