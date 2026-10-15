import { describe, expect, test } from "bun:test";

import { createPublicProfileLoad, type PublicProfileImporter } from "./public-profile-load";
import type { PublicProfileResult, PublicProfileUpdate } from "./public-profile";

const DID = "did:ckb:fn7u37m7vwerr4ojysgdwwp4mescjtrp";

const AVAILABLE: PublicProfileResult = {
  status: "available",
  identity: { did: DID, document: {}, profile: { displayName: "Builder" } },
  claims: { status: "loading" },
  reputation: { status: "loading" },
};

describe("public profile preloader", () => {
  test("starts the module and data load immediately and replays early updates", async () => {
    let imports = 0;
    const importer: PublicProfileImporter = async () => {
      imports += 1;
      return {
        loadPublicProfile: async (_did, _dependencies, onUpdate) => {
          onUpdate?.({ section: "identity", value: AVAILABLE });
          return AVAILABLE;
        },
      };
    };

    const load = createPublicProfileLoad(DID, importer);
    expect(imports).toBe(1);
    expect(await load.result).toBe(AVAILABLE);

    const updates: PublicProfileUpdate[] = [];
    const unsubscribe = load.subscribe((update) => updates.push(update));
    expect(updates).toEqual([{ section: "identity", value: AVAILABLE }]);
    unsubscribe();
  });

  test("settles as unavailable when the profile reader cannot load", async () => {
    const load = createPublicProfileLoad(DID, async () => {
      throw new Error("chunk unavailable");
    });
    await expect(load.result).resolves.toEqual({
      status: "unavailable",
      message: "Vellum could not load the public profile reader.",
    });
  });
});
