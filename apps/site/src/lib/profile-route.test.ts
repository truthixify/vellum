import { describe, expect, test } from "bun:test";

import { profilePath, profileRouteFromPath } from "./profile-route";

const DID = "did:ckb:fn7u37m7vwerr4ojysgdwwp4mescjtrp";

describe("public profile route", () => {
  test("round-trips a complete DID through one encoded path segment", () => {
    const path = profilePath(DID);
    expect(path).toBe("/profile/did%3Ackb%3Afn7u37m7vwerr4ojysgdwwp4mescjtrp");
    expect(profileRouteFromPath(path)).toEqual({ kind: "profile", did: DID });
    expect(profileRouteFromPath(`${path}/`)).toEqual({ kind: "profile", did: DID });
  });

  test("recognizes the profile index without accepting extra segments", () => {
    expect(profileRouteFromPath("/profile")).toEqual({ kind: "index" });
    expect(profileRouteFromPath("/profile/")).toEqual({ kind: "index" });
    expect(profileRouteFromPath(`/profile/${encodeURIComponent(DID)}/activity`)).toEqual({
      kind: "invalid",
    });
    expect(profileRouteFromPath("/profiles")).toBeNull();
  });

  test("isolates malformed path encoding", () => {
    expect(profileRouteFromPath("/profile/%E0%A4%A")).toEqual({ kind: "invalid" });
    expect(profileRouteFromPath("/profile//")).toEqual({ kind: "invalid" });
  });
});
