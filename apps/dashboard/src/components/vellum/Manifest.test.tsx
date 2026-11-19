import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { Manifest } from "./Manifest";

describe("Manifest footer", () => {
  test("omits a default page counter", () => {
    const markup = renderToStaticMarkup(<Manifest>Content</Manifest>);

    expect(markup).toContain("VELLUM · DOCUMENT");
    expect(markup).not.toContain("PAGE 01 / 01");
  });

  test("renders an explicit footer reference", () => {
    const markup = renderToStaticMarkup(<Manifest footerRight="DOC 001">Content</Manifest>);

    expect(markup).toContain("DOC 001");
  });
});
