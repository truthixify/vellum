import { describe, expect, test } from "bun:test";
import type { Claim, ReadClaimsResult } from "@vellum/sdk";

import { githubClaimConfirmationFromRead } from "./github-claim-reader";
import type { GithubSubmission } from "./github-verification";

const submission: GithubSubmission = {
  subject: "did:ckb:fn7u37m7vwerr4ojysgdwwp4mescjtrp",
  transactionHash: `0x${"11".repeat(32)}`,
  claimId: `0x${"22".repeat(32)}`,
  outputIndex: 1,
  login: "truthixify",
};
const payload = {
  user_id: 5_830_913,
  login: "truthixify",
  profile_url: "https://github.com/truthixify",
  account_created_at: 1_650_000_000,
  verified_at: 1_800_000_000,
};

function readResult(overrides: Partial<Claim> = {}): ReadClaimsResult {
  return {
    invalid: [],
    claims: [
      {
        claimId: submission.claimId,
        cell: {
          outPoint: { txHash: submission.transactionHash, index: 1n },
        },
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

describe("GitHub Claim Cell confirmation", () => {
  test("accepts the exact live claim with an active issuer and timestamp", () => {
    expect(githubClaimConfirmationFromRead(readResult(), submission, 500n)).toEqual({
      state: "confirmed",
      blockNumber: 500n,
      account: payload,
    });
  });

  test("waits for temporarily unavailable issuer or time state", () => {
    expect(
      githubClaimConfirmationFromRead(
        readResult({ issuerState: { status: "unavailable", reason: "indexing" } }),
        submission,
      ),
    ).toEqual({ state: "indexing", blockNumber: undefined });
    expect(
      githubClaimConfirmationFromRead(
        readResult({
          verification: {
            time: { status: "not-yet-active", evaluatedAt: 1n },
          } as Claim["verification"],
        }),
        submission,
      ),
    ).toEqual({ state: "indexing", blockNumber: undefined });
  });

  test("rejects invalid output evidence and mismatched envelope time", () => {
    const invalid = readResult();
    invalid.invalid.push({
      code: "invalid-claim-data",
      message: "invalid",
      cell: { outPoint: { txHash: submission.transactionHash, index: 1n } } as Claim["cell"],
    });

    expect(() => githubClaimConfirmationFromRead(invalid, submission)).toThrow(
      "could not be decoded safely",
    );
    expect(() =>
      githubClaimConfirmationFromRead(readResult({ issuedAt: 1_800_000_001n }), submission),
    ).toThrow("does not match the callback result");
  });
});
