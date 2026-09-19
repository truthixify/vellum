import { describe, expect, test } from "bun:test";

import {
  isVerificationPlatform,
  verificationRequestSchema,
  verifiedClaimSchema,
} from "./contracts";

const SUBJECT_DID = "did:ckb:fn7u37m7vwerr4ojysgdwwp4mescjtrp";
const HASH = `0x${"11".repeat(32)}`;

describe("verification contracts", () => {
  test("accepts did:ckb and arbitrary CKB lock subjects", () => {
    const didRequest = verificationRequestSchema.safeParse({
      version: "1",
      platform: "github",
      subject: { did: SUBJECT_DID },
      proof: {},
    });
    expect(didRequest.success).toBe(true);

    const lockRequest = verificationRequestSchema.safeParse({
      version: "1",
      platform: "discord",
      subject: {
        lock: {
          codeHash: HASH,
          hashType: "type",
          args: "0x1234",
        },
      },
      proof: { code: "one-time" },
    });
    expect(lockRequest.success).toBe(true);
  });

  test("rejects malformed identifiers, unknown fields, and non-JSON proof values", () => {
    expect(
      verificationRequestSchema.safeParse({
        version: "1",
        platform: "github",
        subject: { did: "did:ckb:not-valid" },
        proof: {},
      }).success,
    ).toBe(false);
    expect(
      verificationRequestSchema.safeParse({
        version: "1",
        platform: "github",
        subject: { did: SUBJECT_DID },
        proof: {},
        extra: true,
      }).success,
    ).toBe(false);
    expect(
      verificationRequestSchema.safeParse({
        version: "1",
        platform: "github",
        subject: { did: SUBJECT_DID },
        proof: { score: Number.NaN },
      }).success,
    ).toBe(false);
  });

  test("validates deeply nested JSON without recursive traversal", () => {
    const proof: Record<string, unknown> = {};
    let cursor = proof;
    for (let depth = 0; depth < 5_000; depth += 1) {
      const next: Record<string, unknown> = {};
      cursor.next = next;
      cursor = next;
    }

    expect(
      verificationRequestSchema.safeParse({
        version: "1",
        platform: "github",
        subject: { did: SUBJECT_DID },
        proof,
      }).success,
    ).toBe(true);

    cursor.next = proof;
    expect(
      verificationRequestSchema.safeParse({
        version: "1",
        platform: "github",
        subject: { did: SUBJECT_DID },
        proof,
      }).success,
    ).toBe(false);
  });

  test("requires an expiry later than the issuance timestamp", () => {
    const baseClaim = {
      schema: { id: "vellum.social.github.v1", hash: HASH },
      payload: { login: "builder" },
      issuedAt: 1_700_000_000,
    };
    expect(verifiedClaimSchema.safeParse(baseClaim).success).toBe(true);
    expect(
      verifiedClaimSchema.safeParse({ ...baseClaim, expiresAt: baseClaim.issuedAt }).success,
    ).toBe(false);
  });

  test("recognizes only registered platforms", () => {
    expect(isVerificationPlatform("telegram")).toBe(true);
    expect(isVerificationPlatform("unknown")).toBe(false);
  });
});
