import { ccc } from "@ckb-ccc/core";
import { isDidCkb, resolveDidCkb } from "@ckb-ccc/did-ckb";
import { extractProfile, type DidDocument, type VellumProfile } from "@vellum/schemas";
import { readClaims, type ReadClaimsResult } from "@usevellum/sdk";

import { siteClaimScripts } from "./claim-scripts";
import {
  fetchPublicReputation,
  type PublicReputationResponse,
  ReputationRequestError,
} from "./reputation";

type ResolvedDid = NonNullable<Awaited<ReturnType<typeof resolveDidCkb>>>;

export type PublicIdentity = {
  did: string;
  document: DidDocument;
  profile: VellumProfile;
};

export type ProfileSection<T> =
  | { status: "loading" }
  | { status: "available"; value: T }
  | { status: "unavailable"; message: string };

export type PublicProfileUpdate =
  | { section: "identity"; value: PublicProfileResult }
  | { section: "claims"; value: ProfileSection<ReadClaimsResult> }
  | { section: "reputation"; value: ProfileSection<PublicReputationResponse> };

export type PublicProfileResult =
  | { status: "invalid" }
  | { status: "not-found" }
  | { status: "unavailable"; message: string }
  | {
      status: "available";
      identity: PublicIdentity;
      claims: ProfileSection<ReadClaimsResult>;
      reputation: ProfileSection<PublicReputationResponse>;
    };

export type PublicProfileDependencies = {
  createClient: () => ccc.Client;
  resolveDid: typeof resolveDidCkb;
  readClaims: typeof readClaims;
  fetchReputation: typeof fetchPublicReputation;
};

const defaultDependencies: PublicProfileDependencies = {
  createClient: () => new ccc.ClientPublicTestnet(),
  resolveDid: resolveDidCkb,
  readClaims,
  fetchReputation: fetchPublicReputation,
};

function identityFrom(record: ResolvedDid): PublicIdentity {
  if (record.data.type !== "v1") {
    throw new Error("The DID document version is not supported.");
  }
  const document = record.data.value.document as DidDocument;
  return { did: record.did, document, profile: extractProfile(document) };
}

export async function loadPublicProfile(
  did: string,
  dependencies: Partial<PublicProfileDependencies> = {},
  onUpdate?: (update: PublicProfileUpdate) => void,
): Promise<PublicProfileResult> {
  if (!isDidCkb(did)) {
    const result = { status: "invalid" } as const;
    onUpdate?.({ section: "identity", value: result });
    return result;
  }

  const resolvedDependencies = { ...defaultDependencies, ...dependencies };
  let client: ccc.Client;
  try {
    client = resolvedDependencies.createClient();
  } catch {
    const result = {
      status: "unavailable",
      message: "Vellum could not start the CKB Testnet client.",
    } as const;
    onUpdate?.({ section: "identity", value: result });
    return result;
  }

  const identityTask = resolvedDependencies.resolveDid({ client, did }).then(
    (record): PublicProfileResult => {
      if (!record) return { status: "not-found" };
      try {
        return {
          status: "available",
          identity: identityFrom(record),
          claims: { status: "loading" },
          reputation: { status: "loading" },
        };
      } catch {
        return {
          status: "unavailable",
          message: "This identity uses a DID document version Vellum cannot display.",
        };
      }
    },
    (): PublicProfileResult => ({
      status: "unavailable",
      message: "Vellum could not resolve this identity on CKB Testnet.",
    }),
  );
  const claimsTask = resolvedDependencies
    .readClaims({
      client,
      scripts: siteClaimScripts,
      filter: { subject: { did }, order: "desc" },
    })
    .then<ProfileSection<ReadClaimsResult>, ProfileSection<ReadClaimsResult>>(
      (value) => ({ status: "available", value }),
      () => ({
        status: "unavailable",
        message: "Vellum could not read this identity's complete Claim Cell ledger.",
      }),
    );
  const reputationTask = resolvedDependencies
    .fetchReputation(did)
    .then<ProfileSection<PublicReputationResponse>, ProfileSection<PublicReputationResponse>>(
      (value) => ({ status: "available", value }),
      (reason) => ({
        status: "unavailable",
        message:
          reason instanceof ReputationRequestError
            ? reason.message
            : "Vellum could not load this identity's reputation result.",
      }),
    );

  void identityTask.then((value) => onUpdate?.({ section: "identity", value }));
  void claimsTask.then((value) => onUpdate?.({ section: "claims", value }));
  void reputationTask.then((value) => onUpdate?.({ section: "reputation", value }));

  const [identityResult, claimsResult, reputationResult] = await Promise.all([
    identityTask,
    claimsTask,
    reputationTask,
  ]);
  if (identityResult.status !== "available") return identityResult;

  return {
    status: "available",
    identity: identityResult.identity,
    claims: claimsResult,
    reputation: reputationResult,
  };
}
