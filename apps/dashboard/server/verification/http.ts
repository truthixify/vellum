import {
  VERIFICATION_API_VERSION,
  isVerificationPlatform,
  type VerificationErrorCode,
} from "./contracts";
import { issuerMetadata } from "./issuer";
import {
  verifyPlatformProof,
  type VerificationServiceDependencies,
  type VerificationServiceResult,
} from "./service";

const MAX_REQUEST_BYTES = 16_384;

class RequestBodyError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function jsonResponse(body: unknown, status = 200, headers?: HeadersInit): Response {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      ...headers,
    },
  });
}

function requestError(
  status: number,
  code: Extract<VerificationErrorCode, "invalid_request" | "method_not_allowed">,
  message: string,
): Response {
  return jsonResponse(
    {
      ok: false,
      version: VERIFICATION_API_VERSION,
      error: { code, message },
    },
    status,
    status === 405 ? { allow: "POST" } : undefined,
  );
}

async function readBody(request: Request): Promise<string> {
  if (!request.body) {
    return "";
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    byteLength += value.byteLength;
    if (byteLength > MAX_REQUEST_BYTES) {
      await reader.cancel();
      throw new RequestBodyError(413, "The request body exceeds the 16 KiB limit.");
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

async function parseJsonBody(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") {
    throw new RequestBodyError(415, "The request must use application/json.");
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    const declaredLength = Number(contentLength);
    if (
      !/^[0-9]+$/.test(contentLength) ||
      !Number.isSafeInteger(declaredLength) ||
      declaredLength > MAX_REQUEST_BYTES
    ) {
      throw new RequestBodyError(413, "The request body exceeds the 16 KiB limit.");
    }
  }

  const text = await readBody(request);
  return JSON.parse(text) as unknown;
}

export function platformFromUrl(request: Request): string | undefined {
  const url = new URL(request.url);
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length === 3 && segments[0] === "api" && segments[1] === "verify") {
    try {
      return decodeURIComponent(segments[2]);
    } catch {
      return undefined;
    }
  }
  if (segments.length === 2 && segments[0] === "api" && segments[1] === "verify") {
    return url.searchParams.get("platform") ?? undefined;
  }
  return undefined;
}

export async function handleVerificationRequest(
  request: Request,
  dependencies?: VerificationServiceDependencies,
): Promise<Response> {
  if (request.method !== "POST") {
    return requestError(405, "method_not_allowed", "Use POST for verification requests.");
  }

  const platform = platformFromUrl(request);
  if (!platform || !isVerificationPlatform(platform)) {
    const result = await verifyPlatformProof(platform ?? "", undefined, dependencies);
    return jsonResponse(result.body, result.status);
  }

  let body: unknown;
  try {
    body = await parseJsonBody(request);
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return requestError(error.status, "invalid_request", error.message);
    }
    return requestError(400, "invalid_request", "The request body must contain valid JSON.");
  }

  const result: VerificationServiceResult = await verifyPlatformProof(
    platform ?? "",
    body,
    dependencies,
  );
  return jsonResponse(result.body, result.status);
}

export function handleIssuerRequest(request: Request): Response {
  if (request.method !== "GET") {
    return jsonResponse(
      {
        ok: false,
        version: VERIFICATION_API_VERSION,
        error: {
          code: "method_not_allowed",
          message: "Use GET for issuer metadata.",
        },
      },
      405,
      { allow: "GET" },
    );
  }

  return jsonResponse({
    ok: true,
    version: VERIFICATION_API_VERSION,
    issuer: issuerMetadata,
  });
}
