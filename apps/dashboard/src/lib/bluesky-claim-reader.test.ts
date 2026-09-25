import { describe, expect, test } from "bun:test";
import { BLUESKY_CLAIM_SCHEMA_HASH, type BlueskyClaimPayload } from "@vellum/schemas";
import type { Claim, ReadClaimsResult } from "@usevellum/sdk";

import {
  blueskyAccountClaimsFromRead,
  blueskyClaimConfirmationFromRead,
} from "./bluesky-claim-reader";
import type { BlueskySubmission } from "./bluesky-verification";

const submission: BlueskySubmission = {
  subject: "did:ckb:fn7u37m7vwerr4ojysgdwwp4mescjtrp",
  transactionHash: `0x${"11".repeat(32)}`,
  claimId: `0x${"22".repeat(32)}`,
  outputIndex: 1,
  accountDid: "did:plc:ewvi7nxzyoun6zhxrhs64oiz",
  handle: "builder.bsky.social",
};
const payload: BlueskyClaimPayload = {
  did: submission.accountDid,
  handle: submission.handle,
  profile_url: `https://bsky.app/profile/${submission.accountDid}`,
  verified_at: 1_800_000_000,
};

function result(overrides: Partial<Claim> = {}): ReadClaimsResult {
  return {
    invalid: [],
    claims: [
      {
        claimId: submission.claimId,
        schemaHash: BLUESKY_CLAIM_SCHEMA_HASH,
        cell: { outPoint: { txHash: submission.transactionHash, index: 1n } },
        issuerState: { status: "active" },
        issuedAt: 1_800_000_000n,
        payload,
        verification: {
          inclusion: "live",
          issuerAuthorization: "accepted-by-configured-claim-type",
          time: { status: "active", evaluatedAt: 1_800_000_001n },
        },
        ...overrides,
      } as Claim,
    ],
  };
}

describe("Bluesky Claim Cell confirmation", () => {
  test("accepts the exact live claim and public account identity", () => {
    expect(blueskyClaimConfirmationFromRead(result(), submission, 500n)).toEqual({
      state: "confirmed",
      blockNumber: 500n,
      account: payload,
    });
  });

  test("waits for indexing and rejects mismatched or invalid outputs", () => {
    expect(blueskyClaimConfirmationFromRead({ claims: [], invalid: [] }, submission, 500n)).toEqual(
      {
        state: "indexing",
        blockNumber: 500n,
      },
    );
    expect(() =>
      blueskyClaimConfirmationFromRead(result({ schemaHash: `0x${"99".repeat(32)}` }), submission),
    ).toThrow("does not match");

    const invalid = result();
    invalid.invalid.push({
      code: "invalid-claim-data",
      message: "invalid",
      cell: { outPoint: { txHash: submission.transactionHash, index: 1n } } as Claim["cell"],
    });
    expect(() => blueskyClaimConfirmationFromRead(invalid, submission)).toThrow(
      "could not be decoded safely",
    );
  });
});

describe("Bluesky account claim discovery", () => {
  test("returns only the newest active claim for each stable AT Protocol DID", () => {
    const older = result().claims[0];
    const newer = {
      ...older,
      claimId: `0x${"33".repeat(32)}`,
      issuedAt: 1_800_000_100n,
      payload: { ...payload, handle: "new.example.com", verified_at: 1_800_000_100 },
      cell: { outPoint: { txHash: `0x${"44".repeat(32)}`, index: 2n } },
    } as Claim;
    const ignored = {
      ...older,
      claimId: `0x${"55".repeat(32)}`,
      schemaHash: `0x${"66".repeat(32)}`,
    } as Claim;

    expect(blueskyAccountClaimsFromRead({ claims: [older, newer, ignored], invalid: [] })).toEqual([
      {
        account: newer.payload as BlueskyClaimPayload,
        claimId: newer.claimId,
        issuedAt: newer.issuedAt,
        transactionHash: newer.cell.outPoint.txHash,
        outputIndex: 2n,
      },
    ]);
  });

  test("keeps relevant unavailable evidence from appearing disconnected", () => {
    expect(() =>
      blueskyAccountClaimsFromRead(
        result({ issuerState: { status: "unavailable", reason: "indexing" } }),
      ),
    ).toThrow("temporarily unavailable");
    expect(() => blueskyAccountClaimsFromRead(result({ issuedAt: 1_800_000_001n }))).toThrow(
      "does not match its issuance time",
    );
  });
});
