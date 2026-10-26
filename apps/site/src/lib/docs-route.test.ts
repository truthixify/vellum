import { describe, expect, test } from "bun:test";

import { docsRouteFromPath } from "./docs-route";

describe("documentation routes", () => {
  test("maps every published documentation path", () => {
    expect(docsRouteFromPath("/docs")).toEqual({ kind: "page", page: "index" });
    expect(docsRouteFromPath("/docs/builders/")).toEqual({ kind: "page", page: "builders" });
    expect(docsRouteFromPath("/docs/issuers")).toEqual({ kind: "page", page: "issuers" });
    expect(docsRouteFromPath("/docs/integrators")).toEqual({
      kind: "page",
      page: "integrators",
    });
    expect(docsRouteFromPath("/docs/identity")).toEqual({ kind: "page", page: "identity" });
  });

  test("preserves the original identity guide fragments", () => {
    for (const hash of ["#install", "#resolve", "#states", "#profile"]) {
      expect(docsRouteFromPath("/docs", hash)).toEqual({ kind: "page", page: "identity" });
    }
    expect(docsRouteFromPath("/docs", "#choose-path")).toEqual({ kind: "page", page: "index" });
  });

  test("distinguishes unknown documentation paths from other routes", () => {
    expect(docsRouteFromPath("/docs/unknown")).toEqual({ kind: "invalid" });
    expect(docsRouteFromPath("/profile")).toBeNull();
  });
});
