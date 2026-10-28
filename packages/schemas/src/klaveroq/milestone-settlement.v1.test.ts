import { describe, expect, test } from "bun:test";

import { hashSchemaManifest } from "../hash";
import {
  KLAVEROQ_MILESTONE_SETTLEMENT_CLAIM_SCHEMA_HASH,
  klaveroqMilestoneSettlementClaimSchemaManifest,
  parseKlaveroqMilestoneSettlementClaimPayload,
  type KlaveroqMilestoneSettlementClaimPayload,
} from "./milestone-settlement.v1";

const payload: KlaveroqMilestoneSettlementClaimPayload = {
  engagement_id: `0x${"11".repeat(32)}`,
  milestone_id: `0x${"22".repeat(32)}`,
  delivery_id: `0x${"33".repeat(32)}`,
  milestone_sequence: 2,
  approval_method: "client",
  settled_at: 2_000_000_000,
  settlement_tx_hash: `0x${"44".repeat(32)}`,
};

describe("klaveroq.milestone-settlement.v1", () => {
  test("has a reproducible CKB schema hash and accepts canonical settlement evidence", () => {
    expect(KLAVEROQ_MILESTONE_SETTLEMENT_CLAIM_SCHEMA_HASH).toMatch(/^0x[0-9a-f]{64}$/);
    expect(hashSchemaManifest(klaveroqMilestoneSettlementClaimSchemaManifest)).toBe(
      KLAVEROQ_MILESTONE_SETTLEMENT_CLAIM_SCHEMA_HASH,
    );
    expect(parseKlaveroqMilestoneSettlementClaimPayload(payload)).toEqual(payload);
  });

  test("accepts client and review-timeout approvals at the sequence boundary", () => {
    expect(
      parseKlaveroqMilestoneSettlementClaimPayload({
        ...payload,
        milestone_sequence: 4_294_967_295,
        approval_method: "review_timeout",
      }).approval_method,
    ).toBe("review_timeout");
  });

  test("rejects malformed identifiers, transaction references, and extra data", () => {
    for (const field of [
      "engagement_id",
      "milestone_id",
      "delivery_id",
      "settlement_tx_hash",
    ] as const) {
      expect(() =>
        parseKlaveroqMilestoneSettlementClaimPayload({
          ...payload,
          [field]: `0x${"AA".repeat(32)}`,
        }),
      ).toThrow();
    }
    expect(() =>
      parseKlaveroqMilestoneSettlementClaimPayload({ ...payload, amount: "100" }),
    ).toThrow();
  });

  test("rejects invalid sequence, approval method, and settlement time", () => {
    for (const milestone_sequence of [0, 1.5, 4_294_967_296]) {
      expect(() =>
        parseKlaveroqMilestoneSettlementClaimPayload({ ...payload, milestone_sequence }),
      ).toThrow();
    }
    expect(() =>
      parseKlaveroqMilestoneSettlementClaimPayload({ ...payload, approval_method: "admin" }),
    ).toThrow();
    expect(() =>
      parseKlaveroqMilestoneSettlementClaimPayload({ ...payload, settled_at: 0 }),
    ).toThrow();
    expect(() =>
      parseKlaveroqMilestoneSettlementClaimPayload({
        ...payload,
        settled_at: Number.MAX_SAFE_INTEGER + 1,
      }),
    ).toThrow();
  });
});
