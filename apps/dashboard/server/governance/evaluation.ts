import { ccc } from "@ckb-ccc/core";
import { didToArgs, resolveDidCkb } from "@ckb-ccc/did-ckb";
import { GITHUB_CLAIM_SCHEMA_HASH, GITHUB_CLAIM_SCHEMA_ID } from "@vellum/schemas";
import {
  scoreReputation,
  VELLUM_REPUTATION_POLICY_V7,
  type ReputationResult,
  type ScoreReputationInput,
} from "@vellum/scoring";
import {
  checkPolicy,
  readClaims,
  type Claim,
  type ClaimPolicy,
  type ReadClaimsProps,
  type ReadClaimsResult,
} from "@usevellum/sdk";

import {
  GOVERNANCE_NETWORK,
  GOVERNANCE_PROPOSAL,
  governanceParticipationWeight,
  type GovernanceEvaluation,
  type GovernanceEvidenceReference,
} from "../../src/lib/governance-contracts.js";
import {
  InvalidReputationSubjectError,
  ReputationSubjectNotFoundError,
  validateReputationSubject,
} from "../reputation/service.js";
import { claimScripts, issuerMetadata, issuerRpcUrl } from "../verification/issuer.js";

type GovernanceEnvironment = {
  [key: string]: string | undefined;
  CKB_RPC_URL?: string;
};

type ClaimReader = (props: ReadClaimsProps) => Promise<ReadClaimsResult>;
type ReputationScorer = (input: ScoreReputationInput) => ReputationResult;

export type GovernanceEvaluationDependencies = {
  createClient: (rpcUrl: string) => ccc.Client;
  now: () => number;
  readClaims: ClaimReader;
  resolveDid: typeof resolveDidCkb;
  scoreClaims: ReputationScorer;
};

const defaultDependencies: GovernanceEvaluationDependencies = {
  createClient: (rpcUrl) =>
    new ccc.ClientPublicTestnet({ url: rpcUrl, fallbacks: [], timeout: 10_000 }),
  now: () => Math.floor(Date.now() / 1_000),
  readClaims,
  resolveDid: resolveDidCkb,
  scoreClaims: scoreReputation,
};

const githubGate = {
  mode: "all",
  requirements: [
    {
      issuerDid: GOVERNANCE_PROPOSAL.eligibilityPolicy.issuerDid,
      schemaHash: GOVERNANCE_PROPOSAL.eligibilityPolicy.schemaHash,
    },
  ],
} as const satisfies ClaimPolicy;

export { InvalidReputationSubjectError as InvalidGovernanceSubjectError };
export { ReputationSubjectNotFoundError as GovernanceSubjectNotFoundError };

export class GovernanceEvaluationUnavailableError extends Error {
  constructor() {
    super("Governance eligibility and weight could not be evaluated from complete Testnet state.");
    this.name = "GovernanceEvaluationUnavailableError";
  }
}

function assertPolicyConfiguration(): void {
  if (
    GOVERNANCE_PROPOSAL.eligibilityPolicy.issuerDid !== issuerMetadata.did ||
    GOVERNANCE_PROPOSAL.eligibilityPolicy.schemaId !== GITHUB_CLAIM_SCHEMA_ID ||
    GOVERNANCE_PROPOSAL.eligibilityPolicy.schemaHash !== GITHUB_CLAIM_SCHEMA_HASH ||
    GOVERNANCE_PROPOSAL.weightingPolicy.reputationPolicyVersion !==
      VELLUM_REPUTATION_POLICY_V7.version
  ) {
    throw new Error("The governance policy does not match the active Vellum policy registry.");
  }
}

function unavailableGate(result: ReadClaimsResult, eligible: boolean): boolean {
  if (eligible) return false;
  return (
    result.invalid.length > 0 ||
    result.claims.some(({ issuerState }) => issuerState.status === "unavailable")
  );
}

function isAcceptedEvidence(claim: Claim, evaluatedAt: number): boolean {
  const checkpoint = BigInt(evaluatedAt);
  return (
    claim.issuerDid === GOVERNANCE_PROPOSAL.eligibilityPolicy.issuerDid &&
    claim.issuerId === ccc.hexFrom(didToArgs(GOVERNANCE_PROPOSAL.eligibilityPolicy.issuerDid)) &&
    claim.schemaHash === GOVERNANCE_PROPOSAL.eligibilityPolicy.schemaHash &&
    claim.issuerState.status === "active" &&
    claim.verification.inclusion === "live" &&
    claim.verification.issuerAuthorization === "accepted-by-configured-claim-type" &&
    claim.verification.time.status === "active" &&
    claim.verification.time.evaluatedAt === checkpoint &&
    claim.issuedAt > 0n &&
    checkpoint >= claim.issuedAt &&
    (claim.expiresAt === undefined ||
      (claim.expiresAt > claim.issuedAt && checkpoint < claim.expiresAt))
  );
}

function evidenceReference(claim: Claim): GovernanceEvidenceReference {
  const outputIndex = Number(claim.cell.outPoint.index);
  const issuedAt = Number(claim.issuedAt);
  if (!Number.isSafeInteger(outputIndex) || !Number.isSafeInteger(issuedAt)) {
    throw new GovernanceEvaluationUnavailableError();
  }
  return {
    claimId: claim.claimId,
    transactionHash: claim.cell.outPoint.txHash,
    outputIndex,
    issuerDid: claim.issuerDid,
    schemaHash: claim.schemaHash,
    issuedAt,
  };
}

type GuardedRead = { status: "available"; value: ReadClaimsResult } | { status: "unavailable" };

function guardRead(task: Promise<ReadClaimsResult>): Promise<GuardedRead> {
  return task.then(
    (value) => ({ status: "available", value }) as const,
    () => ({ status: "unavailable" }) as const,
  );
}

export async function evaluateGovernanceSubject(
  subject: string,
  environment: GovernanceEnvironment = process.env,
  dependencies: GovernanceEvaluationDependencies = defaultDependencies,
): Promise<GovernanceEvaluation> {
  assertPolicyConfiguration();
  const subjectDid = validateReputationSubject(subject);
  const evaluatedAt = dependencies.now();
  if (!Number.isSafeInteger(evaluatedAt) || evaluatedAt <= 0) {
    throw new Error("The governance service clock is invalid.");
  }

  const client = dependencies.createClient(issuerRpcUrl(environment));
  const didTask = dependencies.resolveDid({ client, did: subjectDid });
  const gateTask = guardRead(
    dependencies.readClaims({
      client,
      scripts: claimScripts,
      filter: {
        subject: { did: subjectDid },
        issuerDid: githubGate.requirements[0].issuerDid,
        schemaHash: githubGate.requirements[0].schemaHash,
        evaluationTime: evaluatedAt,
        order: "asc",
      },
    }),
  );
  const reputationTask = guardRead(
    dependencies.readClaims({
      client,
      scripts: claimScripts,
      filter: {
        subject: { did: subjectDid },
        evaluationTime: evaluatedAt,
        order: "asc",
      },
    }),
  );

  let did;
  try {
    did = await didTask;
  } catch {
    throw new GovernanceEvaluationUnavailableError();
  }
  if (!did)
    throw new ReputationSubjectNotFoundError("The did:ckb identity is not active on Testnet.");

  const [gateRead, reputationRead] = await Promise.all([gateTask, reputationTask]);
  if (gateRead.status === "unavailable" || reputationRead.status === "unavailable") {
    throw new GovernanceEvaluationUnavailableError();
  }

  const eligible = checkPolicy(gateRead.value.claims, githubGate, BigInt(evaluatedAt));
  if (unavailableGate(gateRead.value, eligible)) {
    throw new GovernanceEvaluationUnavailableError();
  }

  const reputation = dependencies.scoreClaims({
    claims: reputationRead.value,
    evaluatedAt,
  });
  if (reputation.status === "unavailable") throw new GovernanceEvaluationUnavailableError();
  if (
    reputation.policyVersion !== GOVERNANCE_PROPOSAL.weightingPolicy.reputationPolicyVersion ||
    reputation.overall.maximum !== 1_000
  ) {
    throw new GovernanceEvaluationUnavailableError();
  }

  const acceptedClaims = eligible
    ? gateRead.value.claims.filter((claim) => isAcceptedEvidence(claim, evaluatedAt))
    : [];
  const newestAcceptedClaim = acceptedClaims.at(-1);
  const evidence = newestAcceptedClaim ? [evidenceReference(newestAcceptedClaim)] : [];
  if (eligible && evidence.length === 0) throw new GovernanceEvaluationUnavailableError();

  return {
    status: eligible ? "eligible" : "ineligible",
    network: GOVERNANCE_NETWORK,
    subjectDid,
    evaluatedAt,
    eligibilityPolicyVersion: GOVERNANCE_PROPOSAL.eligibilityPolicy.version,
    reputation: {
      policyVersion: reputation.policyVersion,
      score: reputation.overall.score,
      maximum: reputation.overall.maximum,
    },
    participationWeight: eligible ? governanceParticipationWeight(reputation.overall.score) : null,
    evidence,
  };
}
