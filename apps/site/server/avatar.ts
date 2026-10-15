import { lookup } from "node:dns/promises";
import { request as httpRequest, type IncomingHttpHeaders, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import { BlockList, isIP } from "node:net";
import { Readable } from "node:stream";

import { normalizeProfileAvatarUrl } from "@vellum/schemas";

const MAX_AVATAR_BYTES = 1_500_000;
const MAX_REDIRECTS = 2;
const FETCH_TIMEOUT_MS = 5_000;
const IMAGE_CONTENT_TYPES = new Set([
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const BLOCKED_IPV6 = new BlockList();
for (const [network, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["::ffff:0.0.0.0", 96],
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["3fff::", 20],
  ["5f00::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  BLOCKED_IPV6.addSubnet(network, prefix, "ipv6");
}

type AddressRecord = { address: string; family: number };
type LookupImplementation = (hostname: string) => Promise<readonly AddressRecord[]>;
type AvatarRequestImplementation = (url: URL, address: AddressRecord) => Promise<Response>;

const defaultLookup: LookupImplementation = (hostname) =>
  lookup(hostname, { all: true, verbatim: true });

class AvatarProxyError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "AvatarProxyError";
  }
}

function ipv4Parts(hostname: string): number[] | undefined {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) return undefined;
  const parts = hostname.split(".").map(Number);
  return parts.every((part) => part >= 0 && part <= 255) ? parts : undefined;
}

function isPrivateIpv4(parts: readonly number[]): boolean {
  const [first, second, third] = parts;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 0 && (third === 0 || third === 2)) ||
    (first === 192 && second === 88 && third === 99) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    (first === 198 && second === 51 && third === 100) ||
    (first === 203 && second === 0 && third === 113) ||
    first >= 224
  );
}

function isPrivateIpAddress(address: string): boolean {
  if (isIP(address) === 4) return isPrivateIpv4(address.split(".").map(Number));
  if (isIP(address) !== 6) return true;
  return BLOCKED_IPV6.check(address, "ipv6");
}

function isUnsafeHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  if (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".internal") ||
    normalized.endsWith(".test") ||
    normalized.endsWith(".invalid") ||
    normalized.endsWith(".example") ||
    normalized.includes(":")
  ) {
    return true;
  }
  const parts = ipv4Parts(normalized);
  return parts ? isPrivateIpv4(parts) : !normalized.includes(".");
}

function remoteAvatarUrl(value: string): URL {
  const normalized = normalizeProfileAvatarUrl(value);
  if (!normalized) throw new AvatarProxyError(400, "The avatar URL is invalid.");

  const url = new URL(normalized);
  if (isUnsafeHostname(url.hostname) || url.port) {
    throw new AvatarProxyError(400, "The avatar URL is not publicly reachable.");
  }
  return url;
}

async function resolvePublicAddress(url: URL, lookupImplementation: LookupImplementation) {
  const literalFamily = isIP(url.hostname);
  if (literalFamily > 0) return { address: url.hostname, family: literalFamily };

  let addresses: readonly AddressRecord[];
  try {
    addresses = await lookupImplementation(url.hostname);
  } catch {
    throw new AvatarProxyError(502, "The remote avatar host could not be resolved.");
  }
  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateIpAddress(address))) {
    throw new AvatarProxyError(400, "The avatar URL is not publicly reachable.");
  }
  const selected = addresses[0];
  const family = isIP(selected.address);
  if (family === 0) {
    throw new AvatarProxyError(502, "The remote avatar host returned an invalid address.");
  }
  return { address: selected.address, family };
}

function responseHeaders(headers: IncomingHttpHeaders): Headers {
  const result = new Headers();
  for (const [name, value] of Object.entries(headers)) {
    if (Array.isArray(value)) value.forEach((item) => result.append(name, item));
    else if (value !== undefined) result.set(name, value);
  }
  return result;
}

function requestPinnedAvatar(url: URL, address: AddressRecord): Promise<Response> {
  return new Promise((resolve, reject) => {
    const options = {
      family: address.family,
      headers: {
        accept: "image/avif,image/webp,image/png,image/jpeg,image/gif",
        "accept-encoding": "identity",
        host: url.host,
      },
      hostname: address.address,
      method: "GET",
      path: `${url.pathname}${url.search}`,
      ...(url.protocol === "https:" ? { servername: url.hostname } : {}),
    };
    const handleResponse = (incoming: IncomingMessage) => {
      const timer = setTimeout(() => incoming.destroy(), FETCH_TIMEOUT_MS);
      const clearTimer = () => clearTimeout(timer);
      incoming.once("close", clearTimer);
      incoming.once("end", clearTimer);
      incoming.once("error", clearTimer);
      resolve(
        new Response(Readable.toWeb(incoming) as unknown as ReadableStream<Uint8Array>, {
          status:
            incoming.statusCode && incoming.statusCode >= 200 && incoming.statusCode <= 599
              ? incoming.statusCode
              : 502,
          headers: responseHeaders(incoming.headers),
        }),
      );
    };
    const outgoing =
      url.protocol === "https:"
        ? httpsRequest(options, handleResponse)
        : httpRequest(options, handleResponse);
    const timer = setTimeout(
      () => outgoing.destroy(new Error("The remote avatar request timed out.")),
      FETCH_TIMEOUT_MS,
    );
    outgoing.once("response", () => clearTimeout(timer));
    outgoing.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    outgoing.end();
  });
}

async function readLimitedBody(response: Response): Promise<Uint8Array> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_AVATAR_BYTES) {
    throw new AvatarProxyError(502, "The remote avatar is too large.");
  }
  if (!response.body) throw new AvatarProxyError(502, "The remote avatar was empty.");

  const chunks: Uint8Array[] = [];
  let length = 0;
  const reader = response.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > MAX_AVATAR_BYTES) {
      await reader.cancel();
      throw new AvatarProxyError(502, "The remote avatar is too large.");
    }
    chunks.push(value);
  }

  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

async function fetchAvatar(
  initialUrl: URL,
  requestImplementation: AvatarRequestImplementation,
  lookupImplementation: LookupImplementation,
): Promise<{ body: Uint8Array; contentType: string }> {
  let url = initialUrl;
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const address = await resolvePublicAddress(url, lookupImplementation);
    let response: Response;
    try {
      response = await requestImplementation(url, address);
    } catch {
      throw new AvatarProxyError(502, "The remote avatar could not be reached.");
    }

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location || redirects === MAX_REDIRECTS) {
        throw new AvatarProxyError(502, "The remote avatar redirected too many times.");
      }
      url = remoteAvatarUrl(new URL(location, url).toString());
      continue;
    }
    if (!response.ok) {
      throw new AvatarProxyError(502, "The remote avatar request failed.");
    }

    const contentType = response.headers.get("content-type")?.split(";", 1)[0].toLowerCase();
    if (!contentType || !IMAGE_CONTENT_TYPES.has(contentType)) {
      throw new AvatarProxyError(502, "The remote resource is not a supported image.");
    }
    return { body: await readLimitedBody(response), contentType };
  }
  throw new AvatarProxyError(502, "The remote avatar request failed.");
}

export async function handleAvatarRequest(
  request: Request,
  requestImplementation: AvatarRequestImplementation = requestPinnedAvatar,
  lookupImplementation: LookupImplementation = defaultLookup,
): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405, headers: { allow: "GET, HEAD" } });
  }

  try {
    const values = new URL(request.url).searchParams.getAll("url");
    if (values.length !== 1) throw new AvatarProxyError(400, "A single avatar URL is required.");

    const avatar = await fetchAvatar(
      remoteAvatarUrl(values[0]),
      requestImplementation,
      lookupImplementation,
    );
    return new Response(request.method === "HEAD" ? null : (avatar.body.buffer as ArrayBuffer), {
      headers: {
        "cache-control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400",
        "content-length": String(avatar.body.byteLength),
        "content-type": avatar.contentType,
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    const failure =
      error instanceof AvatarProxyError
        ? error
        : new AvatarProxyError(502, "The remote avatar could not be loaded.");
    return new Response(failure.message, {
      status: failure.status,
      headers: { "cache-control": "no-store", "content-type": "text/plain; charset=utf-8" },
    });
  }
}
