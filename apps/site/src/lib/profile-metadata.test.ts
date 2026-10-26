import { describe, expect, test } from "bun:test";

import { renderProfileShell } from "../../middleware";
import { applyProfileMetadata, profileMetadataFromPath } from "./profile-metadata";
import { profilePath } from "./profile-route";

const DID = "did:ckb:fn7u37m7vwerr4ojysgdwwp4mescjtrp";
const SHELL = `<!doctype html>
<html><head>
<meta name="description" content="Home description" />
<link rel="canonical" href="https://usevellum.xyz/" />
<meta property="og:title" content="Home title" />
<meta property="og:description" content="Home description" />
<meta property="og:url" content="https://usevellum.xyz/" />
<meta name="twitter:title" content="Home title" />
<meta name="twitter:description" content="Home description" />
<title>Home title</title>
</head><body></body></html>`;

describe("public profile metadata", () => {
  test("uses an exact canonical URL for a valid profile path", () => {
    const path = profilePath(DID);
    const metadata = profileMetadataFromPath(path);
    const html = applyProfileMetadata(SHELL, metadata);

    expect(metadata.canonicalUrl).toBe(`https://usevellum.xyz${path}`);
    expect(html).toContain(`<link rel="canonical" href="${metadata.canonicalUrl}" />`);
    expect(html).toContain(`<meta property="og:url" content="${metadata.canonicalUrl}" />`);
    expect(html).toContain("<title>Public did:ckb profile | Vellum</title>");
    expect(html).not.toContain('href="https://usevellum.xyz/"');
  });

  test("keeps malformed and index paths on the profile index canonical", () => {
    expect(profileMetadataFromPath("/profile").canonicalUrl).toBe("https://usevellum.xyz/profile");
    expect(profileMetadataFromPath("/profile/not-a-did").canonicalUrl).toBe(
      "https://usevellum.xyz/profile",
    );
    expect(profileMetadataFromPath(`/profile/${DID.toUpperCase()}`).canonicalUrl).toBe(
      "https://usevellum.xyz/profile",
    );
  });

  test("returns rewritten metadata in the initial HTML response", async () => {
    const path = profilePath(DID);
    let shellRequest: Request | undefined;
    const response = await renderProfileShell(
      new Request(`https://usevellum.xyz${path}`, {
        headers: {
          authorization: "Bearer unrelated",
          cookie: "_vercel_jwt=preview-session",
          "x-vercel-protection-bypass": "preview-token",
        },
      }),
      async (input) => {
        shellRequest = input instanceof Request ? input : new Request(input);
        return new Response(SHELL, {
          headers: {
            "content-encoding": "gzip",
            "content-length": String(SHELL.length),
            "content-type": "text/html",
            etag: '"static-shell"',
            "last-modified": "Wed, 14 Oct 2026 12:00:00 GMT",
            "x-shell": "static",
          },
        });
      },
    );

    expect(shellRequest?.url).toBe("https://usevellum.xyz/index.html");
    expect(shellRequest?.redirect).toBe("manual");
    expect(shellRequest?.headers.get("cookie")).toBe("_vercel_jwt=preview-session");
    expect(shellRequest?.headers.get("x-vercel-protection-bypass")).toBe("preview-token");
    expect(shellRequest?.headers.get("authorization")).toBeNull();
    expect(response.headers.get("x-shell")).toBe("static");
    expect(response.headers.get("content-encoding")).toBeNull();
    expect(response.headers.get("content-length")).toBeNull();
    expect(response.headers.get("etag")).toBeNull();
    expect(response.headers.get("last-modified")).toBeNull();
    expect(await response.text()).toContain(
      `<meta property="og:url" content="https://usevellum.xyz${path}" />`,
    );
  });

  test("rewrites every profile tag in the production HTML shell", async () => {
    const shell = await Bun.file(new URL("../../index.html", import.meta.url)).text();
    const path = profilePath(DID);
    const metadata = profileMetadataFromPath(path);
    const html = applyProfileMetadata(shell, metadata);

    expect(html).toContain(`<title>${metadata.title}</title>`);
    expect(html).toContain(`<link rel="canonical" href="${metadata.canonicalUrl}" />`);
    expect(html).toContain(`<meta property="og:url" content="${metadata.canonicalUrl}" />`);
    expect(html).toContain(`<meta property="og:title" content="${metadata.title}" />`);
    expect(html).toContain(`<meta name="twitter:title" content="${metadata.title}" />`);
    expect(html).not.toContain("Vellum - Portable identity and reputation on CKB");
  });

  test("does not return a body for HEAD or accept mutating methods", async () => {
    const fetchShell = async () => new Response(SHELL);
    const head = await renderProfileShell(
      new Request("https://usevellum.xyz/profile", { method: "HEAD" }),
      fetchShell,
    );
    expect(await head.text()).toBe("");

    const post = await renderProfileShell(
      new Request("https://usevellum.xyz/profile", { method: "POST" }),
      fetchShell,
    );
    expect(post.status).toBe(405);
    expect(post.headers.get("allow")).toBe("GET, HEAD");
  });
});
