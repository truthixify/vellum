import { VELLUM_REPUTATION_POLICY_V1, type ReputationResult } from "@vellum/scoring";

import {
  InvalidReputationSubjectError,
  ReputationSubjectNotFoundError,
  scoreSubjectReputation,
} from "./service.js";

export const REPUTATION_API_VERSION = "1" as const;

type ReputationHttpDependencies = {
  scoreSubject: (subject: string) => Promise<ReputationResult>;
};

const defaultDependencies: ReputationHttpDependencies = {
  scoreSubject: scoreSubjectReputation,
};

const publicHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
} as const;

function jsonResponse(body: unknown, status: number, cacheControl = "no-store"): Response {
  return Response.json(body, {
    status,
    headers: {
      ...publicHeaders,
      "cache-control": cacheControl,
    },
  });
}

function requestError(
  status: number,
  code: "invalid_request" | "method_not_allowed" | "subject_not_found" | "service_unavailable",
  message: string,
  headers?: HeadersInit,
): Response {
  const response = jsonResponse(
    {
      ok: false,
      version: REPUTATION_API_VERSION,
      error: { code, message },
    },
    status,
  );
  if (headers) {
    for (const [name, value] of new Headers(headers)) response.headers.set(name, value);
  }
  return response;
}

export function reputationSubjectFromUrl(request: Request): string | undefined {
  const url = new URL(request.url);
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length === 3 && segments[0] === "api" && segments[1] === "reputation") {
    try {
      return decodeURIComponent(segments[2]);
    } catch {
      return undefined;
    }
  }
  if (segments.length === 2 && segments[0] === "api" && segments[1] === "reputation") {
    const values = url.searchParams.getAll("did");
    return values.length === 1 ? values[0] : undefined;
  }
  return undefined;
}

export async function handleReputationRequest(
  request: Request,
  dependencies: ReputationHttpDependencies = defaultDependencies,
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: publicHeaders });
  }
  if (request.method !== "GET") {
    return requestError(405, "method_not_allowed", "Use GET for reputation scores.", {
      allow: "GET, OPTIONS",
    });
  }

  const subject = reputationSubjectFromUrl(request);
  if (!subject) {
    return requestError(400, "invalid_request", "A single did:ckb subject is required.");
  }

  try {
    const result = await dependencies.scoreSubject(subject);
    const body = {
      ok: result.status === "available",
      version: REPUTATION_API_VERSION,
      network: "ckb_testnet",
      subject,
      ...result,
    };
    return jsonResponse(
      body,
      result.status === "available" ? 200 : 503,
      result.status === "available"
        ? "public, s-maxage=60, stale-while-revalidate=300"
        : "no-store",
    );
  } catch (error) {
    if (error instanceof InvalidReputationSubjectError) {
      return requestError(400, "invalid_request", error.message);
    }
    if (error instanceof ReputationSubjectNotFoundError) {
      return requestError(404, "subject_not_found", error.message);
    }
    return requestError(
      503,
      "service_unavailable",
      `Reputation scoring is unavailable for ${VELLUM_REPUTATION_POLICY_V1.version}.`,
    );
  }
}
