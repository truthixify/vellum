import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

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

type FetchImplementation = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
type AddressRecord = { address: string; family: number };
type LookupImplementation = (hostname: string) => Promise<readonly AddressRecord[]>;

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

  const normalized = address.toLowerCase();
  if (normalized.startsWith("::ffff:")) {
    const mapped = normalized.slice("::ffff:".length);
    return isIP(mapped) !== 4 || isPrivateIpv4(mapped.split(".").map(Number));
  }
  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    /^fe[89ab]/.test(normalized) ||
    normalized.startsWith("ff") ||
    normalized.startsWith("2001:db8:")
  );
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

async function assertPublicResolution(url: URL, lookupImplementation: LookupImplementation) {
  if (isIP(url.hostname) > 0) return;

  let addresses: readonly AddressRecord[];
  try {
    addresses = await lookupImplementation(url.hostname);
  } catch {
    throw new AvatarProxyError(502, "The remote avatar host could not be resolved.");
  }
  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateIpAddress(address))) {
    throw new AvatarProxyError(400, "The avatar URL is not publicly reachable.");
  }
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
  fetchImplementation: FetchImplementation,
  lookupImplementation: LookupImplementation,
): Promise<{ body: Uint8Array; contentType: string }> {
  let url = initialUrl;
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    await assertPublicResolution(url, lookupImplementation);
    let response: Response;
    try {
      response = await fetchImplementation(url, {
        headers: { accept: "image/avif,image/webp,image/png,image/jpeg,image/gif" },
        redirect: "manual",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
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
  fetchImplementation: FetchImplementation = globalThis.fetch,
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
      fetchImplementation,
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
