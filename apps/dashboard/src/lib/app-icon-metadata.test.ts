import { describe, expect, test } from "bun:test";

const DASHBOARD_ROOT = new URL("../../", import.meta.url);
const SITE_ROOT = new URL("../../../site/", import.meta.url);

async function bytes(url: URL): Promise<number[]> {
  return Array.from(new Uint8Array(await Bun.file(url).arrayBuffer()));
}

describe("app icon metadata", () => {
  test("uses byte-identical favicon and touch icon assets", async () => {
    await expect(bytes(new URL("public/favicon.svg", SITE_ROOT))).resolves.toEqual(
      await bytes(new URL("public/favicon.svg", DASHBOARD_ROOT)),
    );
    await expect(bytes(new URL("public/apple-touch-icon.png", SITE_ROOT))).resolves.toEqual(
      await bytes(new URL("public/apple-touch-icon.png", DASHBOARD_ROOT)),
    );
  });

  test("uses the same cache version in both app shells", async () => {
    const siteHtml = await Bun.file(new URL("index.html", SITE_ROOT)).text();
    const dashboardHtml = await Bun.file(new URL("index.html", DASHBOARD_ROOT)).text();
    const expectedLinks = ['href="/favicon.svg?v=2"', 'href="/apple-touch-icon.png?v=2"'];

    for (const link of expectedLinks) {
      expect(siteHtml).toContain(link);
      expect(dashboardHtml).toContain(link);
    }
  });
});
