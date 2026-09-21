import { describe, expect, test } from "bun:test";

import { hashSchemaManifest } from "../hash";
import {
  DISCORD_COMMUNITY_CLAIM_SCHEMA_HASH,
  discordCommunityClaimSchemaManifest,
  parseDiscordCommunityClaimPayload,
} from "./discord.v1";

const payload = {
  user_id: "80351110224678912",
  verified_at: 1_800_000_000,
  memberships: [
    {
      guild_id: "111111111111111111",
      community_name: "Nervos Community",
      joined_at: 1_700_000_000,
      recognized_roles: [
        { role_id: "222222222222222222", role_name: "Builder" },
        { role_id: "333333333333333333", role_name: "Contributor" },
      ],
    },
  ],
};

describe("vellum.community.discord.v1", () => {
  test("has a reproducible CKB schema hash", () => {
    expect(DISCORD_COMMUNITY_CLAIM_SCHEMA_HASH).toMatch(/^0x[0-9a-f]{64}$/);
    expect(hashSchemaManifest(discordCommunityClaimSchemaManifest)).toBe(
      DISCORD_COMMUNITY_CLAIM_SCHEMA_HASH,
    );
  });

  test("accepts bounded, canonical community evidence", () => {
    expect(parseDiscordCommunityClaimPayload(payload)).toEqual(payload);
  });

  test("rejects duplicate, unsorted, future, and unknown membership data", () => {
    const reversedRoles = [...payload.memberships[0].recognized_roles].reverse();
    expect(() =>
      parseDiscordCommunityClaimPayload({
        ...payload,
        memberships: [{ ...payload.memberships[0], recognized_roles: reversedRoles }],
      }),
    ).toThrow();
    expect(() =>
      parseDiscordCommunityClaimPayload({
        ...payload,
        memberships: [{ ...payload.memberships[0], joined_at: payload.verified_at + 1 }],
      }),
    ).toThrow();
    expect(() =>
      parseDiscordCommunityClaimPayload({ ...payload, memberships: [], extra: true }),
    ).toThrow();
  });
});
