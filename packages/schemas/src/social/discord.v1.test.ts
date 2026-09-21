import { describe, expect, test } from "bun:test";

import { hashSchemaManifest } from "../hash";
import {
  DISCORD_CLAIM_SCHEMA_HASH,
  discordClaimSchemaManifest,
  discordSnowflakeTimestamp,
  parseDiscordClaimPayload,
} from "./discord.v1";

const payload = {
  user_id: "80351110224678912",
  username: "truthixify",
  profile_url: "https://discord.com/users/80351110224678912",
  account_created_at: 1_439_227_597,
  verified_at: 1_800_000_000,
};

describe("vellum.social.discord.v1", () => {
  test("has a reproducible CKB schema hash", () => {
    expect(DISCORD_CLAIM_SCHEMA_HASH).toMatch(/^0x[0-9a-f]{64}$/);
    expect(hashSchemaManifest(discordClaimSchemaManifest)).toBe(DISCORD_CLAIM_SCHEMA_HASH);
  });

  test("derives account creation from the stable Discord snowflake", () => {
    expect(discordSnowflakeTimestamp(payload.user_id)).toBe(payload.account_created_at);
    expect(parseDiscordClaimPayload(payload)).toEqual(payload);
  });

  test("rejects mutable or inconsistent identity data", () => {
    expect(() => parseDiscordClaimPayload({ ...payload, username: "bad name" })).toThrow();
    expect(() => parseDiscordClaimPayload({ ...payload, account_created_at: 1 })).toThrow();
    expect(() => parseDiscordClaimPayload({ ...payload, extra: true })).toThrow();
  });
});
