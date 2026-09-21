import { ChartNoAxesColumnIncreasing } from "lucide-react";
import { Link, useRouterState } from "@tanstack/react-router";

import { useReputation } from "@/hooks/use-reputation";
import { useActiveIdentity } from "@/lib/active-identity-context";
import { isDidCkb } from "@/lib/did-ckb";

export function ReputationChip() {
  const { activeDid, network } = useActiveIdentity();
  const routeDid = useRouterState({
    select: (state) => {
      if (state.location.pathname !== "/reputation") return undefined;
      const value = (state.location.search as Record<string, unknown>).did;
      return typeof value === "string" && isDidCkb(value) ? value : undefined;
    },
  });
  const subject = routeDid ?? (network === "testnet" ? activeDid : undefined);
  const reputation = useReputation(subject, network === "testnet" || !!routeDid);

  let value = "—";
  let state = "empty";
  let label = "No active identity";

  if (network === "mainnet" && !routeDid) {
    label = "Reputation scoring is available on Testnet";
  } else if (subject && reputation.isLoading) {
    value = "···";
    state = "loading";
    label = "Loading reputation score";
  } else if (reputation.data?.status === "available") {
    value = String(reputation.data.overall.score);
    state = "available";
    label = `Reputation score ${value} out of ${reputation.data.overall.maximum}`;
  } else if (subject && (reputation.data?.status === "unavailable" || reputation.isError)) {
    state = "unavailable";
    label = "Reputation score unavailable";
  }

  return (
    <Link
      to="/reputation"
      search={subject ? { did: subject } : {}}
      className={`reputation-chip reputation-chip--${state}`}
      aria-label={label}
      title={label}
    >
      <ChartNoAxesColumnIncreasing size={14} strokeWidth={1.9} aria-hidden="true" />
      <span className="reputation-chip__label">Score</span>
      <strong>{value}</strong>
      {reputation.data?.status === "available" ? (
        <span className="reputation-chip__maximum">/{reputation.data.overall.maximum}</span>
      ) : null}
    </Link>
  );
}
