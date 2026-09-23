import { describe, expect, test } from "bun:test";

import { hashSchemaManifest } from "../hash";
import {
  GITHUB_CONTRIBUTION_CLAIM_SCHEMA_HASH,
  GITHUB_CONTRIBUTION_WINDOW_SECONDS,
  githubContributionClaimSchemaManifest,
  parseGithubContributionClaimPayload,
  type GithubContributionClaimPayload,
} from "./github.v1";

const VERIFIED_AT = 2_000_000_000;
const payload: GithubContributionClaimPayload = {
  user_id: 5_830_913,
  login: "truthixify",
  verified_at: VERIFIED_AT,
  window_started_at: VERIFIED_AT - GITHUB_CONTRIBUTION_WINDOW_SECONDS,
  repository_registry: "ckb.public-contributions.v1",
  eligible_artifact_count: 2,
  artifacts: [
    {
      artifact_id: "PR_kwDOLw3gss7mJq5X",
      changed_files: 17,
      classification: "technical",
      kind: "merged_pull_request",
      merge_commit_sha: "f727991ef727991ef727991ef727991ef727991e",
      merged_at: VERIFIED_AT - 100,
      number: 376,
      occurred_at: VERIFIED_AT - 100,
      pull_request_id: "PR_kwDOLw3gss7mJq5X",
      repository: "ckb-devrel/ccc",
      repository_id: "R_kgDOLw3gsg",
      title: "Add did:ckb support",
      url: "https://github.com/ckb-devrel/ccc/pull/376",
    },
    {
      artifact_id: "PRR_kwDOLw3gss7mReview",
      changed_files: 3,
      classification: "ecosystem",
      kind: "pull_request_review",
      merge_commit_sha: "a727991ef727991ef727991ef727991ef727991e",
      merged_at: VERIFIED_AT - 200,
      number: 200,
      occurred_at: VERIFIED_AT - 300,
      pull_request_id: "PR_kwDOLw3gss7mOther",
      repository: "ckb-devrel/ccc",
      repository_id: "R_kgDOLw3gsg",
      title: "Clarify the CCC guide",
      url: "https://github.com/ckb-devrel/ccc/pull/200",
    },
  ],
};

describe("vellum.contribution.github.v1", () => {
  test("has a stable canonical hash and accepts canonical evidence", () => {
    expect(hashSchemaManifest(githubContributionClaimSchemaManifest)).toBe(
      GITHUB_CONTRIBUTION_CLAIM_SCHEMA_HASH,
    );
    expect(parseGithubContributionClaimPayload(payload)).toEqual(payload);
  });

  test("rejects unknown fields, duplicate pulls, and inconsistent references", () => {
    expect(() =>
      parseGithubContributionClaimPayload({ ...payload, access_token: "secret" }),
    ).toThrow();
    expect(() =>
      parseGithubContributionClaimPayload({
        ...payload,
        artifacts: [
          payload.artifacts[0],
          { ...payload.artifacts[1], pull_request_id: payload.artifacts[0].pull_request_id },
        ],
      }),
    ).toThrow();
    expect(() =>
      parseGithubContributionClaimPayload({
        ...payload,
        artifacts: [{ ...payload.artifacts[0], url: "https://example.com/pull/376" }],
      }),
    ).toThrow();
  });

  test("enforces the evidence window, ordering, and artifact cap", () => {
    expect(
      parseGithubContributionClaimPayload({
        ...payload,
        eligible_artifact_count: 1,
        artifacts: [
          {
            ...payload.artifacts[0],
            occurred_at: payload.window_started_at,
            merged_at: payload.window_started_at,
          },
        ],
      }).artifacts[0].occurred_at,
    ).toBe(payload.window_started_at);
    expect(() =>
      parseGithubContributionClaimPayload({
        ...payload,
        window_started_at: payload.window_started_at + 1,
      }),
    ).toThrow();
    expect(() =>
      parseGithubContributionClaimPayload({
        ...payload,
        artifacts: [...payload.artifacts].reverse(),
      }),
    ).toThrow();
    expect(() =>
      parseGithubContributionClaimPayload({
        ...payload,
        artifacts: [
          {
            ...payload.artifacts[0],
            occurred_at: payload.window_started_at - 1,
            merged_at: payload.window_started_at - 1,
          },
        ],
      }),
    ).toThrow();
    const oversizedRepository = `${"a".repeat(40)}/${"b".repeat(100)}`;
    expect(oversizedRepository).toHaveLength(141);
    expect(() =>
      parseGithubContributionClaimPayload({
        ...payload,
        artifacts: [
          {
            ...payload.artifacts[0],
            repository: oversizedRepository,
            url: `https://github.com/${oversizedRepository}/pull/${payload.artifacts[0].number}`,
          },
        ],
      }),
    ).toThrow();
  });
});
