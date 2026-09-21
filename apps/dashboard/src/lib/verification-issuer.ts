import { ccc } from "@ckb-ccc/core";
import { didToArgs } from "@ckb-ccc/did-ckb";

export type PublicIssuerMetadata = {
  did: string;
  network: "ckb_testnet";
  payer: "issuer";
  submission: "service";
};

type FetchImplementation = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function isDidCkb(value: string): boolean {
  try {
    return value.startsWith("did:ckb:") && ccc.bytesFrom(didToArgs(value)).length === 20;
  } catch {
    return false;
  }
}

export async function fetchPublicIssuerMetadata(
  fetchImplementation: FetchImplementation = globalThis.fetch,
): Promise<PublicIssuerMetadata> {
  const response = await fetchImplementation("/api/issuer", {
    method: "GET",
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error("Issuer metadata is unavailable");

  const body = record(await response.json());
  const issuer = body && record(body.issuer);
  const did = issuer && typeof issuer.did === "string" ? issuer.did : undefined;
  if (
    !body ||
    body.ok !== true ||
    body.version !== "1" ||
    !issuer ||
    !did ||
    !isDidCkb(did) ||
    issuer.network !== "ckb_testnet" ||
    issuer.payer !== "issuer" ||
    issuer.submission !== "service"
  ) {
    throw new Error("Issuer metadata is invalid");
  }
  return { did, network: "ckb_testnet", payer: "issuer", submission: "service" };
}
