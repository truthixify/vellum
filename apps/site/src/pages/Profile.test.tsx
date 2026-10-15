import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { Profile } from "./Profile";

const DID = "did:ckb:fn7u37m7vwerr4ojysgdwwp4mescjtrp";

describe("public profile page", () => {
  test("renders the wallet-free profile lookup as the profile index", () => {
    const html = renderToStaticMarkup(<Profile />);
    expect(html).toContain("Find a public profile");
    expect(html).toContain("did:ckb identifier");
    expect(html).toContain("View profile");
  });

  test("renders deterministic invalid and loading states on direct requests", () => {
    const invalid = renderToStaticMarkup(<Profile invalidPath />);
    expect(invalid).toContain("This is not a valid did:ckb profile");

    const loading = renderToStaticMarkup(<Profile did={DID} />);
    expect(loading).toContain('aria-label="Loading public profile"');
    expect(loading).toContain("Loading identity, Claim Cells, and reputation.");
  });
});
