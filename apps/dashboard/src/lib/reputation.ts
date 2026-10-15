import { isDidCkb } from "@/lib/did-ckb";
import {
  parseReputationApiBody,
  type AvailableReputation,
  type ReputationCategory,
  type ReputationResponse,
  type UnavailableReputation,
} from "@vellum/scoring";

export type { AvailableReputation, ReputationCategory, ReputationResponse, UnavailableReputation };

type FetchImplementation = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export class ReputationRequestError extends Error {
  constructor(
    readonly code: "invalid_subject" | "not_found" | "service_unavailable" | "invalid_response",
    message: string,
  ) {
    super(message);
    this.name = "ReputationRequestError";
  }
}

export async function fetchReputation(
  did: string,
  fetchImplementation: FetchImplementation = globalThis.fetch,
): Promise<ReputationResponse> {
  if (!isDidCkb(did)) {
    throw new ReputationRequestError("invalid_subject", "Enter a valid did:ckb identifier.");
  }

  let response: Response;
  try {
    response = await fetchImplementation(`/api/reputation/${encodeURIComponent(did)}`, {
      cache: "no-store",
      headers: { accept: "application/json" },
    });
  } catch {
    throw new ReputationRequestError(
      "service_unavailable",
      "Vellum could not reach the reputation service.",
    );
  }

  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new ReputationRequestError(
      "invalid_response",
      "The reputation service returned an unreadable response.",
    );
  }

  try {
    const parsed = parseReputationApiBody(value, did);
    if (parsed.kind === "error") {
      const code =
        parsed.error.code === "subject_not_found"
          ? "not_found"
          : parsed.error.code === "invalid_request"
            ? "invalid_subject"
            : "service_unavailable";
      throw new ReputationRequestError(code, parsed.error.message);
    }
    if ((parsed.value.status === "available") !== response.ok) {
      throw new ReputationRequestError(
        "invalid_response",
        "The reputation response did not match the request.",
      );
    }
    return parsed.value;
  } catch (error) {
    if (error instanceof ReputationRequestError) throw error;
    throw new ReputationRequestError(
      "invalid_response",
      error instanceof Error
        ? error.message
        : "The reputation service returned an unexpected response.",
    );
  }
}
