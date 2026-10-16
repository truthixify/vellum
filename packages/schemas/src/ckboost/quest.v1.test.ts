import { describe, expect, test } from "bun:test";

import { hashSchemaManifest } from "../hash";
import {
  CKBOOST_QUEST_CLAIM_SCHEMA_HASH,
  ckboostQuestClaimSchemaManifest,
  parseCkboostQuestClaimPayload,
  type CkboostQuestClaimPayload,
} from "./quest.v1";

const payload: CkboostQuestClaimPayload = {
  campaign_type_id: `0x${"11".repeat(32)}`,
  campaign_title: "Build on CKB",
  quest_id: 7,
  quest_title: "Ship a CKB integration",
  ckboost_user_type_id: `0x${"22".repeat(32)}`,
  completed_at: 2_000_000_000,
  approval_tx_hash: `0x${"33".repeat(32)}`,
  reward_claim_tx_hash: `0x${"44".repeat(32)}`,
  points_awarded: "250",
};

describe("ckboost.quest.v1", () => {
  test("has a reproducible CKB schema hash and accepts canonical completion evidence", () => {
    expect(CKBOOST_QUEST_CLAIM_SCHEMA_HASH).toMatch(/^0x[0-9a-f]{64}$/);
    expect(hashSchemaManifest(ckboostQuestClaimSchemaManifest)).toBe(
      CKBOOST_QUEST_CLAIM_SCHEMA_HASH,
    );
    expect(parseCkboostQuestClaimPayload(payload)).toEqual(payload);
  });

  test("accepts the CKBoost identifier and points boundaries", () => {
    expect(
      parseCkboostQuestClaimPayload({
        ...payload,
        quest_id: 0,
        points_awarded: "0",
      }).quest_id,
    ).toBe(0);
    expect(
      parseCkboostQuestClaimPayload({
        ...payload,
        quest_id: 4_294_967_295,
        points_awarded: "340282366920938463463374607431768211455",
      }).points_awarded,
    ).toBe("340282366920938463463374607431768211455");
  });

  test("rejects malformed identifiers, transaction references, and extra data", () => {
    for (const field of [
      "campaign_type_id",
      "ckboost_user_type_id",
      "approval_tx_hash",
      "reward_claim_tx_hash",
    ] as const) {
      expect(() =>
        parseCkboostQuestClaimPayload({ ...payload, [field]: `0x${"AA".repeat(32)}` }),
      ).toThrow();
    }
    expect(() =>
      parseCkboostQuestClaimPayload({
        ...payload,
        reward_claim_tx_hash: payload.approval_tx_hash,
      }),
    ).toThrow();
    expect(() => parseCkboostQuestClaimPayload({ ...payload, issuer_key: "secret" })).toThrow();
  });

  test("rejects invalid quest IDs and non-canonical Uint128 values", () => {
    for (const quest_id of [-1, 1.5, 4_294_967_296]) {
      expect(() => parseCkboostQuestClaimPayload({ ...payload, quest_id })).toThrow();
    }
    for (const points_awarded of ["00", "+1", "1.5", "340282366920938463463374607431768211456"]) {
      expect(() => parseCkboostQuestClaimPayload({ ...payload, points_awarded })).toThrow();
    }
  });

  test("rejects unsafe timestamps and unsafe display text", () => {
    expect(() => parseCkboostQuestClaimPayload({ ...payload, completed_at: 0 })).toThrow();
    expect(() => parseCkboostQuestClaimPayload({ ...payload, completed_at: 1.5 })).toThrow();
    expect(() =>
      parseCkboostQuestClaimPayload({ ...payload, completed_at: Number.MAX_SAFE_INTEGER + 1 }),
    ).toThrow();
    expect(() =>
      parseCkboostQuestClaimPayload({ ...payload, quest_title: "Quest\nname" }),
    ).toThrow();
    expect(() =>
      parseCkboostQuestClaimPayload({ ...payload, campaign_title: ` ${payload.campaign_title}` }),
    ).toThrow();
    expect(() =>
      parseCkboostQuestClaimPayload({ ...payload, quest_title: "q".repeat(161) }),
    ).toThrow();
  });
});
