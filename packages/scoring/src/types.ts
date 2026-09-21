import type { DiscordCommunityMembership } from "@vellum/schemas";
import type { ReadClaimsResult } from "@vellum/sdk";

export type ReputationCategoryId =
  | "technical"
  | "contribution"
  | "community"
  | "tenure"
  | "recency";

export type ReputationCategoryPolicy = {
  id: ReputationCategoryId;
  maximum: number;
};

export type ReputationAgeBand = {
  minimumAgeSeconds: number;
  points: number;
};

export type ReputationRecencyBand = {
  maximumAgeSecondsExclusive: number;
  points: number;
};

export type ReputationPolicy = {
  version: string;
  minimum: 0;
  maximum: number;
  categories: readonly ReputationCategoryPolicy[];
  github: {
    issuerDids: readonly string[];
    schema: {
      id: string;
      hash: string;
    };
    tenureRuleId: string;
    recencyRuleId: string;
    tenureBands: readonly ReputationAgeBand[];
    recencyBands: readonly ReputationRecencyBand[];
  };
};

export type ReputationPolicyV2 = {
  version: string;
  minimum: 0;
  maximum: number;
  categories: readonly ReputationCategoryPolicy[];
  identity: {
    tenureBands: readonly ReputationAgeBand[];
    recencyBands: readonly ReputationRecencyBand[];
  };
  github: {
    issuerDids: readonly string[];
    schema: { id: string; hash: string };
    tenureRuleId: string;
    recencyRuleId: string;
  };
  discord: {
    issuerDids: readonly string[];
    identitySchema: { id: string; hash: string };
    communitySchema: { id: string; hash: string };
    tenureRuleId: string;
    recencyRuleId: string;
    communityRuleId: string;
    communityTtlSeconds: number;
    communityBands: readonly ReputationAgeBand[];
  };
};

export type ReputationClaimReference = {
  claimId?: string;
  transactionHash: string;
  outputIndex: number;
};

export type ReputationContribution = {
  category: ReputationCategoryId;
  points: number;
  ruleId: string;
};

export type ReputationAccount =
  | {
      platform: "github";
      id: number;
      handle: string;
      profileUrl: string;
      createdAt: number;
      verifiedAt: number;
    }
  | {
      platform: "discord";
      id: string;
      handle: string;
      profileUrl: string;
      createdAt: number;
      verifiedAt: number;
    };

export type ReputationEvidence = {
  claim: ReputationClaimReference;
  supportingClaims?: readonly ReputationClaimReference[];
  issuerDid: string;
  schemaId: string;
  schemaHash: string;
  issuedAt: number;
  account: ReputationAccount;
  community?: {
    memberships: readonly DiscordCommunityMembership[];
  };
  contributions: readonly ReputationContribution[];
};

export type ReputationExclusionReason =
  | "additional-account"
  | "duplicate-claim"
  | "expired"
  | "invalid-claim"
  | "identity-missing"
  | "issuer-ambiguous"
  | "issuer-deactivated"
  | "issuer-missing"
  | "malformed-payload"
  | "not-yet-active"
  | "superseded"
  | "timestamp-mismatch"
  | "unsupported-schema"
  | "untrusted-issuer";

export type ReputationExcludedEvidence = {
  claim: ReputationClaimReference;
  issuerDid?: string;
  schemaHash?: string;
  reason: ReputationExclusionReason;
  message: string;
};

export type ReputationCategoryScore = {
  id: ReputationCategoryId;
  score: number;
  maximum: number;
};

export type AvailableReputationResult = {
  status: "available";
  policyVersion: string;
  evaluatedAt: number;
  overall: {
    score: number;
    maximum: number;
  };
  categories: readonly ReputationCategoryScore[];
  evidence: readonly ReputationEvidence[];
  excludedEvidence: readonly ReputationExcludedEvidence[];
};

export type UnavailableReputationResult = {
  status: "unavailable";
  policyVersion: string;
  evaluatedAt: number;
  error: {
    code: "issuer-state-unavailable" | "claim-read-unavailable";
    message: string;
    claim?: ReputationClaimReference;
  };
};

export type ReputationResult = AvailableReputationResult | UnavailableReputationResult;

export type ScoreReputationInput = {
  claims: ReadClaimsResult;
  evaluatedAt: number;
};
