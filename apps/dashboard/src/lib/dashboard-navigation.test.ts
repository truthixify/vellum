import { describe, expect, test } from "bun:test";

import {
  MOBILE_MORE_NAVIGATION,
  MOBILE_NAVIGATION,
  PRIMARY_NAVIGATION,
  isDashboardNavItemActive,
} from "./dashboard-navigation";

describe("dashboard navigation", () => {
  test("keeps live destinations in the primary hierarchy", () => {
    expect(PRIMARY_NAVIGATION.map((item) => item.to)).toEqual([
      "/",
      "/my",
      "/verify",
      "/issue",
      "/reputation",
      "/demo/governance",
      "/resolve",
    ]);
    const visiblePaths = [PRIMARY_NAVIGATION, MOBILE_NAVIGATION, MOBILE_MORE_NAVIGATION]
      .flat()
      .map((item) => item.to);
    expect(visiblePaths).toContain("/issue");
    expect(visiblePaths).not.toContain("/activity");
    expect(visiblePaths).toContain("/demo/governance");
  });

  test("keeps identity operations under the Identity destination", () => {
    const identity = PRIMARY_NAVIGATION.find((item) => item.to === "/my");
    expect(identity).toBeDefined();
    expect(isDashboardNavItemActive(identity!, "/rotate")).toBe(true);
    expect(isDashboardNavItemActive(identity!, "/verify/github")).toBe(false);
  });
});
