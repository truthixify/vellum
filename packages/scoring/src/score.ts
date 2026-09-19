import { parseGithubClaimPayload, type GithubClaimPayload } from "@vellum/schemas";
import type { Claim, ClaimReadFailure } from "@vellum/sdk";

import { VELLUM_REPUTATION_POLICY_V1 } from "./policy.js";
import type {
  AvailableReputationResult,
  ReputationClaimReference,
  ReputationEvidence,
  ReputationExcludedEvidence,
  ReputationPolicy,
  ReputationResult,
  ScoreReputationInput,
} from "./types.js";

type GithubCandidate = {
  claim: Claim;
  payload: GithubClaimPayload;
};

function validateEvaluationTime(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError("evaluatedAt must be a non-negative safe integer");
  }
  return value;
}

function validatePolicy(policy: ReputationPolicy): void {
  if (!policy.version || !Number.isSafeInteger(policy.maximum) || policy.maximum < 0) {
    throw new TypeError("The reputation policy score range is invalid");
  }
  const ids = new Set<string>();
  const categoryCaps = new Map<string, number>();
  let maximum = 0;
  for (const category of policy.categories) {
    if (ids.has(category.id) || !Number.isSafeInteger(category.maximum) || category.maximum < 0) {
      throw new TypeError("The reputation policy contains an invalid category");
    }
    ids.add(category.id);
    categoryCaps.set(category.id, category.maximum);
    maximum += category.maximum;
  }
  if (
    ids.size !== 5 ||
    !["technical", "contribution", "community", "tenure", "recency"].every((id) => ids.has(id)) ||
    maximum !== policy.maximum ||
    policy.minimum !== 0
  ) {
    throw new TypeError("The reputation policy category caps do not match its score range");
  }
  if (
    policy.github.issuerDids.length === 0 ||
    policy.github.issuerDids.some((did) => !did.startsWith("did:ckb:")) ||
    new Set(policy.github.issuerDids).size !== policy.github.issuerDids.length
  ) {
    throw new TypeError("The reputation policy must contain unique trusted GitHub issuers");
  }
  if (!policy.github.schema.id || !/^0x[0-9a-f]{64}$/.test(policy.github.schema.hash)) {
    throw new TypeError("The reputation policy GitHub schema is invalid");
  }

  const tenureCap = categoryCaps.get("tenure")!;
  const validTenureBands = policy.github.tenureBands.every(
    (band, index, bands) =>
      Number.isSafeInteger(band.minimumAgeSeconds) &&
      band.minimumAgeSeconds >= 0 &&
      Number.isSafeInteger(band.points) &&
      band.points >= 0 &&
      band.points <= tenureCap &&
      (index === 0 || bands[index - 1].minimumAgeSeconds > band.minimumAgeSeconds),
  );
  if (
    policy.github.tenureBands.length === 0 ||
    !validTenureBands ||
    policy.github.tenureBands.at(-1)?.minimumAgeSeconds !== 0
  ) {
    throw new TypeError("The reputation policy GitHub tenure bands are invalid");
  }

  const recencyCap = categoryCaps.get("recency")!;
  const validRecencyBands = policy.github.recencyBands.every(
    (band, index, bands) =>
      Number.isSafeInteger(band.maximumAgeSecondsExclusive) &&
      band.maximumAgeSecondsExclusive > 0 &&
      Number.isSafeInteger(band.points) &&
      band.points >= 0 &&
      band.points <= recencyCap &&
      (index === 0 ||
        bands[index - 1].maximumAgeSecondsExclusive < band.maximumAgeSecondsExclusive),
  );
  if (policy.github.recencyBands.length === 0 || !validRecencyBands) {
    throw new TypeError("The reputation policy GitHub recency bands are invalid");
  }
}

function outputIndex(value: bigint): number {
  const index = Number(value);
  if (!Number.isSafeInteger(index) || index < 0) {
    throw new TypeError("Claim output index is not a non-negative safe integer");
  }
  return index;
}

function claimReference(
  claim: Pick<Claim, "claimId" | "cell">,
  cell: Claim["cell"] = claim.cell,
): ReputationClaimReference {
  return {
    claimId: claim.claimId,
    transactionHash: cell.outPoint.txHash,
    outputIndex: outputIndex(cell.outPoint.index),
  };
}

function invalidReference(failure: ClaimReadFailure): ReputationClaimReference {
  return {
    transactionHash: failure.cell.outPoint.txHash,
    outputIndex: outputIndex(failure.cell.outPoint.index),
  };
}

function referenceKey(reference: ReputationClaimReference): string {
  return `${reference.transactionHash}:${reference.outputIndex.toString().padStart(10, "0")}`;
}

function claimKey(claim: Claim): string {
  return referenceKey(claimReference(claim));
}

function compareClaims(left: Claim, right: Claim): number {
  return left.claimId.localeCompare(right.claimId) || claimKey(left).localeCompare(claimKey(right));
}

function compareNewest(left: GithubCandidate, right: GithubCandidate): number {
  if (left.claim.issuedAt !== right.claim.issuedAt) {
    return left.claim.issuedAt > right.claim.issuedAt ? -1 : 1;
  }
  return left.claim.claimId.localeCompare(right.claim.claimId);
}

function exclusion(
  claim: Claim,
  reason: ReputationExcludedEvidence["reason"],
  message: string,
  cell: Claim["cell"] = claim.cell,
): ReputationExcludedEvidence {
  return {
    claim: claimReference(claim, cell),
    issuerDid: claim.issuerDid,
    schemaHash: claim.schemaHash,
    reason,
    message,
  };
}

function compareExclusions(
  left: ReputationExcludedEvidence,
  right: ReputationExcludedEvidence,
): number {
  return (
    referenceKey(left.claim).localeCompare(referenceKey(right.claim)) ||
    left.reason.localeCompare(right.reason)
  );
}

function canonicalClaims(
  claims: readonly Claim[],
  excluded: ReputationExcludedEvidence[],
): Claim[] {
  const grouped = new Map<string, Claim[]>();
  for (const claim of [...claims].sort(compareClaims)) {
    const matches = grouped.get(claim.claimId) ?? [];
    matches.push(claim);
    grouped.set(claim.claimId, matches);
  }

  const canonical: Claim[] = [];
  for (const matches of grouped.values()) {
    matches.sort((left, right) => claimKey(left).localeCompare(claimKey(right)));
    const [selected, ...duplicates] = matches;
    canonical.push(selected);

    const seenCells = new Set([claimKey(selected)]);
    for (const duplicate of duplicates) {
      const key = claimKey(duplicate);
      if (!seenCells.has(key)) {
        excluded.push(
          exclusion(duplicate, "duplicate-claim", "An identical claim ID was already counted."),
        );
        seenCells.add(key);
      }
    }
    for (const match of matches) {
      for (const duplicateCell of match.duplicateCells) {
        const reference = claimReference(match, duplicateCell);
        const key = referenceKey(reference);
        if (!seenCells.has(key)) {
          excluded.push({
            claim: reference,
            issuerDid: match.issuerDid,
            schemaHash: match.schemaHash,
            reason: "duplicate-claim",
            message: "An identical claim ID was already counted.",
          });
          seenCells.add(key);
        }
      }
    }
  }
  return canonical.sort(compareClaims);
}

function scoreTenure(accountAgeSeconds: number, policy: ReputationPolicy): number {
  return (
    policy.github.tenureBands.find((band) => accountAgeSeconds >= band.minimumAgeSeconds)?.points ??
    0
  );
}

function scoreRecency(verificationAgeSeconds: number, policy: ReputationPolicy): number {
  return (
    policy.github.recencyBands.find(
      (band) => verificationAgeSeconds < band.maximumAgeSecondsExclusive,
    )?.points ?? 0
  );
}

function emptyCategories(policy: ReputationPolicy): AvailableReputationResult["categories"] {
  return policy.categories.map((category) => ({ ...category, score: 0 }));
}

export function scoreReputation(input: ScoreReputationInput): ReputationResult {
  const policy = VELLUM_REPUTATION_POLICY_V1;
  const evaluatedAt = validateEvaluationTime(input.evaluatedAt);
  validatePolicy(policy);

  const excluded: ReputationExcludedEvidence[] = input.claims.invalid.map((failure) => ({
    claim: invalidReference(failure),
    reason: "invalid-claim",
    message: failure.message,
  }));
  const trustedIssuers = new Set<string>(policy.github.issuerDids);
  const candidates: GithubCandidate[] = [];

  for (const claim of canonicalClaims(input.claims.claims, excluded)) {
    if (!trustedIssuers.has(claim.issuerDid)) {
      excluded.push(
        exclusion(claim, "untrusted-issuer", "The claim issuer is not trusted by this policy."),
      );
      continue;
    }
    if (claim.schemaHash !== policy.github.schema.hash) {
      excluded.push(
        exclusion(claim, "unsupported-schema", "The claim schema is not scored by this policy."),
      );
      continue;
    }
    if (claim.issuerState.status === "unavailable") {
      return {
        status: "unavailable",
        policyVersion: policy.version,
        evaluatedAt,
        error: {
          code: "issuer-state-unavailable",
          message: "The trusted issuer state could not be resolved completely.",
          claim: claimReference(claim),
        },
      };
    }
    if (claim.issuerState.status !== "active") {
      const reason = `issuer-${claim.issuerState.status}` as const;
      excluded.push(exclusion(claim, reason, `The claim issuer is ${claim.issuerState.status}.`));
      continue;
    }
    if (claim.issuedAt > BigInt(evaluatedAt)) {
      excluded.push(
        exclusion(claim, "not-yet-active", "The claim was issued after the evaluation time."),
      );
      continue;
    }
    if (claim.expiresAt !== undefined && BigInt(evaluatedAt) >= claim.expiresAt) {
      excluded.push(exclusion(claim, "expired", "The claim had expired at the evaluation time."));
      continue;
    }

    let payload: GithubClaimPayload;
    try {
      payload = parseGithubClaimPayload(claim.payload);
    } catch {
      excluded.push(
        exclusion(claim, "malformed-payload", "The GitHub claim payload is malformed."),
      );
      continue;
    }
    if (BigInt(payload.verified_at) !== claim.issuedAt) {
      excluded.push(
        exclusion(
          claim,
          "timestamp-mismatch",
          "The GitHub verification time does not match the claim issuance time.",
        ),
      );
      continue;
    }
    candidates.push({ claim, payload });
  }

  candidates.sort(compareNewest);
  const newestByUser = new Map<number, GithubCandidate>();
  const accountCandidates: GithubCandidate[] = [];
  for (const candidate of candidates) {
    if (newestByUser.has(candidate.payload.user_id)) {
      excluded.push(
        exclusion(
          candidate.claim,
          "superseded",
          "A newer claim for this GitHub account is available.",
        ),
      );
      continue;
    }
    newestByUser.set(candidate.payload.user_id, candidate);
    accountCandidates.push(candidate);
  }

  accountCandidates.sort(compareNewest);
  const selected = accountCandidates.shift();
  for (const candidate of accountCandidates) {
    excluded.push(
      exclusion(
        candidate.claim,
        "additional-account",
        "Only the newest verified GitHub account contributes to this policy.",
      ),
    );
  }

  const categories = emptyCategories(policy);
  const evidence: ReputationEvidence[] = [];
  if (selected) {
    const accountAge = evaluatedAt - selected.payload.account_created_at;
    const verificationAge = evaluatedAt - selected.payload.verified_at;
    const tenure = scoreTenure(accountAge, policy);
    const recency = scoreRecency(verificationAge, policy);

    for (const category of categories) {
      if (category.id === "tenure") category.score = tenure;
      if (category.id === "recency") category.score = recency;
    }
    evidence.push({
      claim: claimReference(selected.claim),
      issuerDid: selected.claim.issuerDid,
      schemaId: policy.github.schema.id,
      schemaHash: selected.claim.schemaHash,
      issuedAt: Number(selected.claim.issuedAt),
      account: {
        platform: "github",
        id: selected.payload.user_id,
        handle: selected.payload.login,
        profileUrl: selected.payload.profile_url,
        createdAt: selected.payload.account_created_at,
        verifiedAt: selected.payload.verified_at,
      },
      contributions: [
        { category: "tenure", points: tenure, ruleId: policy.github.tenureRuleId },
        { category: "recency", points: recency, ruleId: policy.github.recencyRuleId },
      ],
    });
  }

  return {
    status: "available",
    policyVersion: policy.version,
    evaluatedAt,
    overall: {
      score: categories.reduce((total, category) => total + category.score, 0),
      maximum: policy.maximum,
    },
    categories,
    evidence,
    excludedEvidence: excluded.sort(compareExclusions),
  };
}
