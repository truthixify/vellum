import { describe, expect, test } from "bun:test";
import { ThemeProvider } from "@vellum/ui";
import { renderToStaticMarkup } from "react-dom/server";

import { SiteShell } from "../components/SiteShell";
import { Transparency } from "./Transparency";

describe("grant transparency page", () => {
  test("publishes funding, delivery, allocation, and contact evidence", () => {
    const html = renderToStaticMarkup(
      <ThemeProvider>
        <SiteShell>
          <Transparency />
        </SiteShell>
      </ThemeProvider>,
    );

    expect(html).toContain("Grant funding and delivery record");
    expect(html).toContain("$7,000");
    expect(html).toContain("$5,250");
    expect(html).toContain("3 of 4");
    expect(html).toContain('<time dateTime="2026-11-21">November 21, 2026</time>');
    expect(html).toContain("64.37% approval");
    expect(html).toContain("242,742,014 CKB");
    expect(html).toContain("Milestone 2");
    expect(html).toContain("Payment recorded on November 17, 2026");
    expect(html).toContain("Development");
    expect(html).toContain("$6,000");
    expect(html).toContain("85.7%");
    expect(html).toContain("Question the record in public");
    expect(html).toContain(
      "https://explorer.nervos.org/transaction/0x8f954193651b18d9ddeda44494f76a3a8d72aaf699b808a785d6e83da69f66a4",
    );
    expect(html).toContain(
      "https://explorer.nervos.org/transaction/0x1d55a5eb7e13e00a37e00d9438a4393e09c4373f475f05c3475188037bc921ee",
    );
    expect(html).toContain(
      "https://explorer.nervos.org/transaction/0x9895440207d47230b87fe7861fd747ef017a75adbc26aa098f0e037f87366833",
    );
  });

  test("preserves the versioned reputation method record", () => {
    const html = renderToStaticMarkup(<Transparency />);

    expect(html).toContain('id="method"');
    expect(html).toContain("vellum.reputation.v7");
    expect(html).toContain("Known limitations");
    expect(html).toContain("https://dashboard.usevellum.xyz/reputation");
  });

  test("uses semantic tables for allocation and policy data", () => {
    const html = renderToStaticMarkup(<Transparency />);

    expect(html.match(/<table/g)).toHaveLength(2);
    expect(html).toContain("<caption");
    expect(html).toContain("Approved grant allocation");
    expect(html).toContain("Current reputation policy");
    expect(html.match(/scope="col"/g)).toHaveLength(7);
    expect(html.match(/scope="row"/g)).toHaveLength(4);
  });
});
