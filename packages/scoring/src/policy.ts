import { GITHUB_CLAIM_SCHEMA_HASH, GITHUB_CLAIM_SCHEMA_ID } from "@vellum/schemas";

import type { ReputationPolicy } from "./types.js";

const DAY_SECONDS = 86_400;

export const VELLUM_REPUTATION_POLICY_V1 = {
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
} as const satisfies ReputationPolicy;
