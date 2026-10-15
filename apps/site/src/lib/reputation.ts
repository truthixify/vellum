import { REPUTATION_API_ORIGIN } from "../config";

export type ReputationCategoryId =
  | "technical"
  | "contribution"
  | "community"
  | "tenure"
  | "recency";

export type PublicReputationAccount = {
  platform: "github" | "discord" | "telegram" | "bluesky";
  id: string;
  label: string;
  profileUrl?: string;
  verifiedAt: number;
};

export type PublicVerifiedAccount = PublicReputationAccount & {
  issuerDid: string;
};

export type PublicClaimReference = {
  claimId: string;
  transactionHash: string;
  outputIndex: number;
};

export type PublicReputationEvidence = {
  claim: PublicClaimReference;
  issuerDid: string;
  schemaId: string;
  schemaHash: string;
  issuedAt: number;
  account: PublicReputationAccount;
  contributionPoints: number;
};

export type PublicExcludedEvidence = {
  claim: PublicClaimReference;
  reason: string;
  message: string;
};

export type AvailablePublicReputation = {
  ok: true;
  version: "1";
  network: "ckb_testnet";
  subject: string;
  status: "available";
  policyVersion: string;
  evaluatedAt: number;
  overall: { score: number; maximum: number };
  categories: readonly {
    id: ReputationCategoryId;
    score: number;
    maximum: number;
  }[];
  evidence: readonly PublicReputationEvidence[];
  excludedEvidence: readonly PublicExcludedEvidence[];
};

export type UnavailablePublicReputation = {
  ok: false;
  version: "1";
  network: "ckb_testnet";
  subject: string;
  status: "unavailable";
  policyVersion: string;
  evaluatedAt: number;
  error: {
    code: "issuer-state-unavailable" | "claim-read-unavailable";
    message: string;
  };
};

export type PublicReputationResponse = AvailablePublicReputation | UnavailablePublicReputation;

type FetchImplementation = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

const CATEGORY_IDS: readonly ReputationCategoryId[] = [
  "technical",
  "contribution",
  "community",
  "tenure",
  "recency",
];

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function webUrl(value: unknown, optional = false): string | undefined {
  if (optional && value === undefined) return undefined;
  if (typeof value !== "string") throw new TypeError("Account profile URL is invalid");
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new TypeError("Account profile URL is invalid");
  }
  return url.toString();
}

function parseClaimReference(value: unknown): PublicClaimReference {
  if (!isRecord(value)) throw new TypeError("Claim reference is invalid");
  const claimId = stringValue(value.claimId);
  const transactionHash = stringValue(value.transactionHash);
  if (!claimId || !transactionHash || !isNonNegativeInteger(value.outputIndex)) {
    throw new TypeError("Claim reference is invalid");
  }
  return { claimId, transactionHash, outputIndex: value.outputIndex };
}

function parseAccount(value: unknown): PublicReputationAccount {
  if (!isRecord(value) || !isNonNegativeInteger(value.verifiedAt)) {
    throw new TypeError("Reputation account is invalid");
  }

  const platform = value.platform;
  if (platform === "github") {
    const handle = stringValue(value.handle);
    if (!handle || !isNonNegativeInteger(value.id))
      throw new TypeError("GitHub account is invalid");
    return {
      platform,
      id: String(value.id),
      label: handle,
      profileUrl: webUrl(value.profileUrl),
      verifiedAt: value.verifiedAt,
    };
  }
  if (platform === "discord") {
    const id = stringValue(value.id);
    const handle = stringValue(value.handle);
    if (!id || !handle) throw new TypeError("Discord account is invalid");
    return {
      platform,
      id,
      label: handle,
      profileUrl: webUrl(value.profileUrl),
      verifiedAt: value.verifiedAt,
    };
  }
  if (platform === "telegram") {
    const id = stringValue(value.id);
    const label = stringValue(value.handle) ?? stringValue(value.displayName);
    if (!id || !label) throw new TypeError("Telegram account is invalid");
    return {
      platform,
      id,
      label,
      profileUrl: webUrl(value.profileUrl, true),
      verifiedAt: value.verifiedAt,
    };
  }
  if (platform === "bluesky") {
    const id = stringValue(value.id);
    const handle = stringValue(value.handle);
    if (!id || !handle) throw new TypeError("Bluesky account is invalid");
    return {
      platform,
      id,
      label: handle,
      profileUrl: webUrl(value.profileUrl),
      verifiedAt: value.verifiedAt,
    };
  }
  throw new TypeError("Reputation account platform is invalid");
}

function parseEvidence(value: unknown): PublicReputationEvidence {
  if (!isRecord(value) || !Array.isArray(value.contributions)) {
    throw new TypeError("Reputation evidence is invalid");
  }
  const issuerDid = stringValue(value.issuerDid);
  const schemaId = stringValue(value.schemaId);
  const schemaHash = stringValue(value.schemaHash);
  if (!issuerDid || !schemaId || !schemaHash || !isNonNegativeInteger(value.issuedAt)) {
    throw new TypeError("Reputation evidence is invalid");
  }

  let contributionPoints = 0;
  for (const contribution of value.contributions) {
    if (
      !isRecord(contribution) ||
      !CATEGORY_IDS.includes(contribution.category as ReputationCategoryId) ||
      !isNonNegativeInteger(contribution.points) ||
      !stringValue(contribution.ruleId)
    ) {
      throw new TypeError("Reputation contribution is invalid");
    }
    contributionPoints += contribution.points;
  }

  return {
    claim: parseClaimReference(value.claim),
    issuerDid,
    schemaId,
    schemaHash,
    issuedAt: value.issuedAt,
    account: parseAccount(value.account),
    contributionPoints,
  };
}

function parseExcludedEvidence(value: unknown): PublicExcludedEvidence {
  if (!isRecord(value)) throw new TypeError("Excluded evidence is invalid");
  const reason = stringValue(value.reason);
  const message = stringValue(value.message);
  if (!reason || !message) throw new TypeError("Excluded evidence is invalid");
  return { claim: parseClaimReference(value.claim), reason, message };
}

function parseCategories(value: unknown): AvailablePublicReputation["categories"] {
  if (!Array.isArray(value) || value.length !== CATEGORY_IDS.length) {
    throw new TypeError("Reputation categories are invalid");
  }
  const categories = value.map((category) => {
    if (
      !isRecord(category) ||
      !CATEGORY_IDS.includes(category.id as ReputationCategoryId) ||
      !isNonNegativeInteger(category.score) ||
      !isNonNegativeInteger(category.maximum) ||
      category.maximum === 0 ||
      category.score > category.maximum
    ) {
      throw new TypeError("Reputation category is invalid");
    }
    return {
      id: category.id as ReputationCategoryId,
      score: category.score,
      maximum: category.maximum,
    };
  });
  if (new Set(categories.map(({ id }) => id)).size !== CATEGORY_IDS.length) {
    throw new TypeError("Reputation categories are invalid");
  }
  return categories;
}

export function parsePublicReputationResponse(
  value: unknown,
  expectedSubject: string,
): PublicReputationResponse {
  const policyVersion = isRecord(value) ? stringValue(value.policyVersion) : null;
  if (
    !isRecord(value) ||
    value.version !== "1" ||
    value.network !== "ckb_testnet" ||
    value.subject !== expectedSubject ||
    !policyVersion ||
    !isNonNegativeInteger(value.evaluatedAt)
  ) {
    throw new TypeError("Reputation response is invalid");
  }

  if (value.status === "available" && value.ok === true) {
    if (
      !isRecord(value.overall) ||
      !isNonNegativeInteger(value.overall.score) ||
      !isNonNegativeInteger(value.overall.maximum) ||
      value.overall.maximum === 0 ||
      value.overall.score > value.overall.maximum ||
      !Array.isArray(value.evidence) ||
      !Array.isArray(value.excludedEvidence)
    ) {
      throw new TypeError("Available reputation response is invalid");
    }
    const categories = parseCategories(value.categories);
    if (
      categories.reduce((sum, category) => sum + category.score, 0) !== value.overall.score ||
      categories.reduce((sum, category) => sum + category.maximum, 0) !== value.overall.maximum
    ) {
      throw new TypeError("Reputation totals are inconsistent");
    }
    return {
      ok: true,
      version: "1",
      network: "ckb_testnet",
      subject: expectedSubject,
      status: "available",
      policyVersion,
      evaluatedAt: value.evaluatedAt,
      overall: { score: value.overall.score, maximum: value.overall.maximum },
      categories,
      evidence: value.evidence.map(parseEvidence),
      excludedEvidence: value.excludedEvidence.map(parseExcludedEvidence),
    };
  }

  if (value.status === "unavailable" && value.ok === false && isRecord(value.error)) {
    const code = value.error.code;
    const message = stringValue(value.error.message);
    if ((code !== "issuer-state-unavailable" && code !== "claim-read-unavailable") || !message) {
      throw new TypeError("Unavailable reputation response is invalid");
    }
    return {
      ok: false,
      version: "1",
      network: "ckb_testnet",
      subject: expectedSubject,
      status: "unavailable",
      policyVersion,
      evaluatedAt: value.evaluatedAt,
      error: { code, message },
    };
  }

  throw new TypeError("Reputation response is invalid");
}

function requestError(value: unknown): { code: string; message: string } | null {
  if (!isRecord(value) || value.ok !== false || !isRecord(value.error)) return null;
  const code = stringValue(value.error.code);
  const message = stringValue(value.error.message);
  return code && message ? { code, message } : null;
}

export async function fetchPublicReputation(
  did: string,
  fetchImplementation: FetchImplementation = globalThis.fetch,
  origin = REPUTATION_API_ORIGIN,
): Promise<PublicReputationResponse> {
  let response: Response;
  try {
    response = await fetchImplementation(
      `${origin.replace(/\/+$/, "")}/api/reputation/${encodeURIComponent(did)}`,
      { cache: "no-store", headers: { accept: "application/json" } },
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
    const result = parsePublicReputationResponse(value, did);
    if ((result.status === "available") !== response.ok) {
      throw new TypeError("Reputation response status is inconsistent");
    }
    return result;
  } catch (error) {
    const failure = requestError(value);
    if (failure) {
      throw new ReputationRequestError(
        failure.code === "subject_not_found" ? "not_found" : "service_unavailable",
        failure.message,
      );
    }
    throw new ReputationRequestError(
      "invalid_response",
      error instanceof Error ? error.message : "The reputation response is invalid.",
    );
  }
}

export function verifiedAccounts(
  reputation: AvailablePublicReputation,
): readonly PublicVerifiedAccount[] {
  const accounts = new Map<string, PublicVerifiedAccount>();
  for (const evidence of reputation.evidence) {
    const key = `${evidence.account.platform}:${evidence.account.id}`;
    const current = accounts.get(key);
    if (!current || evidence.account.verifiedAt > current.verifiedAt) {
      accounts.set(key, { ...evidence.account, issuerDid: evidence.issuerDid });
    }
  }
  return [...accounts.values()].sort(
    (left, right) => PLATFORM_ORDER[left.platform] - PLATFORM_ORDER[right.platform],
  );
}
