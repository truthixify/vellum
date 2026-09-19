import { describe, expect, test } from "bun:test";

import { canonicalizeSchemaManifest } from "./hash";

describe("schema manifest canonicalization", () => {
  test("uses RFC 8785 key ordering and ECMAScript number serialization", () => {
    expect(
      canonicalizeSchemaManifest({
        numbers: [Number("333333333.33333329"), 1e30, 4.5, 2e-3, 1e-27],
        string: '€$\u000f\nA\'B"\\"/',
        literals: [null, true, false],
      }),
    ).toBe(
      `{"literals":[null,true,false],"numbers":[333333333.3333333,1e+30,4.5,0.002,1e-27],"string":"€$\\u000f\\nA'B\\"\\\\\\"/"}`,
    );
  });

  test("rejects values outside the canonical JSON data model", () => {
    expect(() => canonicalizeSchemaManifest({ value: Number.NaN })).toThrow("must be finite");
    expect(() => canonicalizeSchemaManifest({ value: undefined })).toThrow("only JSON values");
    expect(() => canonicalizeSchemaManifest("\ud800")).toThrow("lone surrogates");

    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => canonicalizeSchemaManifest(cyclic)).toThrow("cannot contain cycles");
  });
});
