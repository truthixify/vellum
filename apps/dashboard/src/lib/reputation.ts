import { z } from "zod";
import { GITHUB_CLAIM_SCHEMA_HASH, GITHUB_CLAIM_SCHEMA_ID } from "@vellum/schemas";

import { isDidCkb } from "@/lib/did-ckb";

const ckbHashSchema = z.string().regex(/^0x[0-9a-f]{64}$/);

const claimReferenceSchema = z.object({
  claimId: ckbHashSchema.optional(),
  transactionHash: ckbHashSchema,
  outputIndex: z.number().int().nonnegative(),
});

const categoryIdSchema = z.enum(["technical", "contribution", "community", "tenure", "recency"]);
const categoryMaximums = {
  technical: 300,
  contribution: 300,
  community: 200,
  tenure: 100,
  recency: 100,
} as const;

const contributionSchema = z.object({
  category: categoryIdSchema,
  points: z.number().int().nonnegative(),
  ruleId: z.string().min(1),
});

const availableReputationSchema = z
  .object({
    ok: z.literal(true),
    version: z.literal("1"),
    network: z.literal("ckb_testnet"),
    subject: z.string().refine(isDidCkb),
    status: z.literal("available"),
    policyVersion: z.literal("vellum.reputation.v1"),
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
    evidence: z.array(
      z.object({
        claim: claimReferenceSchema,
        issuerDid: z.string().refine(isDidCkb),
        schemaId: z.literal(GITHUB_CLAIM_SCHEMA_ID),
        schemaHash: z.literal(GITHUB_CLAIM_SCHEMA_HASH),
        issuedAt: z.number().int().nonnegative(),
        account: z
          .object({
            platform: z.literal("github"),
            id: z.number().int().positive(),
            handle: z.string().regex(/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,98}[A-Za-z0-9])?$/),
            profileUrl: z.string().url(),
            createdAt: z.number().int().positive(),
            verifiedAt: z.number().int().positive(),
          })
          .refine(
            (account) =>
              account.profileUrl === `https://github.com/${account.handle}` &&
              account.createdAt <= account.verifiedAt,
          ),
        contributions: z.array(contributionSchema),
      }),
    ),
    excludedEvidence: z.array(
      z.object({
        claim: claimReferenceSchema,
        issuerDid: z.string().optional(),
        schemaHash: z.string().optional(),
        reason: z.enum([
          "additional-account",
          "duplicate-claim",
          "expired",
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
  policyVersion: z.literal("vellum.reputation.v1"),
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
