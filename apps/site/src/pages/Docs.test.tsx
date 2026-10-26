import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import type { DocsPage } from "../lib/docs-route";
import { Docs } from "./Docs";
import { ISSUE_CLAIM_EXAMPLE, READ_CLAIMS_EXAMPLE } from "./docs-examples";

const PAGES: readonly DocsPage[] = ["index", "builders", "issuers", "integrators"];
const withoutWhitespace = (value: string) => value.replaceAll(/\s/g, "");

describe("documentation site", () => {
  test("publishes persistent navigation and valid section anchors on every page", () => {
    for (const page of PAGES) {
      const html = renderToStaticMarkup(<Docs page={page} />);

      expect(html).toContain('aria-label="Documentation guides"');
      expect(html).toContain('href="/docs"');
      expect(html).toContain('href="/docs/builders"');
      expect(html).toContain('href="/docs/issuers"');
      expect(html).toContain('href="/docs/integrators"');

      for (const match of html.matchAll(/href="#([a-z-]+)"/g)) {
        expect(html).toContain(`id="${match[1]}"`);
      }
    }
  });

  test("links each audience to shipped product and protocol destinations", () => {
    const builders = renderToStaticMarkup(<Docs page="builders" />);
    const issuers = renderToStaticMarkup(<Docs page="issuers" />);
    const integrators = renderToStaticMarkup(<Docs page="integrators" />);

    expect(builders).toContain('href="https://dashboard.usevellum.xyz/claim"');
    expect(builders).toContain('href="https://dashboard.usevellum.xyz/verify"');
    expect(builders).toContain('href="https://dashboard.usevellum.xyz/reputation"');
    expect(builders).toContain('href="/profile"');
    expect(issuers).toContain("CKB_HASH(JCS(manifest))");
    expect(issuers).toContain("issuerSigner");
    expect(integrators).toContain("evaluationTime");
    expect(integrators).toContain("claim.schemaHash");
    expect(integrators).toContain("apps/site/src/components/ClaimRenderer.tsx");
  });

  test("keeps displayed SDK snippets identical to the executable package example", async () => {
    const example = await Bun.file(
      `${import.meta.dir}/../../../../packages/sdk/examples/api.ts`,
    ).text();

    expect(withoutWhitespace(example)).toContain(withoutWhitespace(READ_CLAIMS_EXAMPLE));
    expect(withoutWhitespace(example)).toContain(withoutWhitespace(ISSUE_CLAIM_EXAMPLE));
  });

  test("contains no placeholder copy or placeholder destinations", () => {
    const html = PAGES.map((page) => renderToStaticMarkup(<Docs page={page} />)).join("\n");

    expect(html).not.toMatch(/lorem ipsum|TODO|example\.com|href="#"/i);
  });
});
