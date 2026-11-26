import { describe, expect, test } from "bun:test";

import { hashSchemaManifest } from "../hash";
import {
  KWEELA_LEVEL_ACHIEVED_CLAIM_SCHEMA_HASH,
  kweelaLevelAchievedClaimSchemaManifest,
  parseKweelaLevelAchievedClaimPayload,
  type KweelaLevelAchievedClaimPayload,
} from "./level-achieved.v1";

const payload: KweelaLevelAchievedClaimPayload = {
  account_id: "123e4567-e89b-12d3-a456-426614174000",
  profile_slug: "legacy",
  level: 5,
  level_policy_version: "kweela.levels.v1",
};

describe("kweela.level-achieved.v1", () => {
  test("has a reproducible CKB schema hash and accepts canonical level evidence", () => {
    expect(KWEELA_LEVEL_ACHIEVED_CLAIM_SCHEMA_HASH).toMatch(/^0x[0-9a-f]{64}$/);
    expect(hashSchemaManifest(kweelaLevelAchievedClaimSchemaManifest)).toBe(
      KWEELA_LEVEL_ACHIEVED_CLAIM_SCHEMA_HASH,
    );
    expect(parseKweelaLevelAchievedClaimPayload(payload)).toEqual(payload);
  });

  test("accepts the Uint32 level boundary and one-character tokens", () => {
    expect(
      parseKweelaLevelAchievedClaimPayload({
        ...payload,
        profile_slug: "a",
        level: 4_294_967_295,
        level_policy_version: "1",
      }).level,
    ).toBe(4_294_967_295);
  });

  test("rejects malformed account references, tokens, and extra data", () => {
    for (const account_id of [
      "123E4567-E89B-12D3-A456-426614174000",
      "123e4567-e89b-12d3-a456-42661417400",
    ]) {
      expect(() => parseKweelaLevelAchievedClaimPayload({ ...payload, account_id })).toThrow();
    }
    for (const profile_slug of ["", "Legacy", "-legacy", "legacy-", "a".repeat(65)]) {
      expect(() => parseKweelaLevelAchievedClaimPayload({ ...payload, profile_slug })).toThrow();
    }
    for (const level_policy_version of ["", "Kweela.Levels.V1", "v1/levels", "x".repeat(65)]) {
      expect(() =>
        parseKweelaLevelAchievedClaimPayload({ ...payload, level_policy_version }),
      ).toThrow();
    }
    expect(() => parseKweelaLevelAchievedClaimPayload({ ...payload, xp: 500 })).toThrow();
  });

  test("rejects invalid levels", () => {
    for (const level of [0, 1.5, 4_294_967_296]) {
      expect(() => parseKweelaLevelAchievedClaimPayload({ ...payload, level })).toThrow();
    }
  });
});
