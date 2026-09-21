import {
  DISCORD_CLAIM_SCHEMA_HASH,
  DISCORD_CLAIM_SCHEMA_ID,
  DISCORD_COMMUNITY_CLAIM_SCHEMA_HASH,
  DISCORD_COMMUNITY_CLAIM_SCHEMA_ID,
  GITHUB_CLAIM_SCHEMA_HASH,
  GITHUB_CLAIM_SCHEMA_ID,
} from "@vellum/schemas";

import type { ReputationPolicy, ReputationPolicyV2 } from "./types.js";

const DAY_SECONDS = 86_400;

function freezePolicy<T extends ReputationPolicy>(policy: T): T {
  for (const category of policy.categories) Object.freeze(category);
  for (const band of policy.github.tenureBands) Object.freeze(band);
  for (const band of policy.github.recencyBands) Object.freeze(band);
  Object.freeze(policy.categories);
  Object.freeze(policy.github.issuerDids);
  Object.freeze(policy.github.schema);
  Object.freeze(policy.github.tenureBands);
  Object.freeze(policy.github.recencyBands);
  Object.freeze(policy.github);
  return Object.freeze(policy);
}

export const VELLUM_REPUTATION_POLICY_V1 = freezePolicy({
  version: "vellum.reputation.v1",
  minimum: 0,
  maximum: 1_000,
  categories: [
    { id: "technical", maximum: 300 },
    { id: "contribution", maximum: 300 },
    { id: "community", maximum: 200 },
    { id: "tenure", maximum: 100 },
    { id: "recency", maximum: 100 },
  ],
  github: {
    issuerDids: ["did:ckb:hlvxrdt3e7iwvuxdmbvejp6hc4yoo3no"],
    schema: {
      id: GITHUB_CLAIM_SCHEMA_ID,
      hash: GITHUB_CLAIM_SCHEMA_HASH,
    },
    tenureRuleId: "github-account-tenure.v1",
    recencyRuleId: "github-verification-recency.v1",
    tenureBands: [
      { minimumAgeSeconds: 1_460 * DAY_SECONDS, points: 100 },
      { minimumAgeSeconds: 730 * DAY_SECONDS, points: 80 },
      { minimumAgeSeconds: 365 * DAY_SECONDS, points: 60 },
      { minimumAgeSeconds: 180 * DAY_SECONDS, points: 40 },
      { minimumAgeSeconds: 30 * DAY_SECONDS, points: 20 },
      { minimumAgeSeconds: 0, points: 0 },
    ],
    recencyBands: [
      { maximumAgeSecondsExclusive: 30 * DAY_SECONDS, points: 100 },
      { maximumAgeSecondsExclusive: 90 * DAY_SECONDS, points: 75 },
      { maximumAgeSecondsExclusive: 180 * DAY_SECONDS, points: 50 },
      { maximumAgeSecondsExclusive: 365 * DAY_SECONDS, points: 25 },
    ],
  },
} as const satisfies ReputationPolicy);

function freezePolicyV2<T extends ReputationPolicyV2>(policy: T): T {
  for (const category of policy.categories) Object.freeze(category);
  for (const band of policy.identity.tenureBands) Object.freeze(band);
  for (const band of policy.identity.recencyBands) Object.freeze(band);
  for (const band of policy.discord.communityBands) Object.freeze(band);
  Object.freeze(policy.categories);
  Object.freeze(policy.identity.tenureBands);
  Object.freeze(policy.identity.recencyBands);
  Object.freeze(policy.identity);
  Object.freeze(policy.github.issuerDids);
  Object.freeze(policy.github.schema);
  Object.freeze(policy.github);
  Object.freeze(policy.discord.issuerDids);
  Object.freeze(policy.discord.identitySchema);
  Object.freeze(policy.discord.communitySchema);
  Object.freeze(policy.discord.communityBands);
  Object.freeze(policy.discord);
  return Object.freeze(policy);
}

const IDENTITY_TENURE_BANDS = [
  { minimumAgeSeconds: 1_460 * DAY_SECONDS, points: 100 },
  { minimumAgeSeconds: 730 * DAY_SECONDS, points: 80 },
  { minimumAgeSeconds: 365 * DAY_SECONDS, points: 60 },
  { minimumAgeSeconds: 180 * DAY_SECONDS, points: 40 },
  { minimumAgeSeconds: 30 * DAY_SECONDS, points: 20 },
  { minimumAgeSeconds: 0, points: 0 },
] as const;

const VERIFICATION_RECENCY_BANDS = [
  { maximumAgeSecondsExclusive: 30 * DAY_SECONDS, points: 100 },
  { maximumAgeSecondsExclusive: 90 * DAY_SECONDS, points: 75 },
  { maximumAgeSecondsExclusive: 180 * DAY_SECONDS, points: 50 },
  { maximumAgeSecondsExclusive: 365 * DAY_SECONDS, points: 25 },
] as const;

export const VELLUM_REPUTATION_POLICY_V2 = freezePolicyV2({
  version: "vellum.reputation.v2",
  minimum: 0,
  maximum: 1_000,
  categories: [
    { id: "technical", maximum: 300 },
    { id: "contribution", maximum: 300 },
    { id: "community", maximum: 200 },
    { id: "tenure", maximum: 100 },
    { id: "recency", maximum: 100 },
  ],
  identity: {
    tenureBands: IDENTITY_TENURE_BANDS,
    recencyBands: VERIFICATION_RECENCY_BANDS,
  },
  github: {
    issuerDids: ["did:ckb:hlvxrdt3e7iwvuxdmbvejp6hc4yoo3no"],
    schema: { id: GITHUB_CLAIM_SCHEMA_ID, hash: GITHUB_CLAIM_SCHEMA_HASH },
    tenureRuleId: "github-account-tenure.v2",
    recencyRuleId: "github-verification-recency.v2",
  },
  discord: {
    issuerDids: ["did:ckb:hlvxrdt3e7iwvuxdmbvejp6hc4yoo3no"],
    identitySchema: { id: DISCORD_CLAIM_SCHEMA_ID, hash: DISCORD_CLAIM_SCHEMA_HASH },
    communitySchema: {
      id: DISCORD_COMMUNITY_CLAIM_SCHEMA_ID,
      hash: DISCORD_COMMUNITY_CLAIM_SCHEMA_HASH,
    },
    tenureRuleId: "discord-account-tenure.v2",
    recencyRuleId: "discord-verification-recency.v2",
    communityRuleId: "discord-ckb-membership-tenure.v2",
    communityTtlSeconds: 30 * DAY_SECONDS,
    communityBands: [
      { minimumAgeSeconds: 1_460 * DAY_SECONDS, points: 200 },
      { minimumAgeSeconds: 730 * DAY_SECONDS, points: 160 },
      { minimumAgeSeconds: 365 * DAY_SECONDS, points: 120 },
      { minimumAgeSeconds: 180 * DAY_SECONDS, points: 80 },
      { minimumAgeSeconds: 30 * DAY_SECONDS, points: 40 },
      { minimumAgeSeconds: 0, points: 0 },
    ],
  },
} as const satisfies ReputationPolicyV2);
