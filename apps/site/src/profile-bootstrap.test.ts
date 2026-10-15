import { describe, expect, test } from "bun:test";

import type { PublicProfileLoad } from "./lib/public-profile-load";
import { preloadProfileRoute } from "./profile-bootstrap";

const DID = "did:ckb:fn7u37m7vwerr4ojysgdwwp4mescjtrp";

describe("public profile bootstrap", () => {
  test("starts only for a direct public profile route", () => {
    const calls: string[] = [];
    const load: PublicProfileLoad = {
      result: Promise.resolve({ status: "invalid" }),
      subscribe: () => () => undefined,
    };
    const preload = (did: string) => {
      calls.push(did);
      return load;
    };

    expect(preloadProfileRoute(`/profile/${encodeURIComponent(DID)}`, preload)).toBe(load);
    expect(preloadProfileRoute("/profile", preload)).toBeUndefined();
    expect(preloadProfileRoute("/", preload)).toBeUndefined();
    expect(calls).toEqual([DID]);
  });
});
