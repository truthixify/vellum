import { describe, expect, test } from "bun:test";

import { hashSchemaManifest } from "../hash";
import {
  GITHUB_CLAIM_SCHEMA_HASH,
  githubClaimSchemaManifest,
  parseGithubClaimPayload,
} from "./github.v1";

const payload = {
  user_id: 5_830_913,
  login: "truthixify",
  profile_url: "https://github.com/truthixify",
  account_created_at: 1_650_000_000,
  verified_at: 1_780_000_000,
};

describe("vellum.social.github.v1", () => {
  test("has a reproducible CKB schema hash", () => {
    expect(GITHUB_CLAIM_SCHEMA_HASH).toMatch(/^0x[0-9a-f]{64}$/);
    expect(hashSchemaManifest(githubClaimSchemaManifest)).toBe(GITHUB_CLAIM_SCHEMA_HASH);
  });

  test("accepts only the complete canonical payload shape", () => {
    expect(parseGithubClaimPayload(payload)).toEqual(payload);
    expect(() => parseGithubClaimPayload({ ...payload, login: "bad_login" })).toThrow();
    expect(() => parseGithubClaimPayload({ ...payload, extra: true })).toThrow();
    expect(() =>
      parseGithubClaimPayload({ ...payload, account_created_at: payload.verified_at + 1 }),
    ).toThrow();
  });
});
