import { ccc } from "@ckb-ccc/core";
import { argsToDid, didToArgs } from "@ckb-ccc/did-ckb";

import { MAX_UINT64, requireByteLength } from "./protocol.js";
import type { Claim, ClaimPolicy, ClaimPolicyRequirement } from "./types.js";

type NormalizedRequirement = {
  issuerDid: string;
  issuerId: ccc.Hex;
  schemaHash: ccc.Hex;
};

function normalizeEvaluationTime(value: ccc.NumLike): ccc.Num {
  if (typeof value === "number" && !Number.isSafeInteger(value)) {
    throw new Error("evaluationTime numbers must be safe integers; use bigint for larger values");
  }

  const evaluationTime = ccc.numFrom(value);
  if (evaluationTime < 0n || evaluationTime > MAX_UINT64) {
    throw new Error("evaluationTime must fit in an unsigned 64-bit integer");
  }
  return evaluationTime;
}

function normalizeRequirement(
  requirement: ClaimPolicyRequirement,
  index: number,
): NormalizedRequirement {
  const issuerId = requireByteLength(
    didToArgs(requirement.issuerDid),
    20,
    `requirements[${index}].issuerDid`,
  );
  return {
    issuerDid: argsToDid(issuerId),
    issuerId,
    schemaHash: requireByteLength(requirement.schemaHash, 32, `requirements[${index}].schemaHash`),
  };
}

function normalizePolicy(policy: ClaimPolicy): readonly NormalizedRequirement[] {
  if (policy.requirements.length === 0) {
    throw new Error("A claim policy must contain at least one requirement");
  }

  const requirements = policy.requirements.map(normalizeRequirement);
  const seen = new Set<string>();
  for (const requirement of requirements) {
    const key = `${requirement.issuerId}:${requirement.schemaHash}`;
    if (seen.has(key)) {
      throw new Error("A claim policy cannot contain duplicate issuer-and-schema requirements");
    }
    seen.add(key);
  }

  if (
    policy.mode === "threshold" &&
    (!Number.isSafeInteger(policy.threshold) ||
      policy.threshold < 1 ||
      policy.threshold > requirements.length)
  ) {
    throw new Error("threshold must be an integer between 1 and the requirement count");
  }
  if (policy.mode !== "any" && policy.mode !== "all" && policy.mode !== "threshold") {
    throw new Error(`Unsupported claim policy mode: ${String(policy.mode)}`);
  }

  return requirements;
}

function matchesRequirement(
  claim: Claim,
  requirement: NormalizedRequirement,
  evaluationTime: ccc.Num,
): boolean {
  const time = claim.verification.time;
  if (
    claim.verification.inclusion !== "live" ||
    claim.verification.issuerAuthorization !== "accepted-by-configured-claim-type" ||
    claim.issuerState.status !== "active" ||
    time.status !== "active" ||
    time.evaluatedAt !== evaluationTime
  ) {
    return false;
  }
  if (
    claim.issuedAt === 0n ||
    evaluationTime < claim.issuedAt ||
    (claim.expiresAt !== undefined &&
      (claim.expiresAt <= claim.issuedAt || evaluationTime >= claim.expiresAt))
  ) {
    return false;
  }

  return (
    claim.issuerDid === requirement.issuerDid &&
    claim.issuerId === requirement.issuerId &&
    claim.schemaHash === requirement.schemaHash
  );
}

/**
 * Evaluates exact issuer-and-schema requirements over live claims at one explicit checkpoint.
 *
 * The helper performs no I/O and fails closed for inactive issuer state, unevaluated or inactive
 * timestamps, and claims evaluated at a different checkpoint.
 */
export function checkPolicy(
  claims: readonly Claim[],
  policy: ClaimPolicy,
  evaluationTime: ccc.NumLike,
): boolean {
  const checkpoint = normalizeEvaluationTime(evaluationTime);
  const requirements = normalizePolicy(policy);
  const matched = requirements.filter((requirement) =>
    claims.some((claim) => matchesRequirement(claim, requirement, checkpoint)),
  ).length;

  switch (policy.mode) {
    case "any":
      return matched > 0;
    case "all":
      return matched === requirements.length;
    case "threshold":
      return matched >= policy.threshold;
  }
}
