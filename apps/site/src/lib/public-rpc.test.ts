import { describe, expect, test } from "bun:test";

import { PublicJsonRpcTransport } from "./public-rpc";

describe("public CKB RPC transport", () => {
  test("sends a CORS-safelisted JSON-RPC request", async () => {
    let requestUrl = "";
    let requestInit: RequestInit | undefined;
    const transport = new PublicJsonRpcTransport(
      "https://rpc.example.test",
      1_000,
      async function fetchImplementation(
        this: unknown,
        input: string | URL | Request,
        init?: RequestInit,
      ) {
        expect(this).toBeUndefined();
        requestUrl = String(input);
        requestInit = init;
        return Response.json({ id: 7, jsonrpc: "2.0", result: "0x1" });
      },
    );
    const payload: Parameters<PublicJsonRpcTransport["request"]>[0] = {
      id: 7,
      jsonrpc: "2.0",
      method: "get_tip_block_number",
      params: [],
    };

    await expect(transport.request(payload)).resolves.toEqual({
      id: 7,
      jsonrpc: "2.0",
      result: "0x1",
    });
    expect(requestUrl).toBe("https://rpc.example.test");
    expect(requestInit?.method).toBe("POST");
    expect(new Headers(requestInit?.headers).get("content-type")).toBe("text/plain;charset=UTF-8");
    expect(requestInit?.body).toBe(JSON.stringify(payload));
  });

  test("rejects non-successful RPC responses", async () => {
    const transport = new PublicJsonRpcTransport(
      "https://rpc.example.test",
      1_000,
      async () => new Response("Unavailable", { status: 503 }),
    );

    await expect(
      transport.request({ id: 1, jsonrpc: "2.0", method: "get_cells", params: [] }),
    ).rejects.toThrow("status 503");
  });
});
