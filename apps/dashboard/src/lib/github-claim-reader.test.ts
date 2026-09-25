import { describe, expect, test } from "bun:test";
import {
  GITHUB_CLAIM_SCHEMA_HASH,
  GITHUB_CONTRIBUTION_CLAIM_SCHEMA_HASH,
  type GithubContributionClaimPayload,
} from "@vellum/schemas";
import type { Claim, ReadClaimsResult } from "@usevellum/sdk";

import {
  githubAccountClaimsFromRead,
  githubClaimConfirmationFromRead,
} from "./github-claim-reader";
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
const contributionClaimId = `0x${"77".repeat(32)}` as `0x${string}`;
const contributionPayload: GithubContributionClaimPayload = {
  user_id: payload.user_id,
  login: payload.login,
  verified_at: payload.verified_at,
  window_started_at: payload.verified_at - 365 * 86_400,
  repository_registry: "ckb.public-contributions.v1",
  eligible_artifact_count: 1,
  artifacts: [
    {
      artifact_id: "PR_kwDOLw3gss7mJq5X",
      changed_files: 17,
      classification: "technical",
      kind: "merged_pull_request",
      merge_commit_sha: "f727991ef727991ef727991ef727991ef727991e",
      merged_at: payload.verified_at - 100,
      number: 376,
      occurred_at: payload.verified_at - 100,
      pull_request_id: "PR_kwDOLw3gss7mJq5X",
      repository: "ckb-devrel/ccc",
      repository_id: "R_kgDOLw3gsg",
      title: "Add did:ckb support",
      url: "https://github.com/ckb-devrel/ccc/pull/376",
    },
  ],
};

function readResult(overrides: Partial<Claim> = {}): ReadClaimsResult {
  return {
    invalid: [],
    claims: [
      {
        claimId: submission.claimId,
        schemaHash: GITHUB_CLAIM_SCHEMA_HASH,
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

function contributionResult(overrides: Partial<Claim> = {}): ReadClaimsResult {
  return {
    invalid: [],
    claims: [
      {
        ...readResult().claims[0],
        claimId: contributionClaimId,
        schemaHash: GITHUB_CONTRIBUTION_CLAIM_SCHEMA_HASH,
        expiresAt: BigInt(payload.verified_at + 30 * 86_400),
        payload: contributionPayload,
        cell: {
          outPoint: { txHash: submission.transactionHash, index: 2n },
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

  test("confirms identity and contribution outputs from the same issuance", () => {
    const dualSubmission: GithubSubmission = {
      ...submission,
      contribution: { claimId: contributionClaimId, outputIndex: 2 },
    };
    const combined: ReadClaimsResult = {
      invalid: [],
      claims: [...readResult().claims, ...contributionResult().claims],
    };

    expect(githubClaimConfirmationFromRead(combined, dualSubmission, 500n)).toEqual({
      state: "confirmed",
      blockNumber: 500n,
      account: payload,
      contribution: contributionPayload,
    });
  });

  test("waits until every submitted output is indexed", () => {
    const dualSubmission: GithubSubmission = {
      ...submission,
      contribution: { claimId: contributionClaimId, outputIndex: 2 },
    };
    expect(githubClaimConfirmationFromRead(readResult(), dualSubmission, 500n)).toEqual({
      state: "indexing",
      blockNumber: 500n,
    });
  });

  test("rejects a contribution output under the wrong schema", () => {
    const dualSubmission: GithubSubmission = {
      ...submission,
      contribution: { claimId: contributionClaimId, outputIndex: 2 },
    };
    const combined: ReadClaimsResult = {
      invalid: [],
      claims: [
        ...readResult().claims,
        ...contributionResult({ schemaHash: GITHUB_CLAIM_SCHEMA_HASH }).claims,
      ],
    };
    expect(() => githubClaimConfirmationFromRead(combined, dualSubmission)).toThrow(
      "unexpected schema",
    );
  });

  test("rejects an identity output under the wrong schema", () => {
    expect(() =>
      githubClaimConfirmationFromRead(
        readResult({ schemaHash: GITHUB_CONTRIBUTION_CLAIM_SCHEMA_HASH }),
        submission,
      ),
    ).toThrow("unexpected schema");
  });

  test("rejects callback claim references that do not match the indexed outputs", () => {
    const dualSubmission: GithubSubmission = {
      ...submission,
      contribution: { claimId: `0x${"99".repeat(32)}`, outputIndex: 2 },
    };
    const combined: ReadClaimsResult = {
      invalid: [],
      claims: [...readResult().claims, ...contributionResult().claims],
    };

    expect(() => githubClaimConfirmationFromRead(combined, dualSubmission)).toThrow(
      "does not match the callback result",
    );
  });

  test("rejects a contribution claim with a nonstandard expiry", () => {
    const dualSubmission: GithubSubmission = {
      ...submission,
      contribution: { claimId: contributionClaimId, outputIndex: 2 },
    };
    const combined: ReadClaimsResult = {
      invalid: [],
      claims: [
        ...readResult().claims,
        ...contributionResult({ expiresAt: BigInt(payload.verified_at + 10) }).claims,
      ],
    };

    expect(() => githubClaimConfirmationFromRead(combined, dualSubmission)).toThrow(
      "does not match the callback result",
    );
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

describe("GitHub account claim discovery", () => {
  test("returns the newest active claim for each GitHub account", () => {
    const older = readResult().claims[0];
    const newerPayload = { ...payload, verified_at: 1_800_000_200 };
    const newer = {
      ...older,
      claimId: `0x${"33".repeat(32)}`,
      issuedAt: 1_800_000_200n,
      payload: newerPayload,
      cell: { outPoint: { txHash: `0x${"44".repeat(32)}`, index: 2n } },
    } as Claim;
    const otherPayload = {
      ...payload,
      user_id: 5_830_914,
      login: "vellum-dev",
      profile_url: "https://github.com/vellum-dev",
      verified_at: 1_800_000_100,
    };
    const other = {
      ...older,
      claimId: `0x${"55".repeat(32)}`,
      issuedAt: 1_800_000_100n,
      payload: otherPayload,
      cell: { outPoint: { txHash: `0x${"66".repeat(32)}`, index: 3n } },
    } as Claim;
    const expired = {
      ...older,
      claimId: `0x${"77".repeat(32)}`,
      verification: {
        ...older.verification,
        time: { status: "expired", evaluatedAt: 1_900_000_000n },
      },
    } as Claim;

    expect(
      githubAccountClaimsFromRead({
        invalid: [],
        claims: [older, expired, other, newer],
      }),
    ).toEqual([
      {
        account: newerPayload,
        claimId: newer.claimId,
        issuedAt: newer.issuedAt,
        transactionHash: newer.cell.outPoint.txHash,
        outputIndex: 2n,
      },
      {
        account: otherPayload,
        claimId: other.claimId,
        issuedAt: other.issuedAt,
        transactionHash: other.cell.outPoint.txHash,
        outputIndex: 3n,
      },
    ]);
  });

  test("keeps an unavailable claim from appearing disconnected", () => {
    expect(() =>
      githubAccountClaimsFromRead(
        readResult({ issuerState: { status: "unavailable", reason: "indexing" } }),
      ),
    ).toThrow("temporarily unavailable");
  });

  test("attaches the newest active contribution evidence to its GitHub account", () => {
    expect(githubAccountClaimsFromRead(readResult(), contributionResult())).toEqual([
      {
        account: payload,
        claimId: submission.claimId,
        issuedAt: 1_800_000_000n,
        transactionHash: submission.transactionHash,
        outputIndex: 1n,
        contribution: {
          contribution: contributionPayload,
          claimId: contributionClaimId,
          issuedAt: 1_800_000_000n,
          expiresAt: BigInt(payload.verified_at + 30 * 86_400),
          transactionHash: submission.transactionHash,
          outputIndex: 2n,
        },
      },
    ]);
  });

  test("rejects a payload timestamp that disagrees with its claim", () => {
    expect(() => githubAccountClaimsFromRead(readResult({ issuedAt: 1_800_000_001n }))).toThrow(
      "does not match its issuance time",
    );
  });

  test("rejects contribution evidence whose expiry disagrees with its policy", () => {
    expect(() =>
      githubAccountClaimsFromRead(
        readResult(),
        contributionResult({ expiresAt: BigInt(payload.verified_at + 10) }),
      ),
    ).toThrow("does not match its envelope");
  });
});
