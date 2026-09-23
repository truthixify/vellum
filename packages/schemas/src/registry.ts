import {
  DISCORD_COMMUNITY_CLAIM_SCHEMA_HASH,
  DISCORD_COMMUNITY_CLAIM_SCHEMA_ID,
  discordCommunityClaimSchemaManifest,
} from "./community/discord.v1.js";
import {
  TELEGRAM_COMMUNITY_CLAIM_SCHEMA_HASH,
  TELEGRAM_COMMUNITY_CLAIM_SCHEMA_ID,
  telegramCommunityClaimSchemaManifest,
} from "./community/telegram.v1.js";
import {
  GITHUB_CONTRIBUTION_CLAIM_SCHEMA_HASH,
  GITHUB_CONTRIBUTION_CLAIM_SCHEMA_ID,
  GITHUB_CONTRIBUTION_WINDOW_SECONDS,
  githubContributionClaimSchemaManifest,
} from "./contribution/github.v1.js";
import {
  BLUESKY_CLAIM_SCHEMA_HASH,
  BLUESKY_CLAIM_SCHEMA_ID,
  blueskyClaimSchemaManifest,
} from "./social/bluesky.v1.js";
import {
  DISCORD_CLAIM_SCHEMA_HASH,
  DISCORD_CLAIM_SCHEMA_ID,
  discordClaimSchemaManifest,
} from "./social/discord.v1.js";
import {
  GITHUB_CLAIM_SCHEMA_HASH,
  GITHUB_CLAIM_SCHEMA_ID,
  githubClaimSchemaManifest,
} from "./social/github.v1.js";
import {
  TELEGRAM_CLAIM_SCHEMA_HASH,
  TELEGRAM_CLAIM_SCHEMA_ID,
  telegramClaimSchemaManifest,
} from "./social/telegram.v1.js";

const VERIFIED_AT = 2_000_000_000;

export const githubIdentitySchema = {
  id: GITHUB_CLAIM_SCHEMA_ID,
  hash: GITHUB_CLAIM_SCHEMA_HASH,
  manifest: githubClaimSchemaManifest,
  specification: "docs/schemas/social.github.v1.md",
  manifestFile: "docs/schemas/manifests/vellum.social.github.v1.json",
  example: {
    user_id: 9_000_000_001,
    login: "vellum-builder",
    profile_url: "https://github.com/vellum-builder",
    account_created_at: 1_650_000_000,
    verified_at: 1_780_000_000,
  },
} as const;

export const githubContributionSchema = {
  id: GITHUB_CONTRIBUTION_CLAIM_SCHEMA_ID,
  hash: GITHUB_CONTRIBUTION_CLAIM_SCHEMA_HASH,
  manifest: githubContributionClaimSchemaManifest,
  specification: "docs/schemas/contribution.github.v1.md",
  manifestFile: "docs/schemas/manifests/vellum.contribution.github.v1.json",
  example: {
    user_id: 9_000_000_001,
    login: "vellum-builder",
    verified_at: VERIFIED_AT,
    window_started_at: VERIFIED_AT - GITHUB_CONTRIBUTION_WINDOW_SECONDS,
    repository_registry: "ckb.public-contributions.v1",
    eligible_artifact_count: 1,
    artifacts: [
      {
        artifact_id: "PR_example0001",
        changed_files: 17,
        classification: "technical",
        kind: "merged_pull_request",
        merge_commit_sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        merged_at: VERIFIED_AT - 100,
        number: 42,
        occurred_at: VERIFIED_AT - 100,
        pull_request_id: "PR_example0001",
        repository: "example-org/ckb-toolkit",
        repository_id: "R_example0001",
        title: "Add a CKB integration",
        url: "https://github.com/example-org/ckb-toolkit/pull/42",
      },
    ],
  },
} as const;

export const discordIdentitySchema = {
  id: DISCORD_CLAIM_SCHEMA_ID,
  hash: DISCORD_CLAIM_SCHEMA_HASH,
  manifest: discordClaimSchemaManifest,
  specification: "docs/schemas/social.discord.v1.md",
  manifestFile: "docs/schemas/manifests/vellum.social.discord.v1.json",
  example: {
    user_id: "1174109840998400000",
    username: "vellum-builder",
    profile_url: "https://discord.com/users/1174109840998400000",
    account_created_at: 1_700_000_000,
    verified_at: 1_800_000_000,
  },
} as const;

export const discordCommunitySchema = {
  id: DISCORD_COMMUNITY_CLAIM_SCHEMA_ID,
  hash: DISCORD_COMMUNITY_CLAIM_SCHEMA_HASH,
  manifest: discordCommunityClaimSchemaManifest,
  specification: "docs/schemas/community.discord.v1.md",
  manifestFile: "docs/schemas/manifests/vellum.community.discord.v1.json",
  example: {
    user_id: "1174109840998400000",
    verified_at: 1_800_000_000,
    memberships: [
      {
        guild_id: "1174109840998400001",
        community_name: "Example CKB Community",
        joined_at: 1_710_000_000,
        recognized_roles: [
          { role_id: "1174109840998400002", role_name: "Builder" },
          { role_id: "1174109840998400003", role_name: "Contributor" },
        ],
      },
    ],
  },
} as const;

export const telegramIdentitySchema = {
  id: TELEGRAM_CLAIM_SCHEMA_ID,
  hash: TELEGRAM_CLAIM_SCHEMA_HASH,
  manifest: telegramClaimSchemaManifest,
  specification: "docs/schemas/social.telegram.v1.md",
  manifestFile: "docs/schemas/manifests/vellum.social.telegram.v1.json",
  example: {
    user_id: "1234123412341234123",
    display_name: "Vellum Builder",
    username: "vellum_builder",
    profile_url: "https://t.me/vellum_builder",
    verified_at: 1_780_000_000,
  },
} as const;

export const telegramCommunitySchema = {
  id: TELEGRAM_COMMUNITY_CLAIM_SCHEMA_ID,
  hash: TELEGRAM_COMMUNITY_CLAIM_SCHEMA_HASH,
  manifest: telegramCommunityClaimSchemaManifest,
  specification: "docs/schemas/community.telegram.v1.md",
  manifestFile: "docs/schemas/manifests/vellum.community.telegram.v1.json",
  example: {
    user_id: "1234123412341234123",
    verified_at: 1_800_000_000,
    memberships: [
      {
        chat_id: "-1000000000000000001",
        community_name: "Example CKB Community",
        community_type: "supergroup",
        member_role: "member",
      },
    ],
  },
} as const;

export const blueskyIdentitySchema = {
  id: BLUESKY_CLAIM_SCHEMA_ID,
  hash: BLUESKY_CLAIM_SCHEMA_HASH,
  manifest: blueskyClaimSchemaManifest,
  specification: "docs/schemas/social.bluesky.v1.md",
  manifestFile: "docs/schemas/manifests/vellum.social.bluesky.v1.json",
  example: {
    did: "did:plc:aaaaaaaaaaaaaaaaaaaaaaaa",
    handle: "builder.example.com",
    profile_url: "https://bsky.app/profile/did:plc:aaaaaaaaaaaaaaaaaaaaaaaa",
    verified_at: 1_790_000_000,
  },
} as const;

export const vellumSchemaRegistry = {
  [githubIdentitySchema.id]: githubIdentitySchema,
  [githubContributionSchema.id]: githubContributionSchema,
  [discordIdentitySchema.id]: discordIdentitySchema,
  [discordCommunitySchema.id]: discordCommunitySchema,
  [telegramIdentitySchema.id]: telegramIdentitySchema,
  [telegramCommunitySchema.id]: telegramCommunitySchema,
  [blueskyIdentitySchema.id]: blueskyIdentitySchema,
} as const;

export type VellumSchemaId = keyof typeof vellumSchemaRegistry;
export type VellumSchemaDefinition = (typeof vellumSchemaRegistry)[VellumSchemaId];

export function getVellumSchemaDefinition(schemaId: string): VellumSchemaDefinition | undefined {
  return Object.hasOwn(vellumSchemaRegistry, schemaId)
    ? vellumSchemaRegistry[schemaId as VellumSchemaId]
    : undefined;
}
