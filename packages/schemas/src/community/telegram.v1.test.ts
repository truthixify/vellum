import { describe, expect, test } from "bun:test";

import { hashSchemaManifest } from "../hash";
import {
  TELEGRAM_COMMUNITY_CLAIM_SCHEMA_HASH,
  parseTelegramCommunityClaimPayload,
  telegramCommunityClaimSchemaManifest,
} from "./telegram.v1";

const payload = {
  user_id: "123456789",
  verified_at: 1_800_000_000,
  memberships: [
    {
      chat_id: "-1009999999999",
      community_name: "Nervos Network",
      community_type: "supergroup" as const,
      member_role: "member" as const,
    },
    {
      chat_id: "-1008888888888",
      community_name: "Nervos Announcements",
      community_type: "channel" as const,
      member_role: "administrator" as const,
    },
  ],
};

describe("vellum.community.telegram.v1", () => {
  test("has a reproducible CKB schema hash", () => {
    expect(TELEGRAM_COMMUNITY_CLAIM_SCHEMA_HASH).toMatch(/^0x[0-9a-f]{64}$/);
    expect(hashSchemaManifest(telegramCommunityClaimSchemaManifest)).toBe(
      TELEGRAM_COMMUNITY_CLAIM_SCHEMA_HASH,
    );
  });

  test("accepts bounded, canonical community evidence", () => {
    expect(parseTelegramCommunityClaimPayload(payload)).toEqual(payload);
  });

  test("rejects private chats, duplicates, unsorted memberships, and unknown data", () => {
    expect(() =>
      parseTelegramCommunityClaimPayload({
        ...payload,
        memberships: [{ ...payload.memberships[0], chat_id: "123456789" }],
      }),
    ).toThrow();
    expect(() =>
      parseTelegramCommunityClaimPayload({
        ...payload,
        memberships: [...payload.memberships].reverse(),
      }),
    ).toThrow();
    expect(() =>
      parseTelegramCommunityClaimPayload({
        ...payload,
        memberships: [payload.memberships[0], payload.memberships[0]],
      }),
    ).toThrow();
    expect(() =>
      parseTelegramCommunityClaimPayload({ ...payload, phone_number: "+2340000000" }),
    ).toThrow();
  });
});
