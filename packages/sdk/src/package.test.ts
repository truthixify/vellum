import { describe, expect, test } from "bun:test";

type PackageManifest = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

const manifest = (await Bun.file(
  new URL("../package.json", import.meta.url),
).json()) as PackageManifest;

describe("SDK package manifest", () => {
  test("shares compatible CCC packages with the consuming application", () => {
    expect(manifest.dependencies?.["@ckb-ccc/core"]).toBeUndefined();
    expect(manifest.dependencies?.["@ckb-ccc/did-ckb"]).toBeUndefined();
    expect(manifest.peerDependencies).toMatchObject({
      "@ckb-ccc/core": "^1.19.1",
      "@ckb-ccc/did-ckb": "^0.2.9",
    });
    expect(manifest.devDependencies).toMatchObject({
      "@ckb-ccc/core": "1.19.1",
      "@ckb-ccc/did-ckb": "0.2.9",
    });
  });
});
