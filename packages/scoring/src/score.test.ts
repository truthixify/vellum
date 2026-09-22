import { describe, expect, test } from "bun:test";
import {
  DISCORD_CLAIM_SCHEMA_HASH,
  DISCORD_COMMUNITY_CLAIM_SCHEMA_HASH,
  GITHUB_CLAIM_SCHEMA_HASH,
  GITHUB_CONTRIBUTION_CLAIM_SCHEMA_HASH,
  TELEGRAM_CLAIM_SCHEMA_HASH,
  TELEGRAM_COMMUNITY_CLAIM_SCHEMA_HASH,
} from "@vellum/schemas";
import type { Claim, ClaimIssuerState, ReadClaimsResult } from "@vellum/sdk";

import { VELLUM_REPUTATION_POLICY_V4 } from "./policy";
import { scoreReputation } from "./score";

const DAY = 86_400;
const EVALUATED_AT = 2_000_000_000;
const TRUSTED_ISSUER = VELLUM_REPUTATION_POLICY_V4.github.issuerDids[0];

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

type GithubContributionClaimOptions = Omit<ClaimOptions, "accountCreatedAt"> & {
  artifacts?: Array<{
    classification?: "ecosystem" | "technical";
    kind?: "merged_pull_request" | "pull_request_review";
    mergedAt?: number;
    occurredAt?: number;
  }>;
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

describe("vellum.reputation.v4", () => {
  test("scores GitHub evidence only for tenure and recency", () => {
    const result = scoreReputation({
      claims: readResult([githubClaim()]),
      evaluatedAt: EVALUATED_AT,
    });

    expect(result).toMatchObject({
      status: "available",
      policyVersion: "vellum.reputation.v4",
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
        { category: "tenure", points: 100, ruleId: "github-account-tenure.v4" },
        { category: "recency", points: 100, ruleId: "github-verification-recency.v4" },
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
      policyVersion: "vellum.reputation.v4",
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
        { category: "technical", points: 60, ruleId: "github-merged-technical-pr.v4" },
        { category: "contribution", points: 60, ruleId: "github-merged-pr.v4" },
        { category: "technical", points: 15, ruleId: "github-technical-review.v4" },
        { category: "contribution", points: 20, ruleId: "github-substantive-review.v4" },
      ],
    });
    expect(
      evidence?.githubContributions?.artifacts.map((artifact) => artifact.contributions),
    ).toEqual([
      [
        { category: "technical", points: 60, ruleId: "github-merged-technical-pr.v4" },
        { category: "contribution", points: 30, ruleId: "github-merged-pr.v4" },
      ],
      [{ category: "contribution", points: 30, ruleId: "github-merged-pr.v4" }],
      [
        { category: "technical", points: 15, ruleId: "github-technical-review.v4" },
        { category: "contribution", points: 10, ruleId: "github-substantive-review.v4" },
      ],
      [{ category: "contribution", points: 10, ruleId: "github-substantive-review.v4" }],
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
      policyVersion: "vellum.reputation.v4",
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
        { category: "community", points: 160, ruleId: "discord-ckb-membership-tenure.v4" },
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
      { category: "tenure", points: 100, ruleId: "github-account-tenure.v4" },
      { category: "recency", points: 100, ruleId: "discord-verification-recency.v4" },
    ]);
  });

  test("uses Telegram for recency without inventing account tenure", () => {
    const result = scoreReputation({
      claims: readResult([telegramClaim()]),
      evaluatedAt: EVALUATED_AT,
    });

    expect(result).toMatchObject({
      status: "available",
      policyVersion: "vellum.reputation.v4",
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
          { category: "recency", points: 100, ruleId: "telegram-verification-recency.v4" },
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
      { category: "tenure", points: 100, ruleId: "github-account-tenure.v4" },
      { category: "recency", points: 100, ruleId: "telegram-verification-recency.v4" },
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
      contributions: [{ category: "community", points: 40, ruleId: "telegram-ckb-membership.v4" }],
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
    ).toEqual([{ category: "community", points: 160, ruleId: "discord-ckb-membership-tenure.v4" }]);
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
      policyVersion: "vellum.reputation.v4",
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
    expect(Object.isFrozen(VELLUM_REPUTATION_POLICY_V4)).toBe(true);
    expect(Object.isFrozen(VELLUM_REPUTATION_POLICY_V4.categories)).toBe(true);
    expect(Object.isFrozen(VELLUM_REPUTATION_POLICY_V4.github)).toBe(true);
    expect(Object.isFrozen(VELLUM_REPUTATION_POLICY_V4.github.artifactRules)).toBe(true);
    expect(Object.isFrozen(VELLUM_REPUTATION_POLICY_V4.identity.tenureBands)).toBe(true);
    expect(Object.isFrozen(VELLUM_REPUTATION_POLICY_V4.discord.communityBands)).toBe(true);
    expect(Object.isFrozen(VELLUM_REPUTATION_POLICY_V4.telegram)).toBe(true);
  });
});
