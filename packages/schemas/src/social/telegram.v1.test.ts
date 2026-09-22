import { describe, expect, test } from "bun:test";

import { hashSchemaManifest } from "../hash";
import {
  TELEGRAM_CLAIM_SCHEMA_HASH,
  parseTelegramClaimPayload,
  telegramClaimSchemaManifest,
} from "./telegram.v1";

const payload = {
  user_id: "1234123412341234123",
  display_name: "Vellum Builder",
  username: "vellum_builder",
  profile_url: "https://t.me/vellum_builder",
  verified_at: 1_780_000_000,
};

describe("vellum.social.telegram.v1", () => {
  test("has a reproducible CKB schema hash", () => {
    expect(TELEGRAM_CLAIM_SCHEMA_HASH).toMatch(/^0x[0-9a-f]{64}$/);
    expect(hashSchemaManifest(telegramClaimSchemaManifest)).toBe(TELEGRAM_CLAIM_SCHEMA_HASH);
  });

  test("accepts public and private Telegram profiles", () => {
    expect(parseTelegramClaimPayload(payload)).toEqual(payload);
    expect(
      parseTelegramClaimPayload({
        user_id: payload.user_id,
        display_name: payload.display_name,
        verified_at: payload.verified_at,
      }),
    ).toEqual({
      user_id: payload.user_id,
      display_name: payload.display_name,
      verified_at: payload.verified_at,
    });
  });

  test("rejects mismatched profiles, unexpected fields, and invalid labels", () => {
    expect(() =>
      parseTelegramClaimPayload({ ...payload, profile_url: "https://t.me/another_user" }),
    ).toThrow();
    expect(() => parseTelegramClaimPayload({ ...payload, username: undefined })).toThrow();
    expect(() => parseTelegramClaimPayload({ ...payload, display_name: " Builder " })).toThrow();
    expect(() => parseTelegramClaimPayload({ ...payload, phone_number: "+2340000000" })).toThrow();
  });
});
