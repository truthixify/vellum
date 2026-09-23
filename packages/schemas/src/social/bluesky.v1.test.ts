import { describe, expect, test } from "bun:test";

import { hashSchemaManifest } from "../hash";
import {
  BLUESKY_CLAIM_SCHEMA_HASH,
  parseBlueskyClaimPayload,
  blueskyClaimSchemaManifest,
} from "./bluesky.v1";

const payload = {
  did: "did:plc:ewvi7nxzyoun6zhxrhs64oiz",
  handle: "builder.bsky.social",
  profile_url: "https://bsky.app/profile/did:plc:ewvi7nxzyoun6zhxrhs64oiz",
  verified_at: 1_790_000_000,
};

describe("vellum.social.bluesky.v1", () => {
  test("has a reproducible CKB schema hash", () => {
    expect(BLUESKY_CLAIM_SCHEMA_HASH).toMatch(/^0x[0-9a-f]{64}$/);
    expect(hashSchemaManifest(blueskyClaimSchemaManifest)).toBe(BLUESKY_CLAIM_SCHEMA_HASH);
  });

  test("accepts canonical did:plc and did:web account payloads", () => {
    expect(parseBlueskyClaimPayload(payload)).toEqual(payload);
    expect(
      parseBlueskyClaimPayload({
        ...payload,
        did: "did:web:example.com:user:builder",
        profile_url: "https://bsky.app/profile/did:web:example.com:user:builder",
      }),
    ).toMatchObject({ did: "did:web:example.com:user:builder" });
  });

  test("rejects mutable profile mismatches and non-canonical identity data", () => {
    expect(() => parseBlueskyClaimPayload({ ...payload, handle: "Builder.Bsky.Social" })).toThrow();
    expect(() =>
      parseBlueskyClaimPayload({ ...payload, profile_url: "https://bsky.app/profile/other" }),
    ).toThrow();
    expect(() => parseBlueskyClaimPayload({ ...payload, accessJwt: "secret" })).toThrow();
    expect(() => parseBlueskyClaimPayload({ ...payload, did: "did:key:unsupported" })).toThrow();
    expect(() =>
      parseBlueskyClaimPayload({
        ...payload,
        did: "did:web:a",
        profile_url: "https://bsky.app/profile/did:web:a",
      }),
    ).toThrow();
  });
});
