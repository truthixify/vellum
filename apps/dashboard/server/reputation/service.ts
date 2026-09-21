import { ccc } from "@ckb-ccc/core";
import { argsToDid, didToArgs, resolveDidCkb } from "@ckb-ccc/did-ckb";
import {
  scoreReputation,
  VELLUM_REPUTATION_POLICY_V2,
  type ReputationResult,
} from "@vellum/scoring";
import { readClaims, type ReadClaimsProps, type ReadClaimsResult } from "@vellum/sdk";

import { claimScripts, issuerMetadata, issuerRpcUrl } from "../verification/issuer.js";

export class InvalidReputationSubjectError extends Error {}
export class ReputationSubjectNotFoundError extends Error {}

const REPUTATION_RPC_TIMEOUT_MS = 10_000;

type ReputationEnvironment = {
  [key: string]: string | undefined;
  CKB_RPC_URL?: string;
};

type ReputationReader = (props: ReadClaimsProps) => Promise<ReadClaimsResult>;

export type ReputationServiceDependencies = {
  createClient: (rpcUrl: string) => ccc.Client;
  now: () => number;
  readClaims: ReputationReader;
  resolveDid: (props: { client: ccc.Client; did: string }) => Promise<unknown | null>;
};

const defaultDependencies: ReputationServiceDependencies = {
  createClient: (rpcUrl) =>
    new ccc.ClientPublicTestnet({
      url: rpcUrl,
      fallbacks: [],
      timeout: REPUTATION_RPC_TIMEOUT_MS,
    }),
  now: () => Math.floor(Date.now() / 1_000),
  readClaims,
  resolveDid: resolveDidCkb,
};

function unavailable(evaluatedAt: number): ReputationResult {
  return {
    status: "unavailable",
    policyVersion: VELLUM_REPUTATION_POLICY_V2.version,
    evaluatedAt,
    error: {
      code: "claim-read-unavailable",
      message: "The complete Testnet claim record could not be read.",
    },
  };
}

export function validateReputationSubject(value: string): string {
  try {
    const args = didToArgs(value);
    if (ccc.bytesFrom(args).length !== 20 || argsToDid(args) !== value) throw new Error();
    return value;
  } catch {
    throw new InvalidReputationSubjectError("Use a canonical did:ckb identifier.");
  }
}

export async function scoreSubjectReputation(
  subject: string,
  environment: ReputationEnvironment = process.env,
  dependencies: ReputationServiceDependencies = defaultDependencies,
): Promise<ReputationResult> {
  const subjectDid = validateReputationSubject(subject);
  const evaluatedAt = dependencies.now();
  if (!Number.isSafeInteger(evaluatedAt) || evaluatedAt < 0) {
    throw new Error("The reputation service clock is invalid.");
  }
  if (
    !VELLUM_REPUTATION_POLICY_V2.github.issuerDids.includes(issuerMetadata.did) ||
    !VELLUM_REPUTATION_POLICY_V2.discord.issuerDids.includes(issuerMetadata.did)
  ) {
    throw new Error("The configured issuer is not part of the active reputation policy.");
  }

  try {
    const client = dependencies.createClient(issuerRpcUrl(environment));
    const did = await dependencies.resolveDid({ client, did: subjectDid });
    if (!did) {
      throw new ReputationSubjectNotFoundError("The did:ckb identity is not active on Testnet.");
    }

    const claims = await dependencies.readClaims({
      client,
      scripts: claimScripts,
      filter: {
        subject: { did: subjectDid },
        evaluationTime: evaluatedAt,
        order: "asc",
      },
    });
    return scoreReputation({ claims, evaluatedAt });
  } catch (error) {
    if (error instanceof ReputationSubjectNotFoundError) throw error;
    return unavailable(evaluatedAt);
  }
}
