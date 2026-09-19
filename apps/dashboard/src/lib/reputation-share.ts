import { isDidCkb } from "@/lib/did-ckb";

export function buildReputationShareUrl(did: string, origin?: string): string {
  if (!isDidCkb(did)) throw new Error("A valid did:ckb identifier is required.");
  const base =
    origin ??
    (typeof window === "undefined" ? "https://dashboard.usevellum.xyz" : window.location.origin);
  const url = new URL("/reputation", base);
  url.searchParams.set("did", did);
  return url.toString();
}

export function reputationCardFilename(did: string): string {
  if (!isDidCkb(did)) throw new Error("A valid did:ckb identifier is required.");
  const suffix = did.split(":").at(-1)?.slice(-10) ?? "identity";
  return `vellum-reputation-${suffix}.png`;
}
