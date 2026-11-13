import { describe, expect, test } from "bun:test";

import { hashSchemaManifest } from "../hash";
import {
  CROWDCELL_CAMPAIGN_FUNDED_CLAIM_SCHEMA_HASH,
  crowdcellCampaignFundedClaimSchemaManifest,
  parseCrowdcellCampaignFundedClaimPayload,
  type CrowdcellCampaignFundedClaimPayload,
} from "./campaign-funded.v1";

const payload: CrowdcellCampaignFundedClaimPayload = {
  campaign_type_id: `0x${"11".repeat(32)}`,
  campaign_title: "CKB Builders Toolkit",
  campaign_creation_tx_hash: `0x${"22".repeat(32)}`,
  finalization_tx_hash: `0x${"33".repeat(32)}`,
  funding_goal: "100000000000",
  total_pledged: "125000000000",
  funded_at: 2_000_000_000,
};

describe("crowdcell.campaign-funded.v1", () => {
  test("has a reproducible CKB schema hash and accepts confirmed funding evidence", () => {
    expect(CROWDCELL_CAMPAIGN_FUNDED_CLAIM_SCHEMA_HASH).toMatch(/^0x[0-9a-f]{64}$/);
    expect(hashSchemaManifest(crowdcellCampaignFundedClaimSchemaManifest)).toBe(
      CROWDCELL_CAMPAIGN_FUNDED_CLAIM_SCHEMA_HASH,
    );
    expect(parseCrowdcellCampaignFundedClaimPayload(payload)).toEqual(payload);
  });

  test("accepts the Uint64 boundary", () => {
    const maximum = "18446744073709551615";
    expect(
      parseCrowdcellCampaignFundedClaimPayload({
        ...payload,
        funding_goal: maximum,
        total_pledged: maximum,
      }).total_pledged,
    ).toBe(maximum);
  });

  test("rejects malformed identifiers, transaction references, and extra data", () => {
    for (const field of [
      "campaign_type_id",
      "campaign_creation_tx_hash",
      "finalization_tx_hash",
    ] as const) {
      expect(() =>
        parseCrowdcellCampaignFundedClaimPayload({
          ...payload,
          [field]: `0x${"AA".repeat(32)}`,
        }),
      ).toThrow();
    }
    expect(() =>
      parseCrowdcellCampaignFundedClaimPayload({ ...payload, backer_count: 4 }),
    ).toThrow();
    expect(() =>
      parseCrowdcellCampaignFundedClaimPayload({
        ...payload,
        finalization_tx_hash: payload.campaign_creation_tx_hash,
      }),
    ).toThrow();
  });

  test("rejects invalid titles, amounts, funding outcomes, and timestamps", () => {
    for (const campaign_title of ["", " padded", "line\nbreak", "x".repeat(201)]) {
      expect(() =>
        parseCrowdcellCampaignFundedClaimPayload({ ...payload, campaign_title }),
      ).toThrow();
    }
    for (const funding_goal of ["0", "01", "-1", "18446744073709551616"]) {
      expect(() =>
        parseCrowdcellCampaignFundedClaimPayload({ ...payload, funding_goal }),
      ).toThrow();
    }
    expect(() =>
      parseCrowdcellCampaignFundedClaimPayload({ ...payload, total_pledged: "99999999999" }),
    ).toThrow();
    expect(() => parseCrowdcellCampaignFundedClaimPayload({ ...payload, funded_at: 0 })).toThrow();
  });
});
