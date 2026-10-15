import {
  parseReputationApiBody,
  type AvailableReputation,
  type ReputationResponse,
  type UnavailableReputation,
} from "@vellum/scoring";

import { REPUTATION_API_ORIGIN } from "../config";

export type AvailablePublicReputation = AvailableReputation;
export type UnavailablePublicReputation = UnavailableReputation;
export type PublicReputationResponse = ReputationResponse;

type PublicReputationAccount = AvailableReputation["evidence"][number]["account"];

export type PublicVerifiedAccount = {
  platform: PublicReputationAccount["platform"];
  id: string;
  displayLabel: string;
  profileUrl?: string;
  verifiedAt: number;
  issuerDid: string;
};

type FetchImplementation = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
const REPUTATION_REQUEST_TIMEOUT_MS = 8_000;

const PLATFORM_ORDER: Record<PublicReputationAccount["platform"], number> = {
  github: 0,
  discord: 1,
  telegram: 2,
  bluesky: 3,
};

export class ReputationRequestError extends Error {
  constructor(
    readonly code: "not_found" | "service_unavailable" | "invalid_response",
    message: string,
  ) {
    super(message);
    this.name = "ReputationRequestError";
  }
}

export function parsePublicReputationResponse(
  value: unknown,
  expectedSubject: string,
): PublicReputationResponse {
  const parsed = parseReputationApiBody(value, expectedSubject);
  if (parsed.kind === "error") {
    throw new TypeError(parsed.error.message);
  }
  return parsed.value;
}

function requestCode(code: string): ReputationRequestError["code"] {
  return code === "subject_not_found" ? "not_found" : "service_unavailable";
}

export async function fetchPublicReputation(
  did: string,
  fetchImplementation: FetchImplementation = globalThis.fetch,
  origin = REPUTATION_API_ORIGIN,
  timeout = REPUTATION_REQUEST_TIMEOUT_MS,
): Promise<PublicReputationResponse> {
  let response: Response;
  try {
    response = await fetchImplementation(
      `${origin.replace(/\/+$/, "")}/api/reputation/${encodeURIComponent(did)}`,
      {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(timeout),
      },
    );
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
      throw new ReputationRequestError(requestCode(parsed.error.code), parsed.error.message);
    }
    if ((parsed.value.status === "available") !== response.ok) {
      throw new TypeError("Reputation response status is inconsistent");
    }
    return parsed.value;
  } catch (error) {
    if (error instanceof ReputationRequestError) throw error;
    throw new ReputationRequestError(
      "invalid_response",
      error instanceof Error ? error.message : "The reputation response is invalid.",
    );
  }
}

function accountKey(account: PublicReputationAccount): string {
  return `${account.platform}:${account.id}`;
}

function accountDisplayLabel(account: PublicReputationAccount): string {
  if (account.platform === "telegram") {
    return account.handle ? `@${account.handle}` : account.displayName;
  }
  return `@${account.handle}`;
}

export function verifiedAccounts(
  reputation: AvailablePublicReputation,
): readonly PublicVerifiedAccount[] {
  const accounts = new Map<string, PublicVerifiedAccount>();
  for (const evidence of reputation.evidence) {
    const key = accountKey(evidence.account);
    const current = accounts.get(key);
    if (!current || evidence.account.verifiedAt > current.verifiedAt) {
      accounts.set(key, {
        platform: evidence.account.platform,
        id: String(evidence.account.id),
        displayLabel: accountDisplayLabel(evidence.account),
        ...(evidence.account.profileUrl ? { profileUrl: evidence.account.profileUrl } : {}),
        verifiedAt: evidence.account.verifiedAt,
        issuerDid: evidence.issuerDid,
      });
    }
  }
  return [...accounts.values()].sort(
    (left, right) => PLATFORM_ORDER[left.platform] - PLATFORM_ORDER[right.platform],
  );
}
