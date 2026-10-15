import { describe, expect, test } from "bun:test";

import { handleAvatarRequest } from "../../server/avatar";
import { publicAvatarUrl } from "./avatar";

const PUBLIC_DNS = async () => [{ address: "93.184.216.34", family: 4 }];

describe("public profile avatars", () => {
  test("routes HTTPS and IPFS avatars through the same-origin proxy", () => {
    expect(publicAvatarUrl("https://images.usevellum.xyz/avatar.png")).toBe(
      "/api/avatar?url=https%3A%2F%2Fimages.usevellum.xyz%2Favatar.png",
    );
    expect(publicAvatarUrl("ipfs://bafybeigdyrzt/avatar.png")).toBe(
      "/api/avatar?url=https%3A%2F%2Fipfs.io%2Fipfs%2Fbafybeigdyrzt%2Favatar.png",
    );
    expect(publicAvatarUrl("javascript:alert(1)")).toBeUndefined();
  });

  test("returns a bounded raster image with defensive response headers", async () => {
    let remoteUrl = "";
    let remoteAddress = "";
    const response = await handleAvatarRequest(
      new Request(
        "https://usevellum.xyz/api/avatar?url=https%3A%2F%2Fimages.usevellum.xyz%2Favatar.png",
      ),
      async (input, address) => {
        remoteUrl = String(input);
        remoteAddress = address.address;
        return new Response(new Uint8Array([137, 80, 78, 71]), {
          headers: { "content-type": "image/png", "content-length": "4" },
        });
      },
      PUBLIC_DNS,
    );

    expect(remoteUrl).toBe("https://images.usevellum.xyz/avatar.png");
    expect(remoteAddress).toBe("93.184.216.34");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([137, 80, 78, 71]));
  });

  test("blocks local targets and redirects before requesting them", async () => {
    const local = await handleAvatarRequest(
      new Request("https://usevellum.xyz/api/avatar?url=http%3A%2F%2F127.0.0.1%2Favatar.png"),
      async () => new Response(),
      PUBLIC_DNS,
    );
    expect(local.status).toBe(400);

    let requests = 0;
    const redirected = await handleAvatarRequest(
      new Request(
        "https://usevellum.xyz/api/avatar?url=https%3A%2F%2Fimages.usevellum.xyz%2Favatar.png",
      ),
      async () => {
        requests += 1;
        return new Response(null, { status: 302, headers: { location: "http://localhost/x" } });
      },
      PUBLIC_DNS,
    );
    expect(redirected.status).toBe(400);
    expect(requests).toBe(1);
  });

  test("rejects unsupported content and oversized responses", async () => {
    const request = new Request(
      "https://usevellum.xyz/api/avatar?url=https%3A%2F%2Fimages.usevellum.xyz%2Favatar.png",
    );
    const text = await handleAvatarRequest(
      request,
      async () => new Response("not an image", { headers: { "content-type": "text/plain" } }),
      PUBLIC_DNS,
    );
    expect(text.status).toBe(502);

    const oversized = await handleAvatarRequest(
      request,
      async () =>
        new Response(new Uint8Array(), {
          headers: { "content-type": "image/png", "content-length": "1500001" },
        }),
      PUBLIC_DNS,
    );
    expect(oversized.status).toBe(502);
  });

  test("blocks hostnames that resolve to private addresses", async () => {
    let requested = false;
    const request = new Request(
      "https://usevellum.xyz/api/avatar?url=https%3A%2F%2Fimages.usevellum.xyz%2Favatar.png",
    );
    for (const address of [
      "10.0.0.2",
      "::ffff:7f00:1",
      "64:ff9b::7f00:1",
      "2002:7f00:1::",
      "2001:db8::1",
      "3fff::1",
      "5f00::1",
      "fd00::1",
    ]) {
      const response = await handleAvatarRequest(
        request,
        async () => {
          requested = true;
          return new Response();
        },
        async () => [{ address, family: address.includes(":") ? 6 : 4 }],
      );
      expect(response.status).toBe(400);
    }
    expect(requested).toBe(false);
  });
});
