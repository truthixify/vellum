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
  });

  test("distinguishes unknown documentation paths from other routes", () => {
    expect(docsRouteFromPath("/docs/unknown")).toEqual({ kind: "invalid" });
    expect(docsRouteFromPath("/profile")).toBeNull();
  });
});
