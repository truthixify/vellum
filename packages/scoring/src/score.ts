import {
  parseBlueskyClaimPayload,
  parseDiscordClaimPayload,
  parseDiscordCommunityClaimPayload,
  parseGithubClaimPayload,
  parseGithubContributionClaimPayload,
  parseTelegramClaimPayload,
  parseTelegramCommunityClaimPayload,
  type DiscordClaimPayload,
  type DiscordCommunityClaimPayload,
  type GithubClaimPayload,
  type GithubContributionClaimPayload,
  type TelegramClaimPayload,
  type TelegramCommunityClaimPayload,
  type BlueskyClaimPayload,
} from "@vellum/schemas";
import type { Claim, ClaimReadFailure } from "@usevellum/sdk";

import { VELLUM_REPUTATION_POLICY_V5 } from "./policy.js";
import type {
  AvailableReputationResult,
  ReputationAccount,
  ReputationAgeBand,
  ReputationClaimReference,
  ReputationContribution,
  ReputationEvidence,
  ReputationExcludedEvidence,
  ReputationPolicyV5,
  ReputationRecencyBand,
  ReputationResult,
  ScoreReputationInput,
} from "./types.js";

type GithubCandidate = {
  claim: Claim;
  payload: GithubClaimPayload;
};

type GithubContributionCandidate = {
  claim: Claim;
  payload: GithubContributionClaimPayload;
};

type DiscordIdentityCandidate = {
  claim: Claim;
  payload: DiscordClaimPayload;
};

type DiscordCommunityCandidate = {
  claim: Claim;
  payload: DiscordCommunityClaimPayload;
};

type TelegramCandidate = {
  claim: Claim;
  payload: TelegramClaimPayload;
};

type TelegramCommunityCandidate = {
  claim: Claim;
  payload: TelegramCommunityClaimPayload;
};

type BlueskyCandidate = {
  claim: Claim;
  payload: BlueskyClaimPayload;
};

type MutableEvidence = Omit<ReputationEvidence, "contributions"> & {
  contributions: ReputationContribution[];
};

type IdentityScoreCandidate = {
  evidence: MutableEvidence;
  accountAge?: number;
  verificationAge: number;
  tenurePoints?: number;
  recencyPoints: number;
  tenureRuleId?: string;
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

function validatePolicy(policy: ReputationPolicyV5): void {
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
  validateIssuerDids(policy.telegram.issuerDids, "Telegram");
  validateIssuerDids(policy.bluesky.issuerDids, "Bluesky");
  validateSchema(policy.github.identitySchema, "GitHub identity");
  validateSchema(policy.github.contributionSchema, "GitHub contribution");
  validateSchema(policy.discord.identitySchema, "Discord identity");
  validateSchema(policy.discord.communitySchema, "Discord community");
  validateSchema(policy.telegram.identitySchema, "Telegram identity");
  validateSchema(policy.telegram.communitySchema, "Telegram community");
  validateSchema(policy.bluesky.identitySchema, "Bluesky identity");
  if (
    !validateAgeBands(policy.identity.tenureBands, categoryCaps.get("tenure")!) ||
    !validateRecencyBands(policy.identity.recencyBands, categoryCaps.get("recency")!) ||
    !validateAgeBands(policy.discord.communityBands, categoryCaps.get("community")!) ||
    !Number.isSafeInteger(policy.github.contributionTtlSeconds) ||
    policy.github.contributionTtlSeconds <= 0 ||
    !Number.isSafeInteger(policy.github.contributionWindowSeconds) ||
    policy.github.contributionWindowSeconds <= 0 ||
    !Number.isSafeInteger(policy.discord.communityTtlSeconds) ||
    policy.discord.communityTtlSeconds <= 0 ||
    !Number.isSafeInteger(policy.telegram.communityTtlSeconds) ||
    policy.telegram.communityTtlSeconds <= 0 ||
    !Number.isSafeInteger(policy.telegram.communityPoints) ||
    policy.telegram.communityPoints <= 0 ||
    policy.telegram.communityPoints > categoryCaps.get("community")!
  ) {
    throw new TypeError("The reputation policy score bands are invalid");
  }
  const githubRules = new Set<string>();
  for (const rule of policy.github.artifactRules) {
    const key = `${rule.kind}:${rule.classification}`;
    if (
      githubRules.has(key) ||
      !Number.isSafeInteger(rule.technicalPoints) ||
      rule.technicalPoints < 0 ||
      rule.technicalPoints > categoryCaps.get("technical")! ||
      !Number.isSafeInteger(rule.contributionPoints) ||
      rule.contributionPoints < 0 ||
      rule.contributionPoints > categoryCaps.get("contribution")! ||
      (rule.technicalPoints > 0 && !rule.technicalRuleId) ||
      !rule.contributionRuleId
    ) {
      throw new TypeError("The reputation policy GitHub artifact rules are invalid");
    }
    githubRules.add(key);
  }
  if (githubRules.size !== 4) {
    throw new TypeError("The reputation policy GitHub artifact rules are incomplete");
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

function emptyCategories(policy: ReputationPolicyV5): AvailableReputationResult["categories"] {
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
    policyVersion: VELLUM_REPUTATION_POLICY_V5.version,
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

function accountFromTelegram(payload: TelegramClaimPayload): ReputationAccount {
  return {
    platform: "telegram",
    id: payload.user_id,
    displayName: payload.display_name,
    handle: payload.username,
    profileUrl: payload.profile_url,
    verifiedAt: payload.verified_at,
  };
}

function accountFromBluesky(payload: BlueskyClaimPayload): ReputationAccount {
  return {
    platform: "bluesky",
    id: payload.did,
    handle: payload.handle,
    profileUrl: payload.profile_url,
    verifiedAt: payload.verified_at,
  };
}

function identityScoreCandidate(
  evidence: MutableEvidence,
  evaluatedAt: number,
  tenureRuleId: string | undefined,
  recencyRuleId: string,
  policy: ReputationPolicyV5,
): IdentityScoreCandidate {
  const accountAge =
    "createdAt" in evidence.account ? evaluatedAt - evidence.account.createdAt : undefined;
  const verificationAge = evaluatedAt - evidence.account.verifiedAt;
  return {
    evidence,
    accountAge,
    verificationAge,
    tenurePoints:
      accountAge === undefined || tenureRuleId === undefined
        ? undefined
        : scoreAge(accountAge, policy.identity.tenureBands),
    recencyPoints: scoreRecency(verificationAge, policy.identity.recencyBands),
    tenureRuleId,
    recencyRuleId,
  };
}

function compareTenure(left: IdentityScoreCandidate, right: IdentityScoreCandidate): number {
  return (
    right.tenurePoints! - left.tenurePoints! ||
    right.accountAge! - left.accountAge! ||
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
  const policy = VELLUM_REPUTATION_POLICY_V5;
  const evaluatedAt = validateEvaluationTime(input.evaluatedAt);
  validatePolicy(policy);

  const excluded: ReputationExcludedEvidence[] = input.claims.invalid.map((failure) => ({
    claim: invalidReference(failure),
    reason: "invalid-claim",
    message: failure.message,
  }));
  const githubCandidates: GithubCandidate[] = [];
  const githubContributionCandidates: GithubContributionCandidate[] = [];
  const discordIdentityCandidates: DiscordIdentityCandidate[] = [];
  const discordCommunityCandidates: DiscordCommunityCandidate[] = [];
  const telegramCandidates: TelegramCandidate[] = [];
  const telegramCommunityCandidates: TelegramCommunityCandidate[] = [];
  const blueskyCandidates: BlueskyCandidate[] = [];

  for (const claim of canonicalClaims(input.claims.claims, excluded)) {
    const kind =
      claim.schemaHash === policy.github.identitySchema.hash
        ? "github-identity"
        : claim.schemaHash === policy.github.contributionSchema.hash
          ? "github-contribution"
          : claim.schemaHash === policy.discord.identitySchema.hash
            ? "discord-identity"
            : claim.schemaHash === policy.discord.communitySchema.hash
              ? "discord-community"
              : claim.schemaHash === policy.telegram.identitySchema.hash
                ? "telegram-identity"
                : claim.schemaHash === policy.telegram.communitySchema.hash
                  ? "telegram-community"
                  : claim.schemaHash === policy.bluesky.identitySchema.hash
                    ? "bluesky-identity"
                    : undefined;
    if (!kind) {
      excluded.push(
        exclusion(claim, "unsupported-schema", "The claim schema is not scored by this policy."),
      );
      continue;
    }

    const trustedIssuers = kind.startsWith("github")
      ? policy.github.issuerDids
      : kind.startsWith("discord")
        ? policy.discord.issuerDids
        : kind.startsWith("telegram")
          ? policy.telegram.issuerDids
          : policy.bluesky.issuerDids;
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

    let payload:
      | GithubClaimPayload
      | GithubContributionClaimPayload
      | DiscordClaimPayload
      | DiscordCommunityClaimPayload
      | TelegramClaimPayload
      | TelegramCommunityClaimPayload
      | BlueskyClaimPayload;
    try {
      payload =
        kind === "github-identity"
          ? parseGithubClaimPayload(claim.payload)
          : kind === "github-contribution"
            ? parseGithubContributionClaimPayload(claim.payload)
            : kind === "discord-identity"
              ? parseDiscordClaimPayload(claim.payload)
              : kind === "discord-community"
                ? parseDiscordCommunityClaimPayload(claim.payload)
                : kind === "telegram-identity"
                  ? parseTelegramClaimPayload(claim.payload)
                  : kind === "telegram-community"
                    ? parseTelegramCommunityClaimPayload(claim.payload)
                    : parseBlueskyClaimPayload(claim.payload);
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
      (kind === "github-contribution" &&
        (claim.expiresAt === undefined ||
          claim.expiresAt !== claim.issuedAt + BigInt(policy.github.contributionTtlSeconds))) ||
      (kind === "discord-community" &&
        (claim.expiresAt === undefined ||
          claim.expiresAt !== claim.issuedAt + BigInt(policy.discord.communityTtlSeconds))) ||
      (kind === "telegram-community" &&
        (claim.expiresAt === undefined ||
          claim.expiresAt !== claim.issuedAt + BigInt(policy.telegram.communityTtlSeconds)))
    ) {
      excluded.push(
        exclusion(
          claim,
          "malformed-payload",
          `${kind === "github-contribution" ? "GitHub contribution" : kind === "discord-community" ? "Discord community" : "Telegram community"} evidence does not use the required validity period.`,
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

    if (kind === "github-identity") {
      githubCandidates.push({ claim, payload: payload as GithubClaimPayload });
    } else if (kind === "github-contribution") {
      githubContributionCandidates.push({
        claim,
        payload: payload as GithubContributionClaimPayload,
      });
    } else if (kind === "discord-identity") {
      discordIdentityCandidates.push({ claim, payload: payload as DiscordClaimPayload });
    } else if (kind === "discord-community") {
      discordCommunityCandidates.push({
        claim,
        payload: payload as DiscordCommunityClaimPayload,
      });
    } else if (kind === "telegram-identity") {
      telegramCandidates.push({ claim, payload: payload as TelegramClaimPayload });
    } else if (kind === "telegram-community") {
      telegramCommunityCandidates.push({
        claim,
        payload: payload as TelegramCommunityClaimPayload,
      });
    } else {
      blueskyCandidates.push({ claim, payload: payload as BlueskyClaimPayload });
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
  const telegram = selectAccount(
    telegramCandidates,
    (candidate) => candidate.payload.user_id,
    "Telegram",
    excluded,
  );
  const bluesky = selectAccount(
    blueskyCandidates,
    (candidate) => candidate.payload.did,
    "Bluesky",
    excluded,
  );

  githubContributionCandidates.sort(compareNewest);
  const newestGithubContributionByUser = new Map<number, GithubContributionCandidate>();
  for (const candidate of githubContributionCandidates) {
    if (newestGithubContributionByUser.has(candidate.payload.user_id)) {
      excluded.push(
        exclusion(
          candidate.claim,
          "superseded",
          "A newer GitHub contribution claim for this account is available.",
        ),
      );
      continue;
    }
    newestGithubContributionByUser.set(candidate.payload.user_id, candidate);
  }

  let githubContribution: GithubContributionCandidate | undefined;
  for (const candidate of newestGithubContributionByUser.values()) {
    if (!github) {
      excluded.push(
        exclusion(
          candidate.claim,
          "identity-missing",
          "An active GitHub identity claim is required for contribution evidence.",
        ),
      );
    } else if (candidate.payload.user_id === github.payload.user_id) {
      githubContribution = candidate;
    } else {
      excluded.push(
        exclusion(
          candidate.claim,
          "additional-account",
          "The contribution claim belongs to a different GitHub account.",
        ),
      );
    }
  }

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

  telegramCommunityCandidates.sort(compareNewest);
  const newestTelegramCommunityByUser = new Map<string, TelegramCommunityCandidate>();
  for (const candidate of telegramCommunityCandidates) {
    if (newestTelegramCommunityByUser.has(candidate.payload.user_id)) {
      excluded.push(
        exclusion(
          candidate.claim,
          "superseded",
          "A newer Telegram community claim for this account is available.",
        ),
      );
      continue;
    }
    newestTelegramCommunityByUser.set(candidate.payload.user_id, candidate);
  }

  let telegramCommunity: TelegramCommunityCandidate | undefined;
  for (const candidate of newestTelegramCommunityByUser.values()) {
    if (!telegram) {
      excluded.push(
        exclusion(
          candidate.claim,
          "identity-missing",
          "An active Telegram identity claim is required for community evidence.",
        ),
      );
    } else if (candidate.payload.user_id === telegram.payload.user_id) {
      telegramCommunity = candidate;
    } else {
      excluded.push(
        exclusion(
          candidate.claim,
          "additional-account",
          "The community claim belongs to a different Telegram account.",
        ),
      );
    }
  }

  const categories = emptyCategories(policy);
  const evidence: MutableEvidence[] = [];
  const identityScores: IdentityScoreCandidate[] = [];

  let githubEvidence: MutableEvidence | undefined;
  if (github) {
    githubEvidence = {
      claim: claimReference(github.claim),
      issuerDid: github.claim.issuerDid,
      schemaId: policy.github.identitySchema.id,
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

  if (github && githubEvidence && githubContribution) {
    const aggregateContributions = new Map<string, ReputationContribution>();
    const scoredArtifacts = githubContribution.payload.artifacts.map((artifact) => {
      const rule = policy.github.artifactRules.find(
        (candidate) =>
          candidate.kind === artifact.kind && candidate.classification === artifact.classification,
      )!;
      const artifactContributions: ReputationContribution[] = [];
      for (const entry of [
        {
          category: "technical" as const,
          requested: rule.technicalPoints,
          ruleId: "technicalRuleId" in rule ? rule.technicalRuleId : undefined,
        },
        {
          category: "contribution" as const,
          requested: rule.contributionPoints,
          ruleId: rule.contributionRuleId,
        },
      ]) {
        if (!entry.ruleId || entry.requested === 0) continue;
        const category = categories.find((candidate) => candidate.id === entry.category)!;
        const points = Math.min(entry.requested, category.maximum - category.score);
        if (points === 0) continue;
        category.score += points;
        const contribution = { category: entry.category, points, ruleId: entry.ruleId };
        artifactContributions.push(contribution);
        const key = `${entry.category}:${entry.ruleId}`;
        const aggregate = aggregateContributions.get(key);
        if (aggregate) aggregate.points += points;
        else aggregateContributions.set(key, { ...contribution });
      }
      return { ...artifact, contributions: artifactContributions };
    });
    evidence.push({
      claim: claimReference(githubContribution.claim),
      supportingClaims: [claimReference(github.claim)],
      issuerDid: githubContribution.claim.issuerDid,
      schemaId: policy.github.contributionSchema.id,
      schemaHash: githubContribution.claim.schemaHash,
      issuedAt: Number(githubContribution.claim.issuedAt),
      account: accountFromGithub(github.payload),
      githubContributions: {
        registryVersion: githubContribution.payload.repository_registry,
        windowStartedAt: githubContribution.payload.window_started_at,
        eligibleArtifactCount: githubContribution.payload.eligible_artifact_count,
        artifacts: scoredArtifacts,
      },
      contributions: [...aggregateContributions.values()],
    });
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

  let telegramEvidence: MutableEvidence | undefined;
  if (telegram) {
    telegramEvidence = {
      claim: claimReference(telegram.claim),
      issuerDid: telegram.claim.issuerDid,
      schemaId: policy.telegram.identitySchema.id,
      schemaHash: telegram.claim.schemaHash,
      issuedAt: Number(telegram.claim.issuedAt),
      account: accountFromTelegram(telegram.payload),
      contributions: [],
    };
    evidence.push(telegramEvidence);
    identityScores.push(
      identityScoreCandidate(
        telegramEvidence,
        evaluatedAt,
        undefined,
        policy.telegram.recencyRuleId,
        policy,
      ),
    );
  }

  if (bluesky) {
    const blueskyEvidence: MutableEvidence = {
      claim: claimReference(bluesky.claim),
      issuerDid: bluesky.claim.issuerDid,
      schemaId: policy.bluesky.identitySchema.id,
      schemaHash: bluesky.claim.schemaHash,
      issuedAt: Number(bluesky.claim.issuedAt),
      account: accountFromBluesky(bluesky.payload),
      contributions: [],
    };
    evidence.push(blueskyEvidence);
    identityScores.push(
      identityScoreCandidate(
        blueskyEvidence,
        evaluatedAt,
        undefined,
        policy.bluesky.recencyRuleId,
        policy,
      ),
    );
  }

  const tenureWinner = identityScores
    .filter(
      (
        candidate,
      ): candidate is IdentityScoreCandidate & {
        accountAge: number;
        tenurePoints: number;
        tenureRuleId: string;
      } =>
        candidate.accountAge !== undefined &&
        candidate.tenurePoints !== undefined &&
        candidate.tenureRuleId !== undefined,
    )
    .sort(compareTenure)[0];
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

  const communityScores: Array<{
    evidence: MutableEvidence;
    points: number;
    ruleId: string;
    source: "discord" | "telegram";
  }> = [];
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
      contributions: [],
    };
    evidence.push(communityEvidence);
    communityScores.push({
      evidence: communityEvidence,
      points: communityPoints,
      ruleId: policy.discord.communityRuleId,
      source: "discord",
    });
  }

  if (telegram && telegramEvidence && telegramCommunity) {
    const communityEvidence: MutableEvidence = {
      claim: claimReference(telegramCommunity.claim),
      supportingClaims: [claimReference(telegram.claim)],
      issuerDid: telegramCommunity.claim.issuerDid,
      schemaId: policy.telegram.communitySchema.id,
      schemaHash: telegramCommunity.claim.schemaHash,
      issuedAt: Number(telegramCommunity.claim.issuedAt),
      account: accountFromTelegram(telegram.payload),
      community: { memberships: telegramCommunity.payload.memberships },
      contributions: [],
    };
    evidence.push(communityEvidence);
    communityScores.push({
      evidence: communityEvidence,
      points: policy.telegram.communityPoints,
      ruleId: policy.telegram.communityRuleId,
      source: "telegram",
    });
  }

  const communityWinner = communityScores.sort(
    (left, right) =>
      right.points - left.points ||
      right.evidence.issuedAt - left.evidence.issuedAt ||
      compareText(left.source, right.source),
  )[0];
  if (communityWinner) {
    communityWinner.evidence.contributions.push({
      category: "community",
      points: communityWinner.points,
      ruleId: communityWinner.ruleId,
    });
    categories.find((category) => category.id === "community")!.score = communityWinner.points;
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
