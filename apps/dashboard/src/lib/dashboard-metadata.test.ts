import { describe, expect, test } from "bun:test";

describe("dashboard metadata", () => {
  test("publishes the current dashboard social preview", async () => {
    const index = await Bun.file(`${import.meta.dir}/../../index.html`).text();
    const socialCard = Bun.file(`${import.meta.dir}/../../public/social-card.png`);
    const socialCardHeader = new DataView(await socialCard.arrayBuffer());
    const socialCardSource = await Bun.file(`${import.meta.dir}/../../public/og.svg`).text();

    expect(index).toContain(
      'property="og:image" content="https://dashboard.usevellum.xyz/social-card.png?v=2"',
    );
    expect(index).toContain(
      'name="twitter:image" content="https://dashboard.usevellum.xyz/social-card.png?v=2"',
    );
    expect(socialCardHeader.getUint32(16)).toBe(1_200);
    expect(socialCardHeader.getUint32(20)).toBe(630);
    expect(socialCardSource).toContain("vellum.reputation.v7");
    expect(socialCardSource).not.toContain("vellum.reputation.v1");
    expect(socialCardSource).not.toContain("TESTNET LIVE");
  });
});
