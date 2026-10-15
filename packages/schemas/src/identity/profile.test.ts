import { describe, expect, test } from "bun:test";

import {
  DEFAULT_AVATAR_BASE,
  buildDocument,
  defaultAvatarUrl,
  extractProfile,
  isDefaultAvatar,
  normalizeProfileAvatarUrl,
} from "./profile";

describe("Vellum DID profile service", () => {
  test("round-trips profile fields without replacing other document services", () => {
    const profile = {
      displayName: "Ada",
      avatar: "https://example.com/ada.png",
      bio: "Building on CKB.",
    };
    const document = buildDocument(profile, {
      verificationMethods: { controller: "0x02abcdef" },
      alsoKnownAs: ["at://did:plc:ada"],
      services: {
        notifications: {
          type: "NotificationService",
          endpoint: "https://example.com/notifications",
        },
      },
    });

    expect(extractProfile(document)).toEqual(profile);
    expect(document.services?.notifications).toEqual({
      type: "NotificationService",
      endpoint: "https://example.com/notifications",
    });
    expect(document.verificationMethods).toEqual({ controller: "0x02abcdef" });
    expect(document.alsoKnownAs).toEqual(["at://did:plc:ada"]);
  });

  test("ignores malformed and unrelated profile services", () => {
    expect(extractProfile({})).toEqual({});
    expect(
      extractProfile({
        services: {
          profile: {
            type: "OtherProfile",
            endpoint: "inline",
            displayName: "Not Vellum",
          },
        },
      }),
    ).toEqual({});
    expect(
      extractProfile({
        services: {
          profile: {
            type: "VellumProfile",
            endpoint: "inline",
            displayName: 42,
            avatar: null,
            bio: false,
          },
        },
      }),
    ).toEqual({ displayName: undefined, avatar: undefined, bio: undefined });
  });

  test("only writes a profile service when profile data is present", () => {
    expect(buildDocument({})).toEqual({});
    expect(buildDocument({}, { services: {} })).toEqual({});
  });

  test("derives and recognizes the default avatar URL", () => {
    const did = "did:ckb:example";
    expect(defaultAvatarUrl(did)).toBe(`${DEFAULT_AVATAR_BASE}${did}`);
    expect(isDefaultAvatar(defaultAvatarUrl(did))).toBe(true);
    expect(isDefaultAvatar("https://example.com/avatar.png")).toBe(false);
    expect(isDefaultAvatar(undefined)).toBe(false);
  });

  test("normalizes public avatar URLs and IPFS references", () => {
    expect(normalizeProfileAvatarUrl("ipfs://bafybeigdyrzt/avatar.png")).toBe(
      "https://ipfs.io/ipfs/bafybeigdyrzt/avatar.png",
    );
    expect(normalizeProfileAvatarUrl(" https://example.com/avatar.png#preview ")).toBe(
      "https://example.com/avatar.png",
    );
    expect(normalizeProfileAvatarUrl("javascript:alert(1)")).toBeUndefined();
    expect(normalizeProfileAvatarUrl("https://user:secret@example.com/avatar.png")).toBeUndefined();
    expect(normalizeProfileAvatarUrl("ipfs://")).toBeUndefined();
  });
});
