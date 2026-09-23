import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { ProviderMark, type VerificationProvider } from "./ProviderMark";

const PROVIDERS: VerificationProvider[] = ["github", "discord", "telegram", "bluesky"];

describe("ProviderMark", () => {
  test("renders a distinct, decorative mark for every verification provider", () => {
    const markup = PROVIDERS.map((provider) =>
      renderToStaticMarkup(<ProviderMark provider={provider} size={20} />),
    );

    expect(new Set(markup).size).toBe(PROVIDERS.length);
    for (const icon of markup) {
      expect(icon).toContain('fill="currentColor"');
      expect(icon).toContain('aria-hidden="true"');
      expect(icon).toContain('focusable="false"');
      expect(icon).toContain('width="20"');
      expect(icon).toContain('height="20"');
    }
  });
});
