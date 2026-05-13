import { describe, expect, test } from "bun:test";

import {
  buildDocument,
  decodeDocument,
  defaultAvatarUrl,
  DEFAULT_AVATAR_BASE,
  encodeDocument,
  extractProfile,
  isDefaultAvatar,
  PROFILE_SERVICE_KEY,
  PROFILE_SERVICE_TYPE,
  type DidDocument,
} from "./profile";

const SAMPLE_DID = "did:ckb:qq2m72a2vas4e5ovcpxoedscguuu4nba";

describe("buildDocument", () => {
  test("empty inputs produce an empty document", () => {
    expect(buildDocument({})).toEqual({});
  });

  test("profile fields land under services.profile", () => {
    const doc = buildDocument({
      displayName: "Margot",
      avatar: "https://example.com/a.png",
      bio: "Lab tech",
    });
    expect(doc.services?.[PROFILE_SERVICE_KEY]).toMatchObject({
      type: PROFILE_SERVICE_TYPE,
      endpoint: "inline",
      displayName: "Margot",
      avatar: "https://example.com/a.png",
      bio: "Lab tech",
    });
  });

  test("user-supplied services merge with profile service", () => {
    const doc = buildDocument(
      { displayName: "Margot" },
      {
        services: {
          atproto_pds: {
            type: "AtprotoPersonalDataServer",
            endpoint: "https://pds.example",
          },
        },
      },
    );
    expect(Object.keys(doc.services ?? {})).toEqual(
      expect.arrayContaining(["atproto_pds", PROFILE_SERVICE_KEY]),
    );
  });

  test("alsoKnownAs and verificationMethods only appear when non-empty", () => {
    expect(
      buildDocument({}, { alsoKnownAs: [], verificationMethods: {} }),
    ).toEqual({});
    expect(
      buildDocument({}, { alsoKnownAs: ["at://x"] }).alsoKnownAs,
    ).toEqual(["at://x"]);
    expect(
      buildDocument({}, { verificationMethods: { atproto: "did:key:z" } })
        .verificationMethods,
    ).toEqual({ atproto: "did:key:z" });
  });
});

describe("extractProfile", () => {
  test("reads profile fields out of services.profile", () => {
    const doc: DidDocument = {
      services: {
        [PROFILE_SERVICE_KEY]: {
          type: PROFILE_SERVICE_TYPE,
          endpoint: "inline",
          displayName: "Margot",
          avatar: "https://example.com/a.png",
          bio: "Lab tech",
        },
      },
    };
    expect(extractProfile(doc)).toEqual({
      displayName: "Margot",
      avatar: "https://example.com/a.png",
      bio: "Lab tech",
    });
  });

  test("returns empty profile when service is absent", () => {
    expect(extractProfile({})).toEqual({});
  });

  test("ignores a profile entry with the wrong type", () => {
    const doc: DidDocument = {
      services: {
        [PROFILE_SERVICE_KEY]: {
          type: "SomethingElse",
          endpoint: "inline",
          displayName: "Margot",
        },
      },
    };
    expect(extractProfile(doc)).toEqual({});
  });

  test("ignores non-string profile fields", () => {
    const doc: DidDocument = {
      services: {
        [PROFILE_SERVICE_KEY]: {
          type: PROFILE_SERVICE_TYPE,
          endpoint: "inline",
          displayName: 42 as unknown as string,
        },
      },
    };
    expect(extractProfile(doc).displayName).toBeUndefined();
  });
});

describe("default avatar", () => {
  test("defaultAvatarUrl is the DiceBear pattern keyed on the DID", () => {
    expect(defaultAvatarUrl(SAMPLE_DID)).toBe(
      `${DEFAULT_AVATAR_BASE}${SAMPLE_DID}`,
    );
  });

  test("isDefaultAvatar recognises generated URLs", () => {
    expect(isDefaultAvatar(defaultAvatarUrl(SAMPLE_DID))).toBe(true);
    expect(isDefaultAvatar("https://example.com/a.png")).toBe(false);
    expect(isDefaultAvatar(undefined)).toBe(false);
  });
});

describe("DAG-CBOR round-trip", () => {
  test("decodes back to the original object", () => {
    const original = buildDocument(
      {
        displayName: "Margot",
        avatar: defaultAvatarUrl(SAMPLE_DID),
        bio: "Lab tech",
      },
      {
        alsoKnownAs: ["at://margot.bsky.social"],
        verificationMethods: { atproto: "did:key:zSigningKey" },
      },
    );
    const encoded = encodeDocument(original);
    const decoded = decodeDocument(encoded);
    expect(decoded).toEqual(original);
  });

  test("rejects non-object decoded values", () => {
    // Encode a CBOR array, not a map; decode should throw.
    const arrayBytes = encodeDocument(
      ["nope"] as unknown as DidDocument,
    );
    expect(() => decodeDocument(arrayBytes)).toThrow();
  });
});
