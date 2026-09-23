export { canonicalizeSchemaManifest, hashSchemaManifest } from "./hash.js";
export {
  blueskyIdentitySchema,
  discordCommunitySchema,
  discordIdentitySchema,
  getVellumSchemaDefinition,
  githubContributionSchema,
  githubIdentitySchema,
  telegramCommunitySchema,
  telegramIdentitySchema,
  vellumSchemaRegistry,
  type VellumSchemaDefinition,
  type VellumSchemaId,
} from "./registry.js";
export {
  AT_PROTOCOL_DID_PATTERN,
  BLUESKY_CLAIM_SCHEMA_HASH,
  BLUESKY_CLAIM_SCHEMA_ID,
  BLUESKY_HANDLE_PATTERN,
  blueskyClaimSchemaManifest,
  parseBlueskyClaimPayload,
  type BlueskyClaimPayload,
} from "./social/bluesky.v1.js";
export {
  GITHUB_CLAIM_SCHEMA_HASH,
  GITHUB_CLAIM_SCHEMA_ID,
  githubClaimSchemaManifest,
  parseGithubClaimPayload,
  type GithubClaimPayload,
} from "./social/github.v1.js";
export {
  GITHUB_CONTRIBUTION_ARTIFACT_LIMIT,
  GITHUB_CONTRIBUTION_CLAIM_SCHEMA_HASH,
  GITHUB_CONTRIBUTION_CLAIM_SCHEMA_ID,
  GITHUB_CONTRIBUTION_CLAIM_TTL_SECONDS,
  GITHUB_CONTRIBUTION_WINDOW_SECONDS,
  githubContributionClaimSchemaManifest,
  parseGithubContributionClaimPayload,
  type GithubContributionArtifact,
  type GithubContributionArtifactKind,
  type GithubContributionClaimPayload,
  type GithubContributionClassification,
} from "./contribution/github.v1.js";
export {
  DISCORD_CLAIM_SCHEMA_HASH,
  DISCORD_CLAIM_SCHEMA_ID,
  discordClaimSchemaManifest,
  discordSnowflakeTimestamp,
  parseDiscordClaimPayload,
  type DiscordClaimPayload,
} from "./social/discord.v1.js";
export {
  DISCORD_COMMUNITY_CLAIM_SCHEMA_HASH,
  DISCORD_COMMUNITY_CLAIM_SCHEMA_ID,
  discordCommunityClaimSchemaManifest,
  parseDiscordCommunityClaimPayload,
  type DiscordCommunityClaimPayload,
  type DiscordCommunityMembership,
  type DiscordRecognizedRole,
} from "./community/discord.v1.js";
export {
  TELEGRAM_CLAIM_SCHEMA_HASH,
  TELEGRAM_CLAIM_SCHEMA_ID,
  parseTelegramClaimPayload,
  telegramClaimSchemaManifest,
  type TelegramClaimPayload,
} from "./social/telegram.v1.js";
export {
  TELEGRAM_COMMUNITY_CLAIM_SCHEMA_HASH,
  TELEGRAM_COMMUNITY_CLAIM_SCHEMA_ID,
  TELEGRAM_COMMUNITY_CLAIM_TTL_SECONDS,
  parseTelegramCommunityClaimPayload,
  telegramCommunityClaimSchemaManifest,
  type TelegramCommunityClaimPayload,
  type TelegramCommunityMembership,
  type TelegramCommunityType,
  type TelegramMemberRole,
} from "./community/telegram.v1.js";
