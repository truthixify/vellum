import { z } from "zod";
import {
  AT_PROTOCOL_DID_PATTERN,
  BLUESKY_CLAIM_SCHEMA_HASH,
  BLUESKY_CLAIM_SCHEMA_ID,
  BLUESKY_HANDLE_PATTERN,
  DISCORD_CLAIM_SCHEMA_HASH,
  DISCORD_CLAIM_SCHEMA_ID,
  DISCORD_COMMUNITY_CLAIM_SCHEMA_HASH,
  DISCORD_COMMUNITY_CLAIM_SCHEMA_ID,
  GITHUB_CLAIM_SCHEMA_HASH,
  GITHUB_CLAIM_SCHEMA_ID,
  GITHUB_CONTRIBUTION_ARTIFACT_LIMIT,
  GITHUB_CONTRIBUTION_CLAIM_SCHEMA_HASH,
  GITHUB_CONTRIBUTION_CLAIM_SCHEMA_ID,
  GITHUB_CONTRIBUTION_WINDOW_SECONDS,
  TELEGRAM_CLAIM_SCHEMA_HASH,
  TELEGRAM_CLAIM_SCHEMA_ID,
  TELEGRAM_COMMUNITY_CLAIM_SCHEMA_HASH,
  TELEGRAM_COMMUNITY_CLAIM_SCHEMA_ID,
  discordSnowflakeTimestamp,
} from "@vellum/schemas";

import { isDidCkb } from "@/lib/did-ckb";

const ckbHashSchema = z.string().regex(/^0x[0-9a-f]{64}$/);

const claimReferenceSchema = z
  .object({
    claimId: ckbHashSchema.optional(),
    transactionHash: ckbHashSchema,
    outputIndex: z.number().int().nonnegative(),
  })
  .strict();
const acceptedClaimReferenceSchema = claimReferenceSchema.extend({ claimId: ckbHashSchema });

const categoryIdSchema = z.enum(["technical", "contribution", "community", "tenure", "recency"]);
const categoryMaximums = {
  technical: 300,
  contribution: 300,
  community: 200,
  tenure: 100,
  recency: 100,
} as const;

const contributionSchema = z
  .object({
    category: categoryIdSchema,
    points: z.number().int().nonnegative(),
    ruleId: z.string().min(1),
  })
  .strict();

const githubAccountSchema = z
  .object({
    platform: z.literal("github"),
    id: z.number().int().positive(),
    handle: z.string().regex(/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,98}[A-Za-z0-9])?$/),
    profileUrl: z.string().url(),
    createdAt: z.number().int().positive(),
    verifiedAt: z.number().int().positive(),
  })
  .strict()
  .refine(
    (account) =>
      account.profileUrl === `https://github.com/${account.handle}` &&
      account.createdAt <= account.verifiedAt,
  );

const discordSnowflakeSchema = z.string().regex(/^[1-9][0-9]{16,19}$/);
function hasOnlyLabelCharacters(value: string): boolean {
  return [...value].every((character) => {
    const code = character.codePointAt(0)!;
    return code > 0x1f && code !== 0x7f;
  });
}

function isDiscordUsername(value: string): boolean {
  return [...value].every((character) => {
    const code = character.codePointAt(0)!;
    return code > 0x20 && code !== 0x7f;
  });
}

const discordLabelSchema = z
  .string()
  .min(1)
  .max(100)
  .refine(hasOnlyLabelCharacters)
  .refine((value) => value.trim() === value);
const discordAccountSchema = z
  .object({
    platform: z.literal("discord"),
    id: discordSnowflakeSchema,
    handle: z.string().min(1).max(32).refine(isDiscordUsername),
    profileUrl: z.string().url(),
    createdAt: z.number().int().positive(),
    verifiedAt: z.number().int().positive(),
  })
  .strict()
  .refine((account) => {
    try {
      return (
        account.profileUrl === `https://discord.com/users/${account.id}` &&
        account.createdAt === discordSnowflakeTimestamp(account.id) &&
        account.createdAt <= account.verifiedAt
      );
    } catch {
      return false;
    }
  });

const telegramAccountSchema = z
  .object({
    platform: z.literal("telegram"),
    id: z.string().regex(/^[1-9][0-9]{0,19}$/),
    displayName: z.string().min(1).max(128).refine(hasOnlyLabelCharacters),
    handle: z
      .string()
      .regex(/^[A-Za-z0-9_]{1,32}$/)
      .optional(),
    profileUrl: z.string().url().optional(),
    verifiedAt: z.number().int().positive(),
  })
  .strict()
  .refine(
    (account) =>
      account.displayName.trim() === account.displayName &&
      (account.handle === undefined
        ? account.profileUrl === undefined
        : account.profileUrl === `https://t.me/${account.handle}`),
  );

const blueskyAccountSchema = z
  .object({
    platform: z.literal("bluesky"),
    id: z.string().regex(AT_PROTOCOL_DID_PATTERN),
    handle: z.string().max(253).regex(BLUESKY_HANDLE_PATTERN),
    profileUrl: z.string().url(),
    verifiedAt: z.number().int().positive(),
  })
  .strict()
  .refine((account) => account.profileUrl === `https://bsky.app/profile/${account.id}`);

const discordRoleSchema = z
  .object({
    role_id: discordSnowflakeSchema,
    role_name: discordLabelSchema,
  })
  .strict();

const discordMembershipSchema = z
  .object({
    guild_id: discordSnowflakeSchema,
    community_name: discordLabelSchema,
    joined_at: z.number().int().positive(),
    recognized_roles: z.array(discordRoleSchema).max(32),
  })
  .strict()
  .superRefine((membership, context) => {
    if (
      membership.recognized_roles.some(
        (role, index) =>
          index > 0 &&
          BigInt(membership.recognized_roles[index - 1].role_id) >= BigInt(role.role_id),
      )
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Discord roles must be unique and sorted.",
      });
    }
  });

const discordCommunitySchema = z
  .object({
    memberships: z.array(discordMembershipSchema).min(1).max(16),
  })
  .strict()
  .superRefine((community, context) => {
    if (
      community.memberships.some(
        (membership, index) =>
          index > 0 &&
          BigInt(community.memberships[index - 1].guild_id) >= BigInt(membership.guild_id),
      )
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Discord communities must be unique and sorted.",
      });
    }
  });

const telegramMembershipSchema = z
  .object({
    chat_id: z.string().regex(/^-[1-9][0-9]{0,19}$/),
    community_name: discordLabelSchema,
    community_type: z.enum(["channel", "group", "supergroup"]),
    member_role: z.enum(["administrator", "member", "owner"]),
  })
  .strict();

const telegramCommunitySchema = z
  .object({
    memberships: z.array(telegramMembershipSchema).min(1).max(16),
  })
  .strict()
  .superRefine((community, context) => {
    if (
      community.memberships.some(
        (membership, index) =>
          index > 0 &&
          BigInt(community.memberships[index - 1].chat_id) >= BigInt(membership.chat_id),
      )
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Telegram communities must be unique and sorted.",
      });
    }
  });

const githubNodeIdSchema = z.string().regex(/^[A-Za-z0-9_=-]{4,128}$/);
const githubRepositorySchema = z
  .string()
  .regex(/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38}[A-Za-z0-9])?\/[A-Za-z0-9_.-]{1,100}$/);
const githubContributionArtifactSchema = z
  .object({
    artifact_id: githubNodeIdSchema,
    changed_files: z.number().int().positive().max(3_000),
    classification: z.enum(["ecosystem", "technical"]),
    kind: z.enum(["merged_pull_request", "pull_request_review"]),
    merge_commit_sha: z.string().regex(/^[0-9a-f]{40}$/),
    merged_at: z.number().int().positive(),
    number: z.number().int().positive(),
    occurred_at: z.number().int().positive(),
    pull_request_id: githubNodeIdSchema,
    repository: githubRepositorySchema,
    repository_id: githubNodeIdSchema,
    title: z.string().min(1).max(256),
    url: z.string().url(),
    contributions: z.array(contributionSchema),
  })
  .strict();

type GithubContributionArtifactResponse = z.infer<typeof githubContributionArtifactSchema>;

const githubArtifactRules = {
  "merged_pull_request:technical": [
    {
      category: "technical",
      points: 60,
      ruleId: "github-merged-technical-pr.v5",
    },
    { category: "contribution", points: 30, ruleId: "github-merged-pr.v5" },
  ],
  "merged_pull_request:ecosystem": [
    { category: "contribution", points: 30, ruleId: "github-merged-pr.v5" },
  ],
  "pull_request_review:technical": [
    { category: "technical", points: 15, ruleId: "github-technical-review.v5" },
    { category: "contribution", points: 10, ruleId: "github-substantive-review.v5" },
  ],
  "pull_request_review:ecosystem": [
    { category: "contribution", points: 10, ruleId: "github-substantive-review.v5" },
  ],
} as const;

function githubArtifactContributionsAreConsistent(
  artifacts: readonly GithubContributionArtifactResponse[],
): boolean {
  const awarded = { technical: 0, contribution: 0 };

  return artifacts.every((artifact) => {
    const key = `${artifact.kind}:${artifact.classification}` as keyof typeof githubArtifactRules;
    const expected = githubArtifactRules[key].flatMap((rule) => {
      const points = Math.min(
        rule.points,
        categoryMaximums[rule.category] - awarded[rule.category],
      );
      awarded[rule.category] += points;
      return points > 0 ? [{ category: rule.category, points, ruleId: rule.ruleId }] : [];
    });
    return (
      artifact.contributions.length === expected.length &&
      artifact.contributions.every(
        (contribution, index) =>
          contribution.category === expected[index].category &&
          contribution.points === expected[index].points &&
          contribution.ruleId === expected[index].ruleId,
      )
    );
  });
}

const githubContributionsSchema = z
  .object({
    registryVersion: z.literal("ckb.public-contributions.v1"),
    windowStartedAt: z.number().int().positive(),
    eligibleArtifactCount: z.number().int().positive(),
    artifacts: z
      .array(githubContributionArtifactSchema)
      .min(1)
      .max(GITHUB_CONTRIBUTION_ARTIFACT_LIMIT),
  })
  .strict();

const evidenceFields = {
  claim: acceptedClaimReferenceSchema,
  issuerDid: z.string().refine(isDidCkb),
  issuedAt: z.number().int().nonnegative(),
  contributions: z.array(contributionSchema),
} as const;

const evidenceSchema = z.discriminatedUnion("schemaId", [
  z
    .object({
      ...evidenceFields,
      schemaId: z.literal(GITHUB_CLAIM_SCHEMA_ID),
      schemaHash: z.literal(GITHUB_CLAIM_SCHEMA_HASH),
      account: githubAccountSchema,
    })
    .strict(),
  z
    .object({
      ...evidenceFields,
      schemaId: z.literal(GITHUB_CONTRIBUTION_CLAIM_SCHEMA_ID),
      schemaHash: z.literal(GITHUB_CONTRIBUTION_CLAIM_SCHEMA_HASH),
      account: githubAccountSchema,
      supportingClaims: z.array(acceptedClaimReferenceSchema).length(1),
      githubContributions: githubContributionsSchema,
    })
    .strict(),
  z
    .object({
      ...evidenceFields,
      schemaId: z.literal(DISCORD_CLAIM_SCHEMA_ID),
      schemaHash: z.literal(DISCORD_CLAIM_SCHEMA_HASH),
      account: discordAccountSchema,
    })
    .strict(),
  z
    .object({
      ...evidenceFields,
      schemaId: z.literal(DISCORD_COMMUNITY_CLAIM_SCHEMA_ID),
      schemaHash: z.literal(DISCORD_COMMUNITY_CLAIM_SCHEMA_HASH),
      account: discordAccountSchema,
      supportingClaims: z.array(acceptedClaimReferenceSchema).length(1),
      community: discordCommunitySchema,
    })
    .strict(),
  z
    .object({
      ...evidenceFields,
      schemaId: z.literal(TELEGRAM_CLAIM_SCHEMA_ID),
      schemaHash: z.literal(TELEGRAM_CLAIM_SCHEMA_HASH),
      account: telegramAccountSchema,
    })
    .strict(),
  z
    .object({
      ...evidenceFields,
      schemaId: z.literal(TELEGRAM_COMMUNITY_CLAIM_SCHEMA_ID),
      schemaHash: z.literal(TELEGRAM_COMMUNITY_CLAIM_SCHEMA_HASH),
      account: telegramAccountSchema,
      supportingClaims: z.array(acceptedClaimReferenceSchema).length(1),
      community: telegramCommunitySchema,
    })
    .strict(),
  z
    .object({
      ...evidenceFields,
      schemaId: z.literal(BLUESKY_CLAIM_SCHEMA_ID),
      schemaHash: z.literal(BLUESKY_CLAIM_SCHEMA_HASH),
      account: blueskyAccountSchema,
    })
    .strict(),
]);

const availableReputationSchema = z
  .object({
    ok: z.literal(true),
    version: z.literal("1"),
    network: z.literal("ckb_testnet"),
    subject: z.string().refine(isDidCkb),
    status: z.literal("available"),
    policyVersion: z.literal("vellum.reputation.v5"),
    evaluatedAt: z.number().int().nonnegative(),
    overall: z.object({
      score: z.number().int().nonnegative(),
      maximum: z.literal(1_000),
    }),
    categories: z.array(
      z.object({
        id: categoryIdSchema,
        score: z.number().int().nonnegative(),
        maximum: z.number().int().positive(),
      }),
    ),
    evidence: z.array(evidenceSchema),
    excludedEvidence: z.array(
      z.object({
        claim: claimReferenceSchema,
        issuerDid: z.string().optional(),
        schemaHash: z.string().optional(),
        reason: z.enum([
          "additional-account",
          "duplicate-claim",
          "expired",
          "identity-missing",
          "invalid-claim",
          "issuer-ambiguous",
          "issuer-deactivated",
          "issuer-missing",
          "malformed-payload",
          "not-yet-active",
          "superseded",
          "timestamp-mismatch",
          "unsupported-schema",
          "untrusted-issuer",
        ]),
        message: z.string().min(1),
      }),
    ),
  })
  .superRefine((value, context) => {
    const categoryIds = new Set(value.categories.map((category) => category.id));
    const categoryTotal = value.categories.reduce((sum, category) => sum + category.score, 0);
    const categoryMaximumTotal = value.categories.reduce(
      (sum, category) => sum + category.maximum,
      0,
    );
    const contributionTotals = new Map<string, number>();
    for (const evidence of value.evidence) {
      for (const contribution of evidence.contributions) {
        contributionTotals.set(
          contribution.category,
          (contributionTotals.get(contribution.category) ?? 0) + contribution.points,
        );
      }
    }
    const evidenceByReference = new Map(
      value.evidence.map((evidence) => [
        `${evidence.claim.transactionHash}:${evidence.claim.outputIndex}`,
        evidence,
      ]),
    );
    const communityEvidenceIsConsistent = value.evidence.every((evidence) => {
      if (
        evidence.schemaId !== DISCORD_COMMUNITY_CLAIM_SCHEMA_ID &&
        evidence.schemaId !== TELEGRAM_COMMUNITY_CLAIM_SCHEMA_ID
      ) {
        return true;
      }
      const supporting = evidence.supportingClaims[0];
      const identity = evidenceByReference.get(
        `${supporting.transactionHash}:${supporting.outputIndex}`,
      );
      if (evidence.schemaId === TELEGRAM_COMMUNITY_CLAIM_SCHEMA_ID) {
        const contribution = evidence.contributions[0];
        return (
          identity?.schemaId === TELEGRAM_CLAIM_SCHEMA_ID &&
          identity.claim.claimId === supporting.claimId &&
          identity.account.id === evidence.account.id &&
          (evidence.contributions.length === 0 ||
            (evidence.contributions.length === 1 &&
              contribution.category === "community" &&
              contribution.points === 40 &&
              contribution.ruleId === "telegram-ckb-membership.v5"))
        );
      }
      return (
        identity?.schemaId === DISCORD_CLAIM_SCHEMA_ID &&
        identity.claim.claimId === supporting.claimId &&
        identity.account.id === evidence.account.id &&
        evidence.community.memberships.every(
          (membership) =>
            membership.joined_at >= evidence.account.createdAt &&
            membership.joined_at <= evidence.issuedAt,
        )
      );
    });
    const githubEvidenceIsConsistent = value.evidence.every((evidence) => {
      if (evidence.schemaId !== GITHUB_CONTRIBUTION_CLAIM_SCHEMA_ID) return true;
      const supporting = evidence.supportingClaims[0];
      const identity = evidenceByReference.get(
        `${supporting.transactionHash}:${supporting.outputIndex}`,
      );
      const artifactIds = new Set<string>();
      const pullRequestIds = new Set<string>();
      const artifactTotals = new Map<string, number>();
      let previous: (typeof evidence.githubContributions.artifacts)[number] | undefined;
      const artifactsAreConsistent = evidence.githubContributions.artifacts.every((artifact) => {
        for (const contribution of artifact.contributions) {
          const key = `${contribution.category}:${contribution.ruleId}`;
          artifactTotals.set(key, (artifactTotals.get(key) ?? 0) + contribution.points);
        }
        const ordered =
          !previous ||
          previous.occurred_at > artifact.occurred_at ||
          (previous.occurred_at === artifact.occurred_at &&
            previous.artifact_id < artifact.artifact_id);
        previous = artifact;
        const unique =
          !artifactIds.has(artifact.artifact_id) && !pullRequestIds.has(artifact.pull_request_id);
        artifactIds.add(artifact.artifact_id);
        pullRequestIds.add(artifact.pull_request_id);
        return (
          ordered &&
          unique &&
          artifact.url === `https://github.com/${artifact.repository}/pull/${artifact.number}` &&
          artifact.occurred_at >= evidence.githubContributions.windowStartedAt &&
          artifact.occurred_at <= artifact.merged_at &&
          artifact.merged_at <= evidence.issuedAt &&
          (artifact.kind === "merged_pull_request"
            ? artifact.artifact_id === artifact.pull_request_id &&
              artifact.occurred_at === artifact.merged_at
            : artifact.artifact_id !== artifact.pull_request_id) &&
          artifact.contributions.every(
            (contribution) =>
              contribution.points > 0 &&
              (contribution.category === "technical" || contribution.category === "contribution"),
          )
        );
      });
      const evidenceTotals = new Map<string, number>();
      for (const contribution of evidence.contributions) {
        const key = `${contribution.category}:${contribution.ruleId}`;
        evidenceTotals.set(key, (evidenceTotals.get(key) ?? 0) + contribution.points);
      }
      return (
        identity?.schemaId === GITHUB_CLAIM_SCHEMA_ID &&
        identity.claim.claimId === supporting.claimId &&
        identity.account.id === evidence.account.id &&
        evidence.githubContributions.windowStartedAt ===
          evidence.issuedAt - GITHUB_CONTRIBUTION_WINDOW_SECONDS &&
        evidence.githubContributions.eligibleArtifactCount >=
          evidence.githubContributions.artifacts.length &&
        artifactsAreConsistent &&
        githubArtifactContributionsAreConsistent(evidence.githubContributions.artifacts) &&
        evidenceTotals.size === artifactTotals.size &&
        [...evidenceTotals].every(([key, points]) => artifactTotals.get(key) === points)
      );
    });
    if (
      value.overall.score > value.overall.maximum ||
      value.categories.some((category) => category.score > category.maximum) ||
      value.categories.some((category) => category.maximum !== categoryMaximums[category.id]) ||
      value.categories.some(
        (category) => category.score !== (contributionTotals.get(category.id) ?? 0),
      ) ||
      categoryIds.size !== Object.keys(categoryMaximums).length ||
      categoryMaximumTotal !== value.overall.maximum ||
      categoryTotal !== value.overall.score ||
      evidenceByReference.size !== value.evidence.length ||
      !communityEvidenceIsConsistent ||
      !githubEvidenceIsConsistent ||
      value.evidence.some(
        (evidence) =>
          evidence.issuedAt > value.evaluatedAt || evidence.account.verifiedAt > value.evaluatedAt,
      )
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "The reputation score is internally inconsistent.",
      });
    }
  });

const unavailableReputationSchema = z.object({
  ok: z.literal(false),
  version: z.literal("1"),
  network: z.literal("ckb_testnet"),
  subject: z.string().refine(isDidCkb),
  status: z.literal("unavailable"),
  policyVersion: z.literal("vellum.reputation.v5"),
  evaluatedAt: z.number().int().nonnegative(),
  error: z.object({
    code: z.enum(["issuer-state-unavailable", "claim-read-unavailable"]),
    message: z.string().min(1),
    claim: claimReferenceSchema.optional(),
  }),
});

const errorSchema = z.object({
  ok: z.literal(false),
  version: z.literal("1"),
  error: z.object({
    code: z.enum([
      "invalid_request",
      "method_not_allowed",
      "subject_not_found",
      "service_unavailable",
    ]),
    message: z.string().min(1),
  }),
});

export type AvailableReputation = z.infer<typeof availableReputationSchema>;
export type UnavailableReputation = z.infer<typeof unavailableReputationSchema>;
export type ReputationResponse = AvailableReputation | UnavailableReputation;
export type ReputationCategory = AvailableReputation["categories"][number];

type FetchImplementation = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export class ReputationRequestError extends Error {
  constructor(
    readonly code: "invalid_subject" | "not_found" | "service_unavailable" | "invalid_response",
    message: string,
  ) {
    super(message);
    this.name = "ReputationRequestError";
  }
}

export async function fetchReputation(
  did: string,
  fetchImplementation: FetchImplementation = globalThis.fetch,
): Promise<ReputationResponse> {
  if (!isDidCkb(did)) {
    throw new ReputationRequestError("invalid_subject", "Enter a valid did:ckb identifier.");
  }

  let response: Response;
  try {
    response = await fetchImplementation(`/api/reputation/${encodeURIComponent(did)}`, {
      cache: "no-store",
      headers: { accept: "application/json" },
    });
  } catch {
    throw new ReputationRequestError(
      "service_unavailable",
      "Vellum could not reach the reputation service.",
    );
  }

  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new ReputationRequestError(
      "invalid_response",
      "The reputation service returned an unreadable response.",
    );
  }

  const available = availableReputationSchema.safeParse(value);
  if (available.success) {
    if (!response.ok || available.data.subject !== did) {
      throw new ReputationRequestError(
        "invalid_response",
        "The reputation response did not match the request.",
      );
    }
    return available.data;
  }

  const unavailable = unavailableReputationSchema.safeParse(value);
  if (unavailable.success) {
    if (response.ok || unavailable.data.subject !== did) {
      throw new ReputationRequestError(
        "invalid_response",
        "The reputation response did not match the request.",
      );
    }
    return unavailable.data;
  }

  const requestError = errorSchema.safeParse(value);
  if (requestError.success) {
    const code =
      requestError.data.error.code === "subject_not_found"
        ? "not_found"
        : requestError.data.error.code === "invalid_request"
          ? "invalid_subject"
          : "service_unavailable";
    throw new ReputationRequestError(code, requestError.data.error.message);
  }

  throw new ReputationRequestError(
    "invalid_response",
    "The reputation service returned an unexpected response.",
  );
}
