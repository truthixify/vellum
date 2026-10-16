import { describe, expect, test } from "bun:test";
import {
  BLUESKY_CLAIM_SCHEMA_HASH,
  CKBOOST_QUEST_CLAIM_SCHEMA_HASH,
  DISCORD_CLAIM_SCHEMA_HASH,
  DISCORD_COMMUNITY_CLAIM_SCHEMA_HASH,
  GITHUB_CLAIM_SCHEMA_HASH,
  GITHUB_CONTRIBUTION_CLAIM_SCHEMA_HASH,
  TELEGRAM_CLAIM_SCHEMA_HASH,
  TELEGRAM_COMMUNITY_CLAIM_SCHEMA_HASH,
} from "@vellum/schemas";
import type { Claim, ClaimIssuerState, ReadClaimsResult } from "@usevellum/sdk";

import {
  CKBOOST_QUEST_REGISTRY,
  CKBOOST_VERIFIED_PARTNER,
  scoreCkboostQuestHistory,
  type CkboostEligibleQuest,
} from "./ckboost";
import { VELLUM_REPUTATION_POLICY_V6 } from "./policy";
import { scoreReputation } from "./score";

const DAY = 86_400;
const EVALUATED_AT = 2_000_000_000;
const TRUSTED_ISSUER = VELLUM_REPUTATION_POLICY_V6.github.issuerDids[0];
const CKBOOST_ISSUER = VELLUM_REPUTATION_POLICY_V6.ckboost.issuerDids[0];

type ClaimOptions = {
  id?: number;
  transaction?: number;
  issuerDid?: string;
  issuerState?: ClaimIssuerState;
  schemaHash?: string;
  issuedAt?: number;
  expiresAt?: number;
  userId?: number;
  login?: string;
  accountCreatedAt?: number;
  verifiedAt?: number;
  payload?: unknown;
  duplicateTransactions?: readonly number[];
};

type DiscordClaimOptions = Omit<ClaimOptions, "userId" | "login"> & {
  userId?: string;
  username?: string;
};

type DiscordCommunityClaimOptions = Omit<DiscordClaimOptions, "accountCreatedAt"> & {
  guildId?: string;
  communityName?: string;
  joinedAt?: number;
  recognizedRoles?: { role_id: string; role_name: string }[];
};

type TelegramClaimOptions = Omit<ClaimOptions, "accountCreatedAt" | "login" | "userId"> & {
  userId?: string;
  displayName?: string;
  username?: string;
};

type TelegramCommunityClaimOptions = Omit<TelegramClaimOptions, "displayName" | "username"> & {
  chatId?: string;
  communityName?: string;
  communityType?: "channel" | "group" | "supergroup";
  memberRole?: "administrator" | "member" | "owner";
};

type BlueskyClaimOptions = Omit<ClaimOptions, "accountCreatedAt" | "login" | "userId"> & {
  accountDid?: string;
  handle?: string;
};

type GithubContributionClaimOptions = Omit<ClaimOptions, "accountCreatedAt"> & {
  artifacts?: Array<{
    classification?: "ecosystem" | "technical";
    kind?: "merged_pull_request" | "pull_request_review";
    mergedAt?: number;
    occurredAt?: number;
  }>;
};

type CkboostClaimOptions = Omit<ClaimOptions, "accountCreatedAt" | "login" | "userId"> & {
  quest?: Readonly<CkboostEligibleQuest>;
  userTypeId?: string;
  completedAt?: number;
  pointsAwarded?: string;
};

function hash(byte: number): `0x${string}` {
  return `0x${byte.toString(16).padStart(2, "0").repeat(32)}`;
}

function cell(transaction: number, outputIndex = 0n): Claim["cell"] {
  return {
    outPoint: { txHash: hash(transaction), index: outputIndex },
  } as Claim["cell"];
}

function githubClaim(options: ClaimOptions = {}): Claim {
  const id = options.id ?? 1;
  const issuedAt = options.issuedAt ?? EVALUATED_AT - 10 * DAY;
  const login = options.login ?? `builder-${id}`;
  const payload = options.payload ?? {
    user_id: options.userId ?? id,
    login,
    profile_url: `https://github.com/${login}`,
    account_created_at: options.accountCreatedAt ?? EVALUATED_AT - 1_460 * DAY,
    verified_at: options.verifiedAt ?? issuedAt,
  };

  return {
    version: "v1",
    claimId: hash(id),
    issuerDid: options.issuerDid ?? TRUSTED_ISSUER,
    issuerState: options.issuerState ?? ({ status: "active" } as ClaimIssuerState),
    schemaHash: options.schemaHash ?? GITHUB_CLAIM_SCHEMA_HASH,
    issuedAt: BigInt(issuedAt),
    expiresAt: options.expiresAt === undefined ? undefined : BigInt(options.expiresAt),
    payload,
    cell: cell(options.transaction ?? id),
    duplicateCells: (options.duplicateTransactions ?? []).map((transaction) => cell(transaction)),
    verification: {
      inclusion: "live",
      issuerAuthorization: "accepted-by-configured-claim-type",
      time: { status: "active", evaluatedAt: BigInt(EVALUATED_AT) },
    },
  } as unknown as Claim;
}

function githubContributionClaim(options: GithubContributionClaimOptions = {}): Claim {
  const id = options.id ?? 20;
  const issuedAt = options.issuedAt ?? EVALUATED_AT - 10 * DAY;
  const userId = options.userId ?? 1;
  const login = options.login ?? `builder-${userId}`;
  const artifactOptions = options.artifacts ?? [{ classification: "technical" }];
  const artifacts = artifactOptions
    .map((artifact, index) => {
      const number = 400 + index;
      const kind = artifact.kind ?? "merged_pull_request";
      const mergedAt = artifact.mergedAt ?? issuedAt - (index + 1) * DAY;
      const occurredAt =
        artifact.occurredAt ?? (kind === "merged_pull_request" ? mergedAt : mergedAt - 1);
      const pullRequestId = `PR_fixture_${id}_${index}`;
      return {
        artifact_id: kind === "merged_pull_request" ? pullRequestId : `PRR_fixture_${id}_${index}`,
        changed_files: 3,
        classification: artifact.classification ?? "technical",
        kind,
        merge_commit_sha: (id + index).toString(16).padStart(40, "0"),
        merged_at: mergedAt,
        number,
        occurred_at: occurredAt,
        pull_request_id: pullRequestId,
        repository: "ckb-devrel/ccc",
        repository_id: "R_kgDOLw3gsg",
        title: `Contribution ${number}`,
        url: `https://github.com/ckb-devrel/ccc/pull/${number}`,
      };
    })
    .sort(
      (left, right) =>
        right.occurred_at - left.occurred_at || left.artifact_id.localeCompare(right.artifact_id),
    );
  const payload = options.payload ?? {
    user_id: userId,
    login,
    verified_at: options.verifiedAt ?? issuedAt,
    window_started_at: (options.verifiedAt ?? issuedAt) - 365 * DAY,
    repository_registry: "ckb.public-contributions.v1",
    eligible_artifact_count: artifacts.length,
    artifacts,
  };

  return {
    version: "v1",
    claimId: hash(id),
    issuerDid: options.issuerDid ?? TRUSTED_ISSUER,
    issuerState: options.issuerState ?? ({ status: "active" } as ClaimIssuerState),
    schemaHash: options.schemaHash ?? GITHUB_CONTRIBUTION_CLAIM_SCHEMA_HASH,
    issuedAt: BigInt(issuedAt),
    expiresAt: BigInt(options.expiresAt ?? issuedAt + 30 * DAY),
    payload,
    cell: cell(options.transaction ?? id, 1n),
    duplicateCells: (options.duplicateTransactions ?? []).map((transaction) =>
      cell(transaction, 1n),
    ),
    verification: {
      inclusion: "live",
      issuerAuthorization: "accepted-by-configured-claim-type",
      time: { status: "active", evaluatedAt: BigInt(EVALUATED_AT) },
    },
  } as unknown as Claim;
}

function discordSnowflake(timestamp: number, increment = 0n): string {
  return (((BigInt(timestamp) * 1_000n - 1_420_070_400_000n) << 22n) + increment).toString();
}

function discordClaim(options: DiscordClaimOptions = {}): Claim {
  const id = options.id ?? 30;
  const issuedAt = options.issuedAt ?? EVALUATED_AT - 10 * DAY;
  const accountCreatedAt = options.accountCreatedAt ?? EVALUATED_AT - 1_460 * DAY;
  const userId = options.userId ?? discordSnowflake(accountCreatedAt, BigInt(id));
  const username = options.username ?? `builder${id}`;
  const payload = options.payload ?? {
    user_id: userId,
    username,
    profile_url: `https://discord.com/users/${userId}`,
    account_created_at: accountCreatedAt,
    verified_at: options.verifiedAt ?? issuedAt,
  };

  return {
    version: "v1",
    claimId: hash(id),
    issuerDid: options.issuerDid ?? TRUSTED_ISSUER,
    issuerState: options.issuerState ?? ({ status: "active" } as ClaimIssuerState),
    schemaHash: options.schemaHash ?? DISCORD_CLAIM_SCHEMA_HASH,
    issuedAt: BigInt(issuedAt),
    expiresAt: options.expiresAt === undefined ? undefined : BigInt(options.expiresAt),
    payload,
    cell: cell(options.transaction ?? id),
    duplicateCells: (options.duplicateTransactions ?? []).map((transaction) => cell(transaction)),
    verification: {
      inclusion: "live",
      issuerAuthorization: "accepted-by-configured-claim-type",
      time: { status: "active", evaluatedAt: BigInt(EVALUATED_AT) },
    },
  } as unknown as Claim;
}

function discordCommunityClaim(options: DiscordCommunityClaimOptions = {}): Claim {
  const id = options.id ?? 40;
  const issuedAt = options.issuedAt ?? EVALUATED_AT - 10 * DAY;
  const userId = options.userId ?? discordSnowflake(EVALUATED_AT - 1_460 * DAY, 30n);
  const payload = options.payload ?? {
    user_id: userId,
    verified_at: options.verifiedAt ?? issuedAt,
    memberships: [
      {
        guild_id: options.guildId ?? "1048098513321902120",
        community_name: options.communityName ?? "Nervos Nation",
        joined_at: options.joinedAt ?? EVALUATED_AT - 730 * DAY,
        recognized_roles: options.recognizedRoles ?? [
          { role_id: "1048098513321902121", role_name: "Builder" },
        ],
      },
    ],
  };

  return {
    version: "v1",
    claimId: hash(id),
    issuerDid: options.issuerDid ?? TRUSTED_ISSUER,
    issuerState: options.issuerState ?? ({ status: "active" } as ClaimIssuerState),
    schemaHash: options.schemaHash ?? DISCORD_COMMUNITY_CLAIM_SCHEMA_HASH,
    issuedAt: BigInt(issuedAt),
    expiresAt: BigInt(options.expiresAt ?? issuedAt + 30 * DAY),
    payload,
    cell: cell(options.transaction ?? id, 1n),
    duplicateCells: (options.duplicateTransactions ?? []).map((transaction) =>
      cell(transaction, 1n),
    ),
    verification: {
      inclusion: "live",
      issuerAuthorization: "accepted-by-configured-claim-type",
      time: { status: "active", evaluatedAt: BigInt(EVALUATED_AT) },
    },
  } as unknown as Claim;
}

function telegramClaim(options: TelegramClaimOptions = {}): Claim {
  const id = options.id ?? 50;
  const issuedAt = options.issuedAt ?? EVALUATED_AT - DAY;
  const userId = options.userId ?? `1234123412341234${id}`;
  const displayName = options.displayName ?? `Builder ${id}`;
  const username = options.username ?? `builder_${id}`;
  const payload = options.payload ?? {
    user_id: userId,
    display_name: displayName,
    username,
    profile_url: `https://t.me/${username}`,
    verified_at: options.verifiedAt ?? issuedAt,
  };

  return {
    version: "v1",
    claimId: hash(id),
    issuerDid: options.issuerDid ?? TRUSTED_ISSUER,
    issuerState: options.issuerState ?? ({ status: "active" } as ClaimIssuerState),
    schemaHash: options.schemaHash ?? TELEGRAM_CLAIM_SCHEMA_HASH,
    issuedAt: BigInt(issuedAt),
    expiresAt: options.expiresAt === undefined ? undefined : BigInt(options.expiresAt),
    payload,
    cell: cell(options.transaction ?? id),
    duplicateCells: (options.duplicateTransactions ?? []).map((transaction) => cell(transaction)),
    verification: {
      inclusion: "live",
      issuerAuthorization: "accepted-by-configured-claim-type",
      time: { status: "active", evaluatedAt: BigInt(EVALUATED_AT) },
    },
  } as unknown as Claim;
}

function telegramCommunityClaim(options: TelegramCommunityClaimOptions = {}): Claim {
  const id = options.id ?? 60;
  const issuedAt = options.issuedAt ?? EVALUATED_AT - DAY;
  const userId = options.userId ?? "123412341234123450";
  const payload = options.payload ?? {
    user_id: userId,
    verified_at: options.verifiedAt ?? issuedAt,
    memberships: [
      {
        chat_id: options.chatId ?? "-1006577996900705",
        community_name: options.communityName ?? "Nervos Network",
        community_type: options.communityType ?? "supergroup",
        member_role: options.memberRole ?? "member",
      },
    ],
  };

  return {
    version: "v1",
    claimId: hash(id),
    issuerDid: options.issuerDid ?? TRUSTED_ISSUER,
    issuerState: options.issuerState ?? ({ status: "active" } as ClaimIssuerState),
    schemaHash: options.schemaHash ?? TELEGRAM_COMMUNITY_CLAIM_SCHEMA_HASH,
    issuedAt: BigInt(issuedAt),
    expiresAt: BigInt(options.expiresAt ?? issuedAt + 30 * DAY),
    payload,
    cell: cell(options.transaction ?? id, 1n),
    duplicateCells: (options.duplicateTransactions ?? []).map((transaction) =>
      cell(transaction, 1n),
    ),
    verification: {
      inclusion: "live",
      issuerAuthorization: "accepted-by-configured-claim-type",
      time: { status: "active", evaluatedAt: BigInt(EVALUATED_AT) },
    },
  } as unknown as Claim;
}

function blueskyClaim(options: BlueskyClaimOptions = {}): Claim {
  const id = options.id ?? 70;
  const issuedAt = options.issuedAt ?? EVALUATED_AT - DAY;
  const accountDid = options.accountDid ?? `did:plc:${"a".repeat(24)}`;
  const handle = options.handle ?? "builder.bsky.social";
  const payload = options.payload ?? {
    did: accountDid,
    handle,
    profile_url: `https://bsky.app/profile/${accountDid}`,
    verified_at: options.verifiedAt ?? issuedAt,
  };

  return {
    version: "v1",
    claimId: hash(id),
    issuerDid: options.issuerDid ?? TRUSTED_ISSUER,
    issuerState: options.issuerState ?? ({ status: "active" } as ClaimIssuerState),
    schemaHash: options.schemaHash ?? BLUESKY_CLAIM_SCHEMA_HASH,
    issuedAt: BigInt(issuedAt),
    expiresAt: options.expiresAt === undefined ? undefined : BigInt(options.expiresAt),
    payload,
    cell: cell(options.transaction ?? id),
    duplicateCells: (options.duplicateTransactions ?? []).map((transaction) => cell(transaction)),
    verification: {
      inclusion: "live",
      issuerAuthorization: "accepted-by-configured-claim-type",
      time: { status: "active", evaluatedAt: BigInt(EVALUATED_AT) },
    },
  } as unknown as Claim;
}

function ckboostClaim(options: CkboostClaimOptions = {}): Claim {
  const id = options.id ?? 80;
  const issuedAt = options.issuedAt ?? EVALUATED_AT - DAY;
  const quest =
    options.quest ??
    CKBOOST_QUEST_REGISTRY.quests.find((entry) => entry.classification === "contribution")!;
  const payload = options.payload ?? {
    campaign_type_id: quest.campaignTypeId,
    campaign_title: quest.campaignTitle,
    quest_id: quest.questId,
    quest_title: quest.questTitle,
    ckboost_user_type_id: options.userTypeId ?? hash(200),
    completed_at: options.completedAt ?? issuedAt - 90 * DAY,
    approval_tx_hash: hash((id + 90) % 255),
    reward_claim_tx_hash: hash((id + 120) % 255),
    points_awarded: options.pointsAwarded ?? "100",
  };

  return {
    version: "v1",
    claimId: hash(id),
    issuerDid: options.issuerDid ?? CKBOOST_ISSUER,
    issuerState: options.issuerState ?? ({ status: "active" } as ClaimIssuerState),
    schemaHash: options.schemaHash ?? CKBOOST_QUEST_CLAIM_SCHEMA_HASH,
    issuedAt: BigInt(issuedAt),
    expiresAt: options.expiresAt === undefined ? undefined : BigInt(options.expiresAt),
    payload,
    cell: cell(options.transaction ?? id),
    duplicateCells: (options.duplicateTransactions ?? []).map((transaction) => cell(transaction)),
    verification: {
      inclusion: "live",
      issuerAuthorization: "accepted-by-configured-claim-type",
      time: { status: "active", evaluatedAt: BigInt(EVALUATED_AT) },
    },
  } as unknown as Claim;
}

function readResult(claims: Claim[], invalid: ReadClaimsResult["invalid"] = []): ReadClaimsResult {
  return { claims, invalid };
}

function categoryScore(
  result: ReturnType<typeof scoreReputation>,
  category: "technical" | "contribution" | "community" | "tenure" | "recency",
): number {
  if (result.status !== "available") throw new Error("Expected an available score");
  return result.categories.find((entry) => entry.id === category)!.score;
}

describe("vellum.reputation.v6", () => {
  test("scores GitHub evidence only for tenure and recency", () => {
    const result = scoreReputation({
      claims: readResult([githubClaim()]),
      evaluatedAt: EVALUATED_AT,
    });

    expect(result).toMatchObject({
      status: "available",
      policyVersion: "vellum.reputation.v6",
      evaluatedAt: EVALUATED_AT,
      overall: { score: 200, maximum: 1_000 },
      categories: [
        { id: "technical", score: 0, maximum: 300 },
        { id: "contribution", score: 0, maximum: 300 },
        { id: "community", score: 0, maximum: 200 },
        { id: "tenure", score: 100, maximum: 100 },
        { id: "recency", score: 100, maximum: 100 },
      ],
      excludedEvidence: [],
    });
    if (result.status !== "available") throw new Error("Expected an available score");
    expect(result.evidence).toHaveLength(1);
    expect(result.evidence[0]).toMatchObject({
      issuerDid: TRUSTED_ISSUER,
      schemaId: "vellum.social.github.v1",
      account: { platform: "github", id: 1, handle: "builder-1" },
      contributions: [
        { category: "tenure", points: 100, ruleId: "github-account-tenure.v5" },
        { category: "recency", points: 100, ruleId: "github-verification-recency.v5" },
      ],
    });
  });

  test("scores each accepted GitHub artifact and exposes its audit trail", () => {
    const identity = githubClaim({ userId: 7, login: "ckb-builder" });
    const contribution = githubContributionClaim({
      userId: 7,
      login: "ckb-builder",
      artifacts: [
        { classification: "technical", kind: "merged_pull_request" },
        { classification: "ecosystem", kind: "merged_pull_request" },
        { classification: "technical", kind: "pull_request_review" },
        { classification: "ecosystem", kind: "pull_request_review" },
      ],
    });
    const result = scoreReputation({
      claims: readResult([contribution, identity]),
      evaluatedAt: EVALUATED_AT,
    });

    expect(result).toMatchObject({
      status: "available",
      policyVersion: "vellum.reputation.v6",
      overall: { score: 355 },
      categories: [
        { id: "technical", score: 75 },
        { id: "contribution", score: 80 },
        { id: "community", score: 0 },
        { id: "tenure", score: 100 },
        { id: "recency", score: 100 },
      ],
    });
    if (result.status !== "available") throw new Error("Expected an available score");
    const evidence = result.evidence.find(
      (entry) => entry.schemaId === "vellum.contribution.github.v1",
    );
    expect(evidence).toMatchObject({
      supportingClaims: [{ claimId: identity.claimId }],
      account: { platform: "github", id: 7, handle: "ckb-builder" },
      githubContributions: {
        registryVersion: "ckb.public-contributions.v1",
        eligibleArtifactCount: 4,
      },
      contributions: [
        { category: "technical", points: 60, ruleId: "github-merged-technical-pr.v5" },
        { category: "contribution", points: 60, ruleId: "github-merged-pr.v5" },
        { category: "technical", points: 15, ruleId: "github-technical-review.v5" },
        { category: "contribution", points: 20, ruleId: "github-substantive-review.v5" },
      ],
    });
    expect(
      evidence?.githubContributions?.artifacts.map((artifact) => artifact.contributions),
    ).toEqual([
      [
        { category: "technical", points: 60, ruleId: "github-merged-technical-pr.v5" },
        { category: "contribution", points: 30, ruleId: "github-merged-pr.v5" },
      ],
      [{ category: "contribution", points: 30, ruleId: "github-merged-pr.v5" }],
      [
        { category: "technical", points: 15, ruleId: "github-technical-review.v5" },
        { category: "contribution", points: 10, ruleId: "github-substantive-review.v5" },
      ],
      [{ category: "contribution", points: 10, ruleId: "github-substantive-review.v5" }],
    ]);
  });

  test("requires current matching GitHub identity evidence and exact contribution lifetime", () => {
    const missingIdentity = scoreReputation({
      claims: readResult([githubContributionClaim({ userId: 8 })]),
      evaluatedAt: EVALUATED_AT,
    });
    const otherIdentity = scoreReputation({
      claims: readResult([githubClaim({ userId: 9 }), githubContributionClaim({ userId: 8 })]),
      evaluatedAt: EVALUATED_AT,
    });
    const wrongLifetime = scoreReputation({
      claims: readResult([
        githubClaim({ userId: 8 }),
        githubContributionClaim({ userId: 8, expiresAt: EVALUATED_AT + 19 * DAY }),
      ]),
      evaluatedAt: EVALUATED_AT,
    });

    if (
      missingIdentity.status !== "available" ||
      otherIdentity.status !== "available" ||
      wrongLifetime.status !== "available"
    ) {
      throw new Error("Expected available scores");
    }
    expect(missingIdentity.excludedEvidence).toContainEqual(
      expect.objectContaining({ reason: "identity-missing" }),
    );
    expect(otherIdentity.excludedEvidence).toContainEqual(
      expect.objectContaining({ reason: "additional-account" }),
    );
    expect(wrongLifetime.excludedEvidence).toContainEqual(
      expect.objectContaining({ reason: "malformed-payload" }),
    );
    expect(categoryScore(wrongLifetime, "technical")).toBe(0);
  });

  test("links active contribution evidence to a newer matching identity claim", () => {
    const identity = githubClaim({
      id: 8,
      userId: 8,
      issuedAt: EVALUATED_AT - DAY,
    });
    const contribution = githubContributionClaim({
      id: 28,
      userId: 8,
      issuedAt: EVALUATED_AT - 10 * DAY,
    });
    const result = scoreReputation({
      claims: readResult([contribution, identity]),
      evaluatedAt: EVALUATED_AT,
    });

    expect(categoryScore(result, "technical")).toBe(60);
    if (result.status !== "available") throw new Error("Expected an available score");
    expect(
      result.evidence.find((entry) => entry.schemaId === "vellum.contribution.github.v1"),
    ).toMatchObject({
      issuedAt: EVALUATED_AT - 10 * DAY,
      supportingClaims: [{ claimId: identity.claimId }],
      account: { id: 8, verifiedAt: EVALUATED_AT - DAY },
    });
  });

  test("treats GitHub contribution evidence as inactive at its expiry boundary", () => {
    const issuedAt = EVALUATED_AT - 30 * DAY;
    const result = scoreReputation({
      claims: readResult([
        githubClaim({ userId: 8 }),
        githubContributionClaim({ userId: 8, issuedAt }),
      ]),
      evaluatedAt: EVALUATED_AT,
    });

    expect(categoryScore(result, "technical")).toBe(0);
    expect(categoryScore(result, "contribution")).toBe(0);
    if (result.status !== "available") throw new Error("Expected an available score");
    expect(result.excludedEvidence).toContainEqual(expect.objectContaining({ reason: "expired" }));
  });

  test("caps GitHub artifact scores and supersedes overlapping contribution claims", () => {
    const artifacts = Array.from({ length: 8 }, () => ({ classification: "technical" as const }));
    const identity = githubClaim({ userId: 10 });
    const older = githubContributionClaim({ id: 20, userId: 10, artifacts });
    const newer = githubContributionClaim({
      id: 21,
      userId: 10,
      issuedAt: EVALUATED_AT - DAY,
      artifacts,
    });
    const result = scoreReputation({
      claims: readResult([older, newer, identity]),
      evaluatedAt: EVALUATED_AT,
    });

    expect(categoryScore(result, "technical")).toBe(300);
    expect(categoryScore(result, "contribution")).toBe(240);
    if (result.status !== "available") throw new Error("Expected an available score");
    expect(result.excludedEvidence).toContainEqual(
      expect.objectContaining({
        claim: expect.objectContaining({ claimId: older.claimId }),
        reason: "superseded",
      }),
    );
    const contributionEvidence = result.evidence.find(
      (entry) => entry.schemaId === "vellum.contribution.github.v1",
    );
    expect(
      contributionEvidence?.githubContributions?.artifacts
        .flatMap((artifact) => artifact.contributions)
        .filter((entry) => entry.category === "technical")
        .reduce((sum, entry) => sum + entry.points, 0),
    ).toBe(300);
  });

  test("applies exact tenure boundaries", () => {
    const cases = [
      [0, 0],
      [30 * DAY - 1, 0],
      [30 * DAY, 20],
      [180 * DAY, 40],
      [365 * DAY, 60],
      [730 * DAY, 80],
      [1_460 * DAY, 100],
    ] as const;

    for (const [age, expected] of cases) {
      const result = scoreReputation({
        claims: readResult([
          githubClaim({
            issuedAt: EVALUATED_AT,
            verifiedAt: EVALUATED_AT,
            accountCreatedAt: EVALUATED_AT - age,
          }),
        ]),
        evaluatedAt: EVALUATED_AT,
      });
      expect(categoryScore(result, "tenure")).toBe(expected);
    }
  });

  test("applies exact recency boundaries", () => {
    const cases = [
      [0, 100],
      [30 * DAY - 1, 100],
      [30 * DAY, 75],
      [90 * DAY, 50],
      [180 * DAY, 25],
      [365 * DAY, 0],
    ] as const;

    for (const [age, expected] of cases) {
      const result = scoreReputation({
        claims: readResult([
          githubClaim({
            issuedAt: EVALUATED_AT - age,
            verifiedAt: EVALUATED_AT - age,
          }),
        ]),
        evaluatedAt: EVALUATED_AT,
      });
      expect(categoryScore(result, "recency")).toBe(expected);
    }
  });

  test("scores Discord identity and trusted CKB community history", () => {
    const accountCreatedAt = EVALUATED_AT - 1_460 * DAY;
    const userId = discordSnowflake(accountCreatedAt, 30n);
    const identity = discordClaim({ userId, accountCreatedAt });
    const community = discordCommunityClaim({
      userId,
      joinedAt: EVALUATED_AT - 730 * DAY,
    });
    const result = scoreReputation({
      claims: readResult([community, identity]),
      evaluatedAt: EVALUATED_AT,
    });

    expect(result).toMatchObject({
      status: "available",
      policyVersion: "vellum.reputation.v6",
      overall: { score: 360, maximum: 1_000 },
      categories: [
        { id: "technical", score: 0, maximum: 300 },
        { id: "contribution", score: 0, maximum: 300 },
        { id: "community", score: 160, maximum: 200 },
        { id: "tenure", score: 100, maximum: 100 },
        { id: "recency", score: 100, maximum: 100 },
      ],
    });
    if (result.status !== "available") throw new Error("Expected an available score");
    expect(result.evidence).toHaveLength(2);
    expect(result.evidence[1]).toMatchObject({
      schemaId: "vellum.community.discord.v1",
      account: { platform: "discord", id: userId },
      community: {
        memberships: [
          {
            community_name: "Nervos Nation",
            recognized_roles: [{ role_name: "Builder" }],
          },
        ],
      },
      supportingClaims: [{ claimId: identity.claimId }],
      contributions: [
        { category: "community", points: 160, ruleId: "discord-ckb-membership-tenure.v5" },
      ],
    });
  });

  test("uses the best identity evidence without stacking category points", () => {
    const discordCreatedAt = EVALUATED_AT - 730 * DAY;
    const discordUserId = discordSnowflake(discordCreatedAt, 31n);
    const result = scoreReputation({
      claims: readResult([
        githubClaim({
          accountCreatedAt: EVALUATED_AT - 1_460 * DAY,
          issuedAt: EVALUATED_AT - 40 * DAY,
        }),
        discordClaim({
          userId: discordUserId,
          accountCreatedAt: discordCreatedAt,
          issuedAt: EVALUATED_AT - DAY,
        }),
      ]),
      evaluatedAt: EVALUATED_AT,
    });

    expect(result).toMatchObject({
      status: "available",
      overall: { score: 200 },
      categories: [
        { id: "technical", score: 0 },
        { id: "contribution", score: 0 },
        { id: "community", score: 0 },
        { id: "tenure", score: 100 },
        { id: "recency", score: 100 },
      ],
    });
    if (result.status !== "available") throw new Error("Expected an available score");
    expect(result.evidence.flatMap((item) => item.contributions)).toEqual([
      { category: "tenure", points: 100, ruleId: "github-account-tenure.v5" },
      { category: "recency", points: 100, ruleId: "discord-verification-recency.v5" },
    ]);
  });

  test("uses Telegram for recency without inventing account tenure", () => {
    const result = scoreReputation({
      claims: readResult([telegramClaim()]),
      evaluatedAt: EVALUATED_AT,
    });

    expect(result).toMatchObject({
      status: "available",
      policyVersion: "vellum.reputation.v6",
      overall: { score: 100, maximum: 1_000 },
      categories: [
        { id: "technical", score: 0 },
        { id: "contribution", score: 0 },
        { id: "community", score: 0 },
        { id: "tenure", score: 0 },
        { id: "recency", score: 100 },
      ],
    });
    if (result.status !== "available") throw new Error("Expected an available score");
    expect(result.evidence).toEqual([
      expect.objectContaining({
        schemaId: "vellum.social.telegram.v1",
        account: {
          platform: "telegram",
          id: "123412341234123450",
          displayName: "Builder 50",
          handle: "builder_50",
          profileUrl: "https://t.me/builder_50",
          verifiedAt: EVALUATED_AT - DAY,
        },
        contributions: [
          { category: "recency", points: 100, ruleId: "telegram-verification-recency.v5" },
        ],
      }),
    ]);
  });

  test("does not stack Telegram recency with other identity evidence", () => {
    const result = scoreReputation({
      claims: readResult([
        githubClaim({ issuedAt: EVALUATED_AT - 40 * DAY }),
        telegramClaim({ issuedAt: EVALUATED_AT - DAY }),
      ]),
      evaluatedAt: EVALUATED_AT,
    });

    expect(result).toMatchObject({ status: "available", overall: { score: 200 } });
    if (result.status !== "available") throw new Error("Expected an available score");
    expect(result.evidence.flatMap((item) => item.contributions)).toEqual([
      { category: "tenure", points: 100, ruleId: "github-account-tenure.v5" },
      { category: "recency", points: 100, ruleId: "telegram-verification-recency.v5" },
    ]);
  });

  test("uses Bluesky for recency without inventing account tenure", () => {
    const result = scoreReputation({
      claims: readResult([blueskyClaim()]),
      evaluatedAt: EVALUATED_AT,
    });

    expect(result).toMatchObject({
      status: "available",
      policyVersion: "vellum.reputation.v6",
      overall: { score: 100, maximum: 1_000 },
      categories: [
        { id: "technical", score: 0 },
        { id: "contribution", score: 0 },
        { id: "community", score: 0 },
        { id: "tenure", score: 0 },
        { id: "recency", score: 100 },
      ],
    });
    if (result.status !== "available") throw new Error("Expected an available score");
    expect(result.evidence).toEqual([
      expect.objectContaining({
        schemaId: "vellum.social.bluesky.v1",
        account: {
          platform: "bluesky",
          id: `did:plc:${"a".repeat(24)}`,
          handle: "builder.bsky.social",
          profileUrl: `https://bsky.app/profile/did:plc:${"a".repeat(24)}`,
          verifiedAt: EVALUATED_AT - DAY,
        },
        contributions: [
          { category: "recency", points: 100, ruleId: "bluesky-verification-recency.v5" },
        ],
      }),
    ]);
  });

  test("does not stack Bluesky recency with other identity evidence", () => {
    const result = scoreReputation({
      claims: readResult([
        githubClaim({ issuedAt: EVALUATED_AT - DAY }),
        blueskyClaim({ issuedAt: EVALUATED_AT - 2 * DAY }),
      ]),
      evaluatedAt: EVALUATED_AT,
    });

    expect(result).toMatchObject({ status: "available", overall: { score: 200 } });
    if (result.status !== "available") throw new Error("Expected an available score");
    expect(result.evidence.flatMap((item) => item.contributions)).toEqual([
      { category: "tenure", points: 100, ruleId: "github-account-tenure.v5" },
      { category: "recency", points: 100, ruleId: "github-verification-recency.v5" },
    ]);
  });

  test("supersedes Bluesky handles by stable DID and rejects malformed account data", () => {
    const stableDid = `did:plc:${"b".repeat(24)}`;
    const result = scoreReputation({
      claims: readResult([
        blueskyClaim({
          id: 71,
          accountDid: stableDid,
          handle: "old.bsky.social",
          issuedAt: EVALUATED_AT - 3 * DAY,
        }),
        blueskyClaim({
          id: 72,
          accountDid: stableDid,
          handle: "current.bsky.social",
          issuedAt: EVALUATED_AT - DAY,
        }),
        blueskyClaim({ id: 73, payload: { nope: true } }),
      ]),
      evaluatedAt: EVALUATED_AT,
    });

    expect(result).toMatchObject({ status: "available", overall: { score: 100 } });
    if (result.status !== "available") throw new Error("Expected an available score");
    expect(result.evidence).toHaveLength(1);
    expect(result.evidence[0].account).toMatchObject({
      platform: "bluesky",
      id: stableDid,
      handle: "current.bsky.social",
    });
    expect(result.excludedEvidence.map(({ reason }) => reason).sort()).toEqual([
      "malformed-payload",
      "superseded",
    ]);
  });

  test("implements the published CKBoost depth and breadth examples", () => {
    const examples = [
      { completionUnits: 0, distinctCampaigns: 0, expected: 0 },
      { completionUnits: 1, distinctCampaigns: 1, expected: 20 },
      { completionUnits: 3, distinctCampaigns: 1, expected: 40 },
      { completionUnits: 5, distinctCampaigns: 1, expected: 60 },
      { completionUnits: 5, distinctCampaigns: 5, expected: 100 },
      { completionUnits: 6, distinctCampaigns: 3, expected: 80 },
    ] as const;

    for (const example of examples) {
      expect(scoreCkboostQuestHistory(example.completionUnits, example.distinctCampaigns)).toBe(
        example.expected,
      );
    }
  });

  test("derives CKBoost depth and breadth boundaries from registered claim evidence", () => {
    const participation = CKBOOST_QUEST_REGISTRY.quests.find(
      (entry) => entry.classification === "participation",
    )!;
    const contribution = CKBOOST_QUEST_REGISTRY.quests.find(
      (entry) =>
        entry.campaignTypeId === participation.campaignTypeId &&
        entry.classification === "contribution",
    )!;
    const delivery = CKBOOST_QUEST_REGISTRY.quests.find(
      (entry) =>
        entry.campaignTypeId === participation.campaignTypeId &&
        entry.classification === "delivery",
    )!;
    const otherDelivery = CKBOOST_QUEST_REGISTRY.quests.find(
      (entry) =>
        entry.campaignTypeId !== participation.campaignTypeId &&
        entry.classification === "delivery",
    )!;
    const contributionsByCampaign = CKBOOST_QUEST_REGISTRY.quests
      .filter((entry) => entry.classification === "contribution")
      .filter(
        (entry, index, entries) =>
          entries.findIndex((candidate) => candidate.campaignTypeId === entry.campaignTypeId) ===
          index,
      );
    const thirdCampaignContribution = contributionsByCampaign.find(
      (entry) =>
        entry.campaignTypeId !== delivery.campaignTypeId &&
        entry.campaignTypeId !== otherDelivery.campaignTypeId,
    )!;
    expect(contributionsByCampaign.length).toBeGreaterThanOrEqual(5);

    const cases = [
      {
        name: "participation only",
        expected: 0,
        claims: [ckboostClaim({ id: 110, quest: participation })],
      },
      {
        name: "one contribution in one campaign",
        expected: 20,
        claims: [ckboostClaim({ id: 111, quest: contribution })],
      },
      {
        name: "participation, contribution, and delivery in one campaign",
        expected: 40,
        claims: [
          ckboostClaim({ id: 112, quest: participation }),
          ckboostClaim({ id: 113, quest: contribution }),
          ckboostClaim({ id: 114, quest: delivery }),
        ],
      },
      {
        name: "five completion units in one campaign",
        expected: 60,
        claims: [
          ckboostClaim({ id: 115, quest: contribution, userTypeId: hash(211) }),
          ckboostClaim({ id: 116, quest: delivery, userTypeId: hash(212) }),
          ckboostClaim({ id: 117, quest: delivery, userTypeId: hash(213) }),
        ],
      },
      {
        name: "five contributions across five campaigns",
        expected: 100,
        claims: contributionsByCampaign
          .slice(0, 5)
          .map((quest, index) => ckboostClaim({ id: 120 + index, quest })),
      },
      {
        name: "the depth cap across three scored campaigns",
        expected: 80,
        claims: [
          ckboostClaim({ id: 130, quest: delivery }),
          ckboostClaim({ id: 131, quest: otherDelivery }),
          ckboostClaim({ id: 132, quest: thirdCampaignContribution }),
        ],
      },
    ] as const;

    for (const example of cases) {
      const result = scoreReputation({
        claims: readResult([...example.claims]),
        evaluatedAt: EVALUATED_AT,
      });
      expect(categoryScore(result, "contribution"), example.name).toBe(example.expected);
      if (result.status !== "available") throw new Error("Expected an available score");
      expect(result.excludedEvidence, example.name).toEqual([]);
      expect(result.evidence, example.name).toHaveLength(example.claims.length);
    }
  });

  test("scores historical and newly completed CKBoost quests under the same rule", () => {
    const historicalQuest = CKBOOST_QUEST_REGISTRY.quests.find(
      (entry) => entry.questId === 2 && entry.classification === "contribution",
    )!;
    const recentQuest = CKBOOST_QUEST_REGISTRY.quests.find(
      (entry) =>
        entry.classification === "contribution" &&
        entry.campaignTypeId !== historicalQuest.campaignTypeId,
    )!;
    const result = scoreReputation({
      claims: readResult([
        ckboostClaim({
          id: 80,
          quest: historicalQuest,
          completedAt: EVALUATED_AT - 365 * DAY,
          pointsAwarded: "1000000",
        }),
        ckboostClaim({
          id: 81,
          quest: recentQuest,
          completedAt: EVALUATED_AT - 2 * DAY,
          pointsAwarded: "1",
        }),
      ]),
      evaluatedAt: EVALUATED_AT,
    });

    expect(result).toMatchObject({
      status: "available",
      policyVersion: "vellum.reputation.v6",
      overall: { score: 40 },
      categories: [
        { id: "technical", score: 0 },
        { id: "contribution", score: 40 },
        { id: "community", score: 0 },
        { id: "tenure", score: 0 },
        { id: "recency", score: 0 },
      ],
    });
    if (result.status !== "available") throw new Error("Expected an available score");
    expect(result.evidence).toHaveLength(2);
    expect(result.evidence.map((item) => item.contributions)).toEqual([
      [{ category: "contribution", points: 20, ruleId: "ckboost-completion-history.v6" }],
      [{ category: "contribution", points: 20, ruleId: "ckboost-completion-history.v6" }],
    ]);
    expect(result.evidence[0]).toMatchObject({
      issuerDid: CKBOOST_ISSUER,
      schemaId: "ckboost.quest.v1",
      ckboostQuest: {
        registryVersion: "ckboost.eligible-quests.v1",
        campaignTypeId: historicalQuest.campaignTypeId,
        questId: historicalQuest.questId,
        classification: "contribution",
        completionUnits: 1,
        completedAt: EVALUATED_AT - 365 * DAY,
        pointsAwarded: "1000000",
      },
    });
  });

  test("reaches the CKBoost cap through completion depth and campaign breadth", () => {
    const quests = CKBOOST_QUEST_REGISTRY.quests
      .filter((entry) => entry.classification === "contribution")
      .filter(
        (entry, index, entries) =>
          entries.findIndex((candidate) => candidate.campaignTypeId === entry.campaignTypeId) ===
          index,
      )
      .slice(0, 5);
    const result = scoreReputation({
      claims: readResult(
        quests.map((quest, index) =>
          ckboostClaim({
            id: 90 + index,
            quest,
            userTypeId: hash(210 + index),
            completedAt: EVALUATED_AT - (10 - index) * DAY,
          }),
        ),
      ),
      evaluatedAt: EVALUATED_AT,
    });

    expect(quests).toHaveLength(5);
    expect(categoryScore(result, "contribution")).toBe(100);
    if (result.status !== "available") throw new Error("Expected an available score");
    expect(
      result.evidence
        .flatMap((item) => item.contributions)
        .reduce((total, contribution) => total + contribution.points, 0),
    ).toBe(100);
  });

  test("applies CKBoost points after GitHub contribution evidence reaches the shared cap", () => {
    const quest = CKBOOST_QUEST_REGISTRY.quests.find(
      (entry) => entry.classification === "contribution",
    )!;
    const artifacts = [
      ...Array.from({ length: 9 }, () => ({
        classification: "ecosystem" as const,
        kind: "merged_pull_request" as const,
      })),
      ...Array.from({ length: 2 }, () => ({
        classification: "ecosystem" as const,
        kind: "pull_request_review" as const,
      })),
    ];
    const result = scoreReputation({
      claims: readResult([
        githubClaim(),
        githubContributionClaim({ artifacts }),
        ckboostClaim({ id: 99, quest }),
      ]),
      evaluatedAt: EVALUATED_AT,
    });

    expect(categoryScore(result, "contribution")).toBe(300);
    if (result.status !== "available") throw new Error("Expected an available score");
    expect(
      result.evidence
        .find((item) => item.schemaId === "vellum.contribution.github.v1")
        ?.contributions.filter((item) => item.category === "contribution")
        .reduce((total, item) => total + item.points, 0),
    ).toBe(290);
    expect(
      result.evidence.find((item) => item.schemaId === "ckboost.quest.v1")?.contributions,
    ).toEqual([{ category: "contribution", points: 10, ruleId: "ckboost-completion-history.v6" }]);
  });

  test("keeps participation visible and rejects untrusted, duplicate, and ineligible quests", () => {
    const participationQuest = CKBOOST_QUEST_REGISTRY.quests.find(
      (entry) => entry.classification === "participation",
    )!;
    const contributionQuest = CKBOOST_QUEST_REGISTRY.quests.find(
      (entry) => entry.classification === "contribution",
    )!;
    const accepted = ckboostClaim({ id: 100, quest: contributionQuest });
    const malformedPayload: Record<string, unknown> = {
      ...(accepted.payload as Record<string, unknown>),
      ckboost_user_type_id: hash(201),
    };
    delete malformedPayload.reward_claim_tx_hash;
    const result = scoreReputation({
      claims: readResult([
        accepted,
        ckboostClaim({ id: 101, quest: contributionQuest }),
        ckboostClaim({ id: 102, quest: participationQuest, userTypeId: hash(202) }),
        ckboostClaim({ id: 103, quest: contributionQuest, issuerDid: "did:ckb:untrusted" }),
        ckboostClaim({
          id: 104,
          payload: {
            ...(accepted.payload as Record<string, unknown>),
            campaign_type_id: "0xd045afff6253813950ac9e64086e48743e7257c07eccd819c429ad31236b120a",
            ckboost_user_type_id: hash(204),
          },
        }),
        ckboostClaim({ id: 105, payload: malformedPayload }),
        ckboostClaim({
          id: 106,
          quest: contributionQuest,
          userTypeId: hash(206),
          issuedAt: EVALUATED_AT - 2 * DAY,
          completedAt: EVALUATED_AT - DAY,
        }),
      ]),
      evaluatedAt: EVALUATED_AT,
    });

    expect(categoryScore(result, "contribution")).toBe(20);
    if (result.status !== "available") throw new Error("Expected an available score");
    expect(result.evidence).toHaveLength(2);
    expect(
      result.evidence.find((item) => item.ckboostQuest?.classification === "participation"),
    ).toMatchObject({ contributions: [] });
    expect(result.excludedEvidence.map(({ reason }) => reason).sort()).toEqual([
      "duplicate-completion",
      "ineligible-quest",
      "malformed-payload",
      "timestamp-mismatch",
      "untrusted-issuer",
    ]);
  });

  test("scores current Telegram community membership without claiming tenure", () => {
    const result = scoreReputation({
      claims: readResult([telegramClaim(), telegramCommunityClaim()]),
      evaluatedAt: EVALUATED_AT,
    });

    expect(result).toMatchObject({
      status: "available",
      overall: { score: 140 },
      categories: [
        { id: "technical", score: 0 },
        { id: "contribution", score: 0 },
        { id: "community", score: 40 },
        { id: "tenure", score: 0 },
        { id: "recency", score: 100 },
      ],
    });
    if (result.status !== "available") throw new Error("Expected an available score");
    expect(
      result.evidence.find((item) => item.schemaId === "vellum.community.telegram.v1"),
    ).toMatchObject({
      account: { platform: "telegram", id: "123412341234123450" },
      community: {
        memberships: [
          {
            chat_id: "-1006577996900705",
            community_name: "Nervos Network",
            community_type: "supergroup",
            member_role: "member",
          },
        ],
      },
      contributions: [{ category: "community", points: 40, ruleId: "telegram-ckb-membership.v5" }],
    });
  });

  test("uses the stronger community source instead of stacking Discord and Telegram", () => {
    const accountCreatedAt = EVALUATED_AT - 1_460 * DAY;
    const discordUserId = discordSnowflake(accountCreatedAt, 35n);
    const result = scoreReputation({
      claims: readResult([
        discordClaim({ userId: discordUserId, accountCreatedAt }),
        discordCommunityClaim({ userId: discordUserId, joinedAt: EVALUATED_AT - 730 * DAY }),
        telegramClaim(),
        telegramCommunityClaim(),
      ]),
      evaluatedAt: EVALUATED_AT,
    });

    expect(result).toMatchObject({ status: "available", overall: { score: 360 } });
    if (result.status !== "available") throw new Error("Expected an available score");
    expect(result.categories.find((entry) => entry.id === "community")?.score).toBe(160);
    expect(
      result.evidence.find((item) => item.schemaId === "vellum.community.discord.v1")
        ?.contributions,
    ).toEqual([{ category: "community", points: 160, ruleId: "discord-ckb-membership-tenure.v5" }]);
    expect(
      result.evidence.find((item) => item.schemaId === "vellum.community.telegram.v1")
        ?.contributions,
    ).toEqual([]);
  });

  test("requires matching Telegram identity and the exact community lifetime", () => {
    const result = scoreReputation({
      claims: readResult([
        telegramClaim({ userId: "123412341234123450" }),
        telegramCommunityClaim({ id: 60, userId: "123412341234123451" }),
        telegramCommunityClaim({
          id: 61,
          userId: "123412341234123450",
          issuedAt: EVALUATED_AT - 2 * DAY,
          expiresAt: EVALUATED_AT + 27 * DAY,
        }),
      ]),
      evaluatedAt: EVALUATED_AT,
    });

    expect(result).toMatchObject({ status: "available", overall: { score: 100 } });
    if (result.status !== "available") throw new Error("Expected an available score");
    expect(result.excludedEvidence.map((item) => item.reason).sort()).toEqual([
      "additional-account",
      "malformed-payload",
    ]);
  });

  test("applies exact Discord community age boundaries", () => {
    const accountCreatedAt = EVALUATED_AT - 1_460 * DAY;
    const userId = discordSnowflake(accountCreatedAt, 32n);
    const cases = [
      [0, 0],
      [30 * DAY - 1, 0],
      [30 * DAY, 40],
      [180 * DAY, 80],
      [365 * DAY, 120],
      [730 * DAY, 160],
      [1_460 * DAY, 200],
    ] as const;

    for (const [age, expected] of cases) {
      const result = scoreReputation({
        claims: readResult([
          discordClaim({ userId, accountCreatedAt }),
          discordCommunityClaim({ userId, joinedAt: EVALUATED_AT - age }),
        ]),
        evaluatedAt: EVALUATED_AT,
      });
      if (result.status !== "available") throw new Error("Expected an available score");
      expect(result.categories.find((entry) => entry.id === "community")?.score).toBe(expected);
    }
  });

  test("requires matching current Discord identity and a thirty-day community lifetime", () => {
    const accountCreatedAt = EVALUATED_AT - 365 * DAY;
    const userId = discordSnowflake(accountCreatedAt, 33n);
    const otherUserId = discordSnowflake(accountCreatedAt, 34n);
    const issuedAt = EVALUATED_AT - DAY;
    const result = scoreReputation({
      claims: readResult([
        discordCommunityClaim({ id: 41, userId, issuedAt, joinedAt: accountCreatedAt }),
        discordClaim({ id: 31, userId: otherUserId, accountCreatedAt }),
        discordCommunityClaim({
          id: 42,
          userId: otherUserId,
          issuedAt: issuedAt - 1,
          expiresAt: issuedAt - 1 + 29 * DAY,
          joinedAt: accountCreatedAt,
        }),
      ]),
      evaluatedAt: EVALUATED_AT,
    });

    expect(result).toMatchObject({ status: "available", overall: { score: 160 } });
    if (result.status !== "available") throw new Error("Expected an available score");
    expect(result.excludedEvidence.map((item) => item.reason).sort()).toEqual([
      "additional-account",
      "malformed-payload",
    ]);
  });

  test("does not score Discord community evidence without an identity claim", () => {
    const result = scoreReputation({
      claims: readResult([discordCommunityClaim()]),
      evaluatedAt: EVALUATED_AT,
    });

    expect(result).toMatchObject({ status: "available", overall: { score: 0 } });
    if (result.status !== "available") throw new Error("Expected an available score");
    expect(result.evidence).toEqual([]);
    expect(result.excludedEvidence).toContainEqual(
      expect.objectContaining({ reason: "identity-missing" }),
    );
  });

  test("treats Discord community evidence as inactive at its expiry boundary", () => {
    const issuedAt = EVALUATED_AT - 30 * DAY;
    const accountCreatedAt = EVALUATED_AT - 365 * DAY;
    const userId = discordSnowflake(accountCreatedAt, 35n);
    const result = scoreReputation({
      claims: readResult([
        discordClaim({ userId, accountCreatedAt }),
        discordCommunityClaim({ userId, issuedAt }),
      ]),
      evaluatedAt: EVALUATED_AT,
    });

    expect(result).toMatchObject({ status: "available", overall: { score: 160 } });
    if (result.status !== "available") throw new Error("Expected an available score");
    expect(result.excludedEvidence).toContainEqual(expect.objectContaining({ reason: "expired" }));
  });

  test("is independent of claim order and prevents duplicate or account stacking", () => {
    const older = githubClaim({ id: 1, userId: 10, issuedAt: EVALUATED_AT - 20 });
    const otherAccount = githubClaim({ id: 2, userId: 20, issuedAt: EVALUATED_AT - 10 });
    const newest = githubClaim({
      id: 3,
      transaction: 3,
      userId: 10,
      issuedAt: EVALUATED_AT - 5,
      duplicateTransactions: [4],
    });
    const duplicate = githubClaim({
      id: 3,
      transaction: 5,
      userId: 10,
      issuedAt: EVALUATED_AT - 5,
    });

    const forward = scoreReputation({
      claims: readResult([older, otherAccount, newest, duplicate]),
      evaluatedAt: EVALUATED_AT,
    });
    const reversed = scoreReputation({
      claims: readResult([duplicate, newest, otherAccount, older]),
      evaluatedAt: EVALUATED_AT,
    });

    expect(reversed).toEqual(forward);
    if (forward.status !== "available") throw new Error("Expected an available score");
    expect(forward.evidence[0].claim.claimId).toBe(newest.claimId);
    expect(forward.excludedEvidence.map(({ reason }) => reason).sort()).toEqual([
      "additional-account",
      "duplicate-claim",
      "duplicate-claim",
      "superseded",
    ]);
  });

  test("reports rejected evidence without allowing it to contribute", () => {
    const invalidCell = cell(20);
    const result = scoreReputation({
      evaluatedAt: EVALUATED_AT,
      claims: readResult(
        [
          githubClaim({ id: 1, issuerDid: "did:ckb:untrusted" }),
          githubClaim({ id: 2, schemaHash: hash(99) }),
          githubClaim({ id: 3, expiresAt: EVALUATED_AT }),
          githubClaim({ id: 4, issuedAt: EVALUATED_AT + 1, verifiedAt: EVALUATED_AT + 1 }),
          githubClaim({ id: 5, issuerState: { status: "deactivated" } }),
          githubClaim({ id: 6, payload: { nope: true } }),
          githubClaim({ id: 7, verifiedAt: EVALUATED_AT - 11 * DAY }),
          githubClaim({ id: 8, issuerState: { status: "missing" } }),
          githubClaim({ id: 9, issuerState: { status: "ambiguous", cells: [] } }),
        ],
        [{ cell: invalidCell, code: "invalid-claim-data", message: "invalid fixture" }],
      ),
    });

    expect(result).toMatchObject({ status: "available", overall: { score: 0, maximum: 1_000 } });
    if (result.status !== "available") throw new Error("Expected an available score");
    expect(result.evidence).toEqual([]);
    expect(new Set(result.excludedEvidence.map(({ reason }) => reason))).toEqual(
      new Set([
        "untrusted-issuer",
        "unsupported-schema",
        "expired",
        "not-yet-active",
        "issuer-deactivated",
        "issuer-missing",
        "issuer-ambiguous",
        "malformed-payload",
        "timestamp-mismatch",
        "invalid-claim",
      ]),
    );
  });

  test("returns unavailable when a trusted candidate issuer cannot be resolved", () => {
    const result = scoreReputation({
      claims: readResult([
        githubClaim({ issuerState: { status: "unavailable", reason: "indexer timeout" } }),
      ]),
      evaluatedAt: EVALUATED_AT,
    });

    expect(result).toMatchObject({
      status: "unavailable",
      policyVersion: "vellum.reputation.v6",
      evaluatedAt: EVALUATED_AT,
      error: { code: "issuer-state-unavailable" },
    });
  });

  test("rejects ineligible evidence before an irrelevant issuer lookup failure", () => {
    const unavailable = { status: "unavailable", reason: "indexer timeout" } as const;
    const result = scoreReputation({
      claims: readResult([
        githubClaim({ id: 1, expiresAt: EVALUATED_AT, issuerState: unavailable }),
        githubClaim({ id: 2, payload: { nope: true }, issuerState: unavailable }),
      ]),
      evaluatedAt: EVALUATED_AT,
    });

    expect(result).toMatchObject({ status: "available", overall: { score: 0 } });
    if (result.status !== "available") throw new Error("Expected an available score");
    expect(result.excludedEvidence.map(({ reason }) => reason).sort()).toEqual([
      "expired",
      "malformed-payload",
    ]);
  });

  test("does not let an irrelevant untrusted issuer make the score unavailable", () => {
    const result = scoreReputation({
      claims: readResult([
        githubClaim({
          issuerDid: "did:ckb:untrusted",
          issuerState: { status: "unavailable", reason: "indexer timeout" },
        }),
      ]),
      evaluatedAt: EVALUATED_AT,
    });

    expect(result).toMatchObject({ status: "available", overall: { score: 0 } });
  });

  test("rejects invalid evaluation times and freezes the versioned policy", () => {
    expect(() => scoreReputation({ claims: readResult([]), evaluatedAt: Number.NaN })).toThrow(
      "evaluatedAt must be a non-negative safe integer",
    );
    expect(Object.isFrozen(VELLUM_REPUTATION_POLICY_V6)).toBe(true);
    expect(Object.isFrozen(VELLUM_REPUTATION_POLICY_V6.categories)).toBe(true);
    expect(Object.isFrozen(VELLUM_REPUTATION_POLICY_V6.github)).toBe(true);
    expect(Object.isFrozen(VELLUM_REPUTATION_POLICY_V6.github.artifactRules)).toBe(true);
    expect(Object.isFrozen(VELLUM_REPUTATION_POLICY_V6.identity.tenureBands)).toBe(true);
    expect(Object.isFrozen(VELLUM_REPUTATION_POLICY_V6.discord.communityBands)).toBe(true);
    expect(Object.isFrozen(VELLUM_REPUTATION_POLICY_V6.telegram)).toBe(true);
    expect(Object.isFrozen(VELLUM_REPUTATION_POLICY_V6.bluesky)).toBe(true);
    expect(Object.isFrozen(VELLUM_REPUTATION_POLICY_V6.ckboost)).toBe(true);
    expect(Object.isFrozen(CKBOOST_QUEST_REGISTRY.quests)).toBe(true);
    expect(Object.isFrozen(CKBOOST_VERIFIED_PARTNER)).toBe(true);
    expect(CKBOOST_VERIFIED_PARTNER).toEqual({
      id: "ckboost",
      name: "CKBoost",
      network: "ckb_testnet",
      issuerDid: "did:ckb:tlitdhrdn7wdzmktk3kzhfua3ivpgiq2",
      controllerPolicy: "resolve-live-did",
      verificationSnapshot: {
        didOutput: {
          transactionHash: "0x7b848e46846536c837b9840c52b76de1e5d6cabdd92e59cf0acc21d17fcba2a0",
          outputIndex: 0,
        },
        controllerLock: {
          codeHash: "0xf329effd1c475a2978453c8600e1eaf0bc2087ee093c3ee64cc96ec6847752cb",
          hashType: "type",
          args: "0x12e432ac2d3d5ad95157dca7c85be7865047baa79000",
        },
      },
    });
    expect(Object.isFrozen(CKBOOST_VERIFIED_PARTNER.verificationSnapshot)).toBe(true);
    expect(Object.isFrozen(CKBOOST_VERIFIED_PARTNER.verificationSnapshot.controllerLock)).toBe(
      true,
    );
    expect(VELLUM_REPUTATION_POLICY_V6.ckboost.issuerDids).toEqual([
      CKBOOST_VERIFIED_PARTNER.issuerDid,
    ]);
  });
});
