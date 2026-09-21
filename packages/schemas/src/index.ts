export { canonicalizeSchemaManifest, hashSchemaManifest } from "./hash.js";
export {
  GITHUB_CLAIM_SCHEMA_HASH,
  GITHUB_CLAIM_SCHEMA_ID,
  githubClaimSchemaManifest,
  parseGithubClaimPayload,
  type GithubClaimPayload,
} from "./social/github.v1.js";
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
