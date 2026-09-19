import { describe, expect, test } from "bun:test";

import { buildReputationShareUrl, reputationCardFilename } from "./reputation-share";

const DID = "did:ckb:fn7u37m7vwerr4ojysgdwwp4mescjtrp";

describe("reputation sharing", () => {
  test("builds a canonical public score URL", () => {
    expect(buildReputationShareUrl(DID, "https://dashboard.usevellum.xyz/anything")).toBe(
      `https://dashboard.usevellum.xyz/reputation?did=${encodeURIComponent(DID)}`,
    );
  });

  test("creates a stable image filename without exposing the full DID", () => {
    expect(reputationCardFilename(DID)).toBe("vellum-reputation-p4mescjtrp.png");
  });

  test("rejects invalid subjects", () => {
    expect(() => buildReputationShareUrl("invalid", "https://dashboard.usevellum.xyz")).toThrow();
  });
});
