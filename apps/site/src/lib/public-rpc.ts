import { ccc } from "@ckb-ccc/core";

type FetchImplementation = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
type JsonRpcPayload = {
  id: number;
  jsonrpc: "2.0";
  method: string;
  params: unknown[] | Record<string, unknown>;
};

export class PublicJsonRpcTransport {
  constructor(
    private readonly url: string,
    private readonly timeout: number,
    private readonly fetchImplementation: FetchImplementation = globalThis.fetch,
  ) {}

  async request(payload: JsonRpcPayload): Promise<unknown> {
    const fetchImplementation = this.fetchImplementation;
    const response = await fetchImplementation(this.url, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "text/plain;charset=UTF-8",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(this.timeout),
    });
    if (!response.ok) {
      throw new Error(`CKB RPC request failed with status ${response.status}.`);
    }
    return response.json();
  }
}

export function createPublicTestnetClient(url: string, timeout: number): ccc.Client {
  return new ccc.ClientPublicTestnet({
    url,
    fallbacks: [],
    timeout,
    transport: new PublicJsonRpcTransport(url, timeout),
  });
}
