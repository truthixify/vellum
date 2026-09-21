import {
  parseDiscordClaimPayload,
  parseDiscordCommunityClaimPayload,
  parseGithubClaimPayload,
  type DiscordClaimPayload,
  type DiscordCommunityClaimPayload,
  type GithubClaimPayload,
} from "@vellum/schemas";
import type { Claim, ClaimReadFailure } from "@vellum/sdk";

import { VELLUM_REPUTATION_POLICY_V2 } from "./policy.js";
import type {
  AvailableReputationResult,
  ReputationAccount,
  ReputationAgeBand,
  ReputationClaimReference,
  ReputationContribution,
  ReputationEvidence,
  ReputationExcludedEvidence,
  ReputationPolicyV2,
  ReputationRecencyBand,
  ReputationResult,
  ScoreReputationInput,
} from "./types.js";

type GithubCandidate = {
  claim: Claim;
  payload: GithubClaimPayload;
};

type DiscordIdentityCandidate = {
  claim: Claim;
  payload: DiscordClaimPayload;
};

type DiscordCommunityCandidate = {
  claim: Claim;
  payload: DiscordCommunityClaimPayload;
};

type MutableEvidence = Omit<ReputationEvidence, "contributions"> & {
  contributions: ReputationContribution[];
};

type IdentityScoreCandidate = {
  evidence: MutableEvidence;
  accountAge: number;
  verificationAge: number;
  tenurePoints: number;
  recencyPoints: number;
  tenureRuleId: string;
  recencyRuleId: string;
};

function validateEvaluationTime(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError("evaluatedAt must be a non-negative safe integer");
  }
  return value;
}

function validateIssuerDids(values: readonly string[], platform: string): void {
  if (
    values.length === 0 ||
    values.some((did) => !did.startsWith("did:ckb:")) ||
    new Set(values).size !== values.length
  ) {
    throw new TypeError(`The reputation policy must contain unique trusted ${platform} issuers`);
  }
}

function validateAgeBands(bands: readonly ReputationAgeBand[], maximum: number): boolean {
  return (
    bands.length > 0 &&
    bands.every(
      (band, index) =>
        Number.isSafeInteger(band.minimumAgeSeconds) &&
        band.minimumAgeSeconds >= 0 &&
        Number.isSafeInteger(band.points) &&
        band.points >= 0 &&
        band.points <= maximum &&
        (index === 0 || bands[index - 1].minimumAgeSeconds > band.minimumAgeSeconds),
    ) &&
    bands.at(-1)?.minimumAgeSeconds === 0
  );
}

function validateRecencyBands(bands: readonly ReputationRecencyBand[], maximum: number): boolean {
  return (
    bands.length > 0 &&
    bands.every(
      (band, index) =>
        Number.isSafeInteger(band.maximumAgeSecondsExclusive) &&
        band.maximumAgeSecondsExclusive > 0 &&
        Number.isSafeInteger(band.points) &&
        band.points >= 0 &&
        band.points <= maximum &&
        (index === 0 ||
          bands[index - 1].maximumAgeSecondsExclusive < band.maximumAgeSecondsExclusive),
    )
  );
}

function validateSchema(schema: { id: string; hash: string }, name: string): void {
  if (!schema.id || !/^0x[0-9a-f]{64}$/.test(schema.hash)) {
    throw new TypeError(`The reputation policy ${name} schema is invalid`);
  }
}

function validatePolicy(policy: ReputationPolicyV2): void {
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

  validateIssuerDids(policy.github.issuerDids, "GitHub");
  validateIssuerDids(policy.discord.issuerDids, "Discord");
  validateSchema(policy.github.schema, "GitHub");
  validateSchema(policy.discord.identitySchema, "Discord identity");
  validateSchema(policy.discord.communitySchema, "Discord community");
  if (
    !validateAgeBands(policy.identity.tenureBands, categoryCaps.get("tenure")!) ||
    !validateRecencyBands(policy.identity.recencyBands, categoryCaps.get("recency")!) ||
    !validateAgeBands(policy.discord.communityBands, categoryCaps.get("community")!) ||
    !Number.isSafeInteger(policy.discord.communityTtlSeconds) ||
    policy.discord.communityTtlSeconds <= 0
  ) {
    throw new TypeError("The reputation policy score bands are invalid");
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

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareClaims(left: Claim, right: Claim): number {
  return compareText(left.claimId, right.claimId) || compareText(claimKey(left), claimKey(right));
}

function compareNewest<T extends { claim: Claim }>(left: T, right: T): number {
  if (left.claim.issuedAt !== right.claim.issuedAt) {
    return left.claim.issuedAt > right.claim.issuedAt ? -1 : 1;
  }
  return compareText(left.claim.claimId, right.claim.claimId);
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
    compareText(referenceKey(left.claim), referenceKey(right.claim)) ||
    compareText(left.reason, right.reason)
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
    matches.sort((left, right) => compareText(claimKey(left), claimKey(right)));
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

function scoreAge(ageSeconds: number, bands: readonly ReputationAgeBand[]): number {
  return bands.find((band) => ageSeconds >= band.minimumAgeSeconds)?.points ?? 0;
}

function scoreRecency(ageSeconds: number, bands: readonly ReputationRecencyBand[]): number {
  return bands.find((band) => ageSeconds < band.maximumAgeSecondsExclusive)?.points ?? 0;
}

function emptyCategories(policy: ReputationPolicyV2): AvailableReputationResult["categories"] {
  return policy.categories.map((category) => ({ ...category, score: 0 }));
}

function selectAccount<T extends { claim: Claim }>(
  candidates: T[],
  userId: (candidate: T) => string,
  platform: string,
  excluded: ReputationExcludedEvidence[],
): T | undefined {
  candidates.sort(compareNewest);
  const newestByUser = new Map<string, T>();
  const accounts: T[] = [];
  for (const candidate of candidates) {
    const id = userId(candidate);
    if (newestByUser.has(id)) {
      excluded.push(
        exclusion(
          candidate.claim,
          "superseded",
          `A newer claim for this ${platform} account is available.`,
        ),
      );
      continue;
    }
    newestByUser.set(id, candidate);
    accounts.push(candidate);
  }
  accounts.sort(compareNewest);
  const selected = accounts.shift();
  for (const candidate of accounts) {
    excluded.push(
      exclusion(
        candidate.claim,
        "additional-account",
        `Only the newest verified ${platform} account contributes to this policy.`,
      ),
    );
  }
  return selected;
}

function unavailableResult(
  evaluatedAt: number,
  claim: Claim,
): Extract<ReputationResult, { status: "unavailable" }> {
  return {
    status: "unavailable",
    policyVersion: VELLUM_REPUTATION_POLICY_V2.version,
    evaluatedAt,
    error: {
      code: "issuer-state-unavailable",
      message: "The trusted issuer state could not be resolved completely.",
      claim: claimReference(claim),
    },
  };
}

function accountFromGithub(payload: GithubClaimPayload): ReputationAccount {
  return {
    platform: "github",
    id: payload.user_id,
    handle: payload.login,
    profileUrl: payload.profile_url,
    createdAt: payload.account_created_at,
    verifiedAt: payload.verified_at,
  };
}

function accountFromDiscord(payload: DiscordClaimPayload): ReputationAccount {
  return {
    platform: "discord",
    id: payload.user_id,
    handle: payload.username,
    profileUrl: payload.profile_url,
    createdAt: payload.account_created_at,
    verifiedAt: payload.verified_at,
  };
}

function identityScoreCandidate(
  evidence: MutableEvidence,
  evaluatedAt: number,
  tenureRuleId: string,
  recencyRuleId: string,
  policy: ReputationPolicyV2,
): IdentityScoreCandidate {
  const accountAge = evaluatedAt - evidence.account.createdAt;
  const verificationAge = evaluatedAt - evidence.account.verifiedAt;
  return {
    evidence,
    accountAge,
    verificationAge,
    tenurePoints: scoreAge(accountAge, policy.identity.tenureBands),
    recencyPoints: scoreRecency(verificationAge, policy.identity.recencyBands),
    tenureRuleId,
    recencyRuleId,
  };
}

function compareTenure(left: IdentityScoreCandidate, right: IdentityScoreCandidate): number {
  return (
    right.tenurePoints - left.tenurePoints ||
    right.accountAge - left.accountAge ||
    compareText(left.evidence.account.platform, right.evidence.account.platform) ||
    compareText(referenceKey(left.evidence.claim), referenceKey(right.evidence.claim))
  );
}

function compareRecency(left: IdentityScoreCandidate, right: IdentityScoreCandidate): number {
  return (
    right.recencyPoints - left.recencyPoints ||
    left.verificationAge - right.verificationAge ||
    compareText(left.evidence.account.platform, right.evidence.account.platform) ||
    compareText(referenceKey(left.evidence.claim), referenceKey(right.evidence.claim))
  );
}

export function scoreReputation(input: ScoreReputationInput): ReputationResult {
  const policy = VELLUM_REPUTATION_POLICY_V2;
  const evaluatedAt = validateEvaluationTime(input.evaluatedAt);
  validatePolicy(policy);

  const excluded: ReputationExcludedEvidence[] = input.claims.invalid.map((failure) => ({
    claim: invalidReference(failure),
    reason: "invalid-claim",
    message: failure.message,
  }));
  const githubCandidates: GithubCandidate[] = [];
  const discordIdentityCandidates: DiscordIdentityCandidate[] = [];
  const discordCommunityCandidates: DiscordCommunityCandidate[] = [];

  for (const claim of canonicalClaims(input.claims.claims, excluded)) {
    const kind =
      claim.schemaHash === policy.github.schema.hash
        ? "github"
        : claim.schemaHash === policy.discord.identitySchema.hash
          ? "discord-identity"
          : claim.schemaHash === policy.discord.communitySchema.hash
            ? "discord-community"
            : undefined;
    if (!kind) {
      excluded.push(
        exclusion(claim, "unsupported-schema", "The claim schema is not scored by this policy."),
      );
      continue;
    }

    const trustedIssuers = kind === "github" ? policy.github.issuerDids : policy.discord.issuerDids;
    if (!(trustedIssuers as readonly string[]).includes(claim.issuerDid)) {
      excluded.push(
        exclusion(claim, "untrusted-issuer", "The claim issuer is not trusted by this policy."),
      );
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

    let payload: GithubClaimPayload | DiscordClaimPayload | DiscordCommunityClaimPayload;
    try {
      payload =
        kind === "github"
          ? parseGithubClaimPayload(claim.payload)
          : kind === "discord-identity"
            ? parseDiscordClaimPayload(claim.payload)
            : parseDiscordCommunityClaimPayload(claim.payload);
    } catch {
      excluded.push(exclusion(claim, "malformed-payload", "The claim payload is malformed."));
      continue;
    }
    if (BigInt(payload.verified_at) !== claim.issuedAt) {
      excluded.push(
        exclusion(
          claim,
          "timestamp-mismatch",
          "The verification time does not match the claim issuance time.",
        ),
      );
      continue;
    }
    if (
      kind === "discord-community" &&
      (claim.expiresAt === undefined ||
        claim.expiresAt !== claim.issuedAt + BigInt(policy.discord.communityTtlSeconds))
    ) {
      excluded.push(
        exclusion(
          claim,
          "malformed-payload",
          "Discord community evidence does not use the required validity period.",
        ),
      );
      continue;
    }
    if (claim.issuerState.status === "unavailable") {
      return unavailableResult(evaluatedAt, claim);
    }
    if (claim.issuerState.status !== "active") {
      const reason = `issuer-${claim.issuerState.status}` as const;
      excluded.push(exclusion(claim, reason, `The claim issuer is ${claim.issuerState.status}.`));
      continue;
    }

    if (kind === "github") {
      githubCandidates.push({ claim, payload: payload as GithubClaimPayload });
    } else if (kind === "discord-identity") {
      discordIdentityCandidates.push({ claim, payload: payload as DiscordClaimPayload });
    } else {
      discordCommunityCandidates.push({
        claim,
        payload: payload as DiscordCommunityClaimPayload,
      });
    }
  }

  const github = selectAccount(
    githubCandidates,
    (candidate) => String(candidate.payload.user_id),
    "GitHub",
    excluded,
  );
  const discord = selectAccount(
    discordIdentityCandidates,
    (candidate) => candidate.payload.user_id,
    "Discord",
    excluded,
  );

  discordCommunityCandidates.sort(compareNewest);
  const newestCommunityByUser = new Map<string, DiscordCommunityCandidate>();
  for (const candidate of discordCommunityCandidates) {
    if (newestCommunityByUser.has(candidate.payload.user_id)) {
      excluded.push(
        exclusion(
          candidate.claim,
          "superseded",
          "A newer Discord community claim for this account is available.",
        ),
      );
      continue;
    }
    newestCommunityByUser.set(candidate.payload.user_id, candidate);
  }

  let discordCommunity: DiscordCommunityCandidate | undefined;
  for (const candidate of newestCommunityByUser.values()) {
    if (!discord) {
      excluded.push(
        exclusion(
          candidate.claim,
          "identity-missing",
          "An active Discord identity claim is required for community evidence.",
        ),
      );
    } else if (candidate.payload.user_id === discord.payload.user_id) {
      discordCommunity = candidate;
    } else {
      excluded.push(
        exclusion(
          candidate.claim,
          "additional-account",
          "The community claim belongs to a different Discord account.",
        ),
      );
    }
  }

  const categories = emptyCategories(policy);
  const evidence: MutableEvidence[] = [];
  const identityScores: IdentityScoreCandidate[] = [];

  if (github) {
    const githubEvidence: MutableEvidence = {
      claim: claimReference(github.claim),
      issuerDid: github.claim.issuerDid,
      schemaId: policy.github.schema.id,
      schemaHash: github.claim.schemaHash,
      issuedAt: Number(github.claim.issuedAt),
      account: accountFromGithub(github.payload),
      contributions: [],
    };
    evidence.push(githubEvidence);
    identityScores.push(
      identityScoreCandidate(
        githubEvidence,
        evaluatedAt,
        policy.github.tenureRuleId,
        policy.github.recencyRuleId,
        policy,
      ),
    );
  }

  let discordEvidence: MutableEvidence | undefined;
  if (discord) {
    discordEvidence = {
      claim: claimReference(discord.claim),
      issuerDid: discord.claim.issuerDid,
      schemaId: policy.discord.identitySchema.id,
      schemaHash: discord.claim.schemaHash,
      issuedAt: Number(discord.claim.issuedAt),
      account: accountFromDiscord(discord.payload),
      contributions: [],
    };
    evidence.push(discordEvidence);
    identityScores.push(
      identityScoreCandidate(
        discordEvidence,
        evaluatedAt,
        policy.discord.tenureRuleId,
        policy.discord.recencyRuleId,
        policy,
      ),
    );
  }

  const tenureWinner = [...identityScores].sort(compareTenure)[0];
  const recencyWinner = [...identityScores].sort(compareRecency)[0];
  if (tenureWinner) {
    const contribution = {
      category: "tenure",
      points: tenureWinner.tenurePoints,
      ruleId: tenureWinner.tenureRuleId,
    } as const;
    tenureWinner.evidence.contributions.push(contribution);
    categories.find((category) => category.id === "tenure")!.score = contribution.points;
  }
  if (recencyWinner) {
    const contribution = {
      category: "recency",
      points: recencyWinner.recencyPoints,
      ruleId: recencyWinner.recencyRuleId,
    } as const;
    recencyWinner.evidence.contributions.push(contribution);
    categories.find((category) => category.id === "recency")!.score = contribution.points;
  }

  if (discord && discordEvidence && discordCommunity) {
    const oldestJoin = Math.min(
      ...discordCommunity.payload.memberships.map((membership) => membership.joined_at),
    );
    const communityPoints = scoreAge(evaluatedAt - oldestJoin, policy.discord.communityBands);
    const communityEvidence: MutableEvidence = {
      claim: claimReference(discordCommunity.claim),
      supportingClaims: [claimReference(discord.claim)],
      issuerDid: discordCommunity.claim.issuerDid,
      schemaId: policy.discord.communitySchema.id,
      schemaHash: discordCommunity.claim.schemaHash,
      issuedAt: Number(discordCommunity.claim.issuedAt),
      account: accountFromDiscord(discord.payload),
      community: { memberships: discordCommunity.payload.memberships },
      contributions: [
        {
          category: "community",
          points: communityPoints,
          ruleId: policy.discord.communityRuleId,
        },
      ],
    };
    evidence.push(communityEvidence);
    categories.find((category) => category.id === "community")!.score = communityPoints;
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
