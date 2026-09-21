import { describe, expect, test } from "bun:test";
import {
  DISCORD_CLAIM_SCHEMA_HASH,
  DISCORD_COMMUNITY_CLAIM_SCHEMA_HASH,
  GITHUB_CLAIM_SCHEMA_HASH,
} from "@vellum/schemas";
import type { Claim, ClaimIssuerState, ReadClaimsResult } from "@vellum/sdk";

import { VELLUM_REPUTATION_POLICY_V2 } from "./policy";
import { scoreReputation } from "./score";

const DAY = 86_400;
const EVALUATED_AT = 2_000_000_000;
const TRUSTED_ISSUER = VELLUM_REPUTATION_POLICY_V2.github.issuerDids[0];

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

function readResult(claims: Claim[], invalid: ReadClaimsResult["invalid"] = []): ReadClaimsResult {
  return { claims, invalid };
}

function categoryScore(
  result: ReturnType<typeof scoreReputation>,
  category: "tenure" | "recency",
): number {
  if (result.status !== "available") throw new Error("Expected an available score");
  return result.categories.find((entry) => entry.id === category)!.score;
}

describe("vellum.reputation.v2", () => {
  test("scores GitHub evidence only for tenure and recency", () => {
    const result = scoreReputation({
      claims: readResult([githubClaim()]),
      evaluatedAt: EVALUATED_AT,
    });

    expect(result).toMatchObject({
      status: "available",
      policyVersion: "vellum.reputation.v2",
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
        { category: "tenure", points: 100, ruleId: "github-account-tenure.v2" },
        { category: "recency", points: 100, ruleId: "github-verification-recency.v2" },
      ],
    });
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
      policyVersion: "vellum.reputation.v2",
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
        { category: "community", points: 160, ruleId: "discord-ckb-membership-tenure.v2" },
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
      { category: "tenure", points: 100, ruleId: "github-account-tenure.v2" },
      { category: "recency", points: 100, ruleId: "discord-verification-recency.v2" },
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
        discordCommunityClaim({ id: 41, userId, issuedAt }),
        discordClaim({ id: 31, userId: otherUserId, accountCreatedAt }),
        discordCommunityClaim({
          id: 42,
          userId: otherUserId,
          issuedAt: issuedAt - 1,
          expiresAt: issuedAt - 1 + 29 * DAY,
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
      policyVersion: "vellum.reputation.v2",
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
    expect(Object.isFrozen(VELLUM_REPUTATION_POLICY_V2)).toBe(true);
    expect(Object.isFrozen(VELLUM_REPUTATION_POLICY_V2.categories)).toBe(true);
    expect(Object.isFrozen(VELLUM_REPUTATION_POLICY_V2.github)).toBe(true);
    expect(Object.isFrozen(VELLUM_REPUTATION_POLICY_V2.identity.tenureBands)).toBe(true);
    expect(Object.isFrozen(VELLUM_REPUTATION_POLICY_V2.discord.communityBands)).toBe(true);
  });
});
