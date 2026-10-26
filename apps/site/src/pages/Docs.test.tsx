import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import type { DocsPage } from "../lib/docs-route";
import { Docs } from "./Docs";
import {
  ISSUE_CLAIM_EXAMPLE,
  READ_CLAIMS_EXAMPLE,
  RESOLVE_IDENTITY_EXAMPLE,
} from "./docs-examples";

const PAGE_ANCHORS: Record<DocsPage, readonly string[]> = {
  index: ["choose-path", "record-model", "network-scope", "reference"],
  builders: ["create", "profile", "verify", "score", "share"],
  issuers: ["issuer-identity", "schema", "capacity", "issue", "signer"],
  integrators: ["install", "read", "results", "schemas", "renderers", "trust"],
  identity: ["install", "resolve", "states", "profile"],
};
const PAGES = Object.keys(PAGE_ANCHORS) as DocsPage[];
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
      expect(html).toContain('href="/docs/identity"');
      expect(html).toContain("Vellum SDK");
      expect(html).toContain('aria-label="Sections on this page"');
      expect(html).toContain('aria-label="On this page"');
      expect(html.match(/aria-current="page"/g)).toHaveLength(1);

      const anchors = Array.from(html.matchAll(/href="#([a-z-]+)"/g), (match) => match[1]);
      expect(anchors).toEqual([...PAGE_ANCHORS[page], ...PAGE_ANCHORS[page]]);
      for (const anchor of PAGE_ANCHORS[page]) {
        expect(html).toContain(`id="${anchor}"`);
      }
    }
  });

  test("links each audience to shipped product and protocol destinations", () => {
    const builders = renderToStaticMarkup(<Docs page="builders" />);
    const issuers = renderToStaticMarkup(<Docs page="issuers" />);
    const integrators = renderToStaticMarkup(<Docs page="integrators" />);
    const identity = renderToStaticMarkup(<Docs page="identity" />);

    expect(builders).toContain('href="https://dashboard.usevellum.xyz/claim"');
    expect(builders).toContain('href="https://dashboard.usevellum.xyz/verify"');
    expect(builders).toContain('href="https://dashboard.usevellum.xyz/reputation"');
    expect(builders).toContain('href="/profile"');
    expect(builders).toMatch(/document(?:'|&#x27;)s <code>services\.profile<\/code>/);
    expect(builders).toContain("Open <code>/profile/");
    expect(issuers).toContain("CKB_HASH(JCS(manifest))");
    expect(issuers).toContain("issuerSigner");
    expect(issuers).toContain("Issue a claim");
    expect(integrators).toContain("evaluationTime");
    expect(integrators).toContain("claim.schemaHash");
    expect(integrators).toContain("apps/site/src/components/ClaimRenderer.tsx");
    expect(identity).toContain("resolveDidCkb");
    expect(identity).toContain('href="/resolve"');
    expect(identity).toContain("optional <code>services.profile</code>");
  });

  test("keeps displayed SDK snippets identical to the executable package example", async () => {
    const example = await Bun.file(
      `${import.meta.dir}/../../../../packages/sdk/examples/api.ts`,
    ).text();

    expect(withoutWhitespace(example)).toContain(withoutWhitespace(READ_CLAIMS_EXAMPLE));
    expect(withoutWhitespace(example)).toContain(withoutWhitespace(ISSUE_CLAIM_EXAMPLE));
    expect(withoutWhitespace(example)).toContain(withoutWhitespace(RESOLVE_IDENTITY_EXAMPLE));
  });

  test("provides accessible copy success and failure feedback", () => {
    const html = renderToStaticMarkup(<Docs page="integrators" />);

    expect(html).toContain('aria-label="Copy code"');
    expect(html).toContain('role="status"');
  });

  test("contains no placeholder copy or placeholder destinations", () => {
    const html = PAGES.map((page) => renderToStaticMarkup(<Docs page={page} />)).join("\n");

    expect(html).not.toMatch(/lorem ipsum|TODO|example\.com|href="#"/i);
  });
});
