import { describe, expect, test } from "bun:test";
import { ThemeProvider } from "@vellum/ui";
import { renderToStaticMarkup } from "react-dom/server";

import { SiteShell } from "../components/SiteShell";
import { Home } from "./Home";

const PROFILE_DID = "did:ckb:omdrzidnxy3lrdrwc6bo4sll6zljhuar";
const CLAIM_TRANSACTION = "0x83f547f606bce2d6163e997eff45463f09956725e9217c88c1e97a52e7c3e1f2";

describe("Vellum landing page", () => {
  test("routes each audience to shipped product or public project evidence", () => {
    const html = renderToStaticMarkup(
      <ThemeProvider>
        <SiteShell>
          <Home />
        </SiteShell>
      </ThemeProvider>,
    );

    expect(html).toContain("Portable identity and verifiable reputation on CKB");
    expect(html).toContain(`href="/profile/${encodeURIComponent(PROFILE_DID)}"`);
    expect(html).toContain(
      `href="https://pudge.explorer.nervos.org/transaction/${CLAIM_TRANSACTION}"`,
    );
    expect(html).toContain("Send the Vellum Dashboard Link");
    expect(html).toContain("ckboost.quest.v1");
    expect(html).toContain("vellum.reputation.v7");
    expect(html).toContain("https://github.com/truthixify/vellum/tree/main/docs/schemas");
    expect(html).toContain(
      "https://github.com/truthixify/vellum/tree/main/packages/sdk#read-claims",
    );
    expect(html).toContain("https://github.com/users/truthixify/projects/2");
    expect(html).toContain("https://github.com/truthixify/vellum/issues/new");
    expect(html).toContain(
      "https://talk.nervos.org/t/vellum-extended-from-identity-to-reputation-on-did-ckb/10406",
    );
  });

  test("does not present the former illustrative record as live evidence", () => {
    const html = renderToStaticMarkup(<Home />);

    expect(html).not.toContain("Rae Maddox");
    expect(html).not.toContain("deterministic example record");
    expect(html).not.toContain("Self-declared link");
    expect(html).not.toContain("vellum.reputation.v5");
  });

  test("publishes current production metadata and a large social preview", async () => {
    const index = await Bun.file(`${import.meta.dir}/../../index.html`).text();
    const socialCard = Bun.file(`${import.meta.dir}/../../public/social-card.png`);
    const socialCardHeader = new DataView(await socialCard.arrayBuffer());
    const favicon = Bun.file(`${import.meta.dir}/../../public/favicon.svg`);
    const appleTouchIcon = Bun.file(`${import.meta.dir}/../../public/apple-touch-icon.png`);

    expect(index).toContain("<title>Vellum | Portable identity and reputation on CKB</title>");
    expect(index).toContain('rel="canonical" href="https://usevellum.xyz/"');
    expect(index).toContain('rel="icon" type="image/svg+xml" sizes="any" href="/favicon.svg?v=2"');
    expect(index).toContain(
      'rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png?v=2"',
    );
    expect(index).toContain(
      'property="og:image" content="https://usevellum.xyz/social-card.png?v=3"',
    );
    expect(index).toContain('name="twitter:card" content="summary_large_image"');
    expect(await socialCard.exists()).toBe(true);
    expect(socialCard.size).toBeGreaterThan(20_000);
    expect(socialCardHeader.getUint32(16)).toBe(1_200);
    expect(socialCardHeader.getUint32(20)).toBe(630);
    expect(await favicon.exists()).toBe(true);
    expect(await appleTouchIcon.exists()).toBe(true);
  });
});
