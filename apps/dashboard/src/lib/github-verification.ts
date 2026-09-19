import { ccc } from "@ckb-ccc/core";
import { didToArgs } from "@ckb-ccc/did-ckb";

const HEX_32_PATTERN = /^0x[0-9a-f]{64}$/;
const GITHUB_LOGIN_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,98}[A-Za-z0-9])?$/;
const GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize";

export const GITHUB_VERIFICATION_ERROR_CODES = [
  "invalid_request",
  "oauth_configuration_error",
  "oauth_denied",
  "oauth_state_invalid",
  "provider_rate_limited",
  "provider_unavailable",
  "credential_revocation_failed",
  "verification_failed",
  "issuer_unavailable",
  "issuance_failed",
] as const;

export type GithubVerificationErrorCode = (typeof GITHUB_VERIFICATION_ERROR_CODES)[number];

export type GithubVerificationSearch = {
  status?: "error" | "submitted";
  subject?: string;
  transaction?: string;
  claim?: string;
  output?: number;
  login?: string;
  code?: GithubVerificationErrorCode;
  retryAt?: number;
};

export type GithubSubmission = {
  subject: string;
  transactionHash: ccc.Hex;
  claimId: ccc.Hex;
  outputIndex: number;
  login: string;
};

export type PublicIssuerMetadata = {
  did: string;
  network: "ckb_testnet";
  payer: "issuer";
  submission: "service";
};

type FetchImplementation = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

function scalar(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function positiveInteger(value: unknown): number | undefined {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^\d+$/.test(value)
        ? Number(value)
        : Number.NaN;
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

function isDidCkb(value: string): boolean {
  try {
    return value.startsWith("did:ckb:") && ccc.bytesFrom(didToArgs(value)).length === 20;
  } catch {
    return false;
  }
}

function isErrorCode(value: string): value is GithubVerificationErrorCode {
  return GITHUB_VERIFICATION_ERROR_CODES.some((code) => code === value);
}

export function parseGithubVerificationSearch(
  search: Record<string, unknown>,
): GithubVerificationSearch {
  const statusValue = scalar(search.status);
  const subjectValue = scalar(search.subject);
  const transactionValue = scalar(search.transaction);
  const claimValue = scalar(search.claim);
  const outputValue = positiveInteger(search.output);
  const loginValue = scalar(search.login);
  const codeValue = scalar(search.code);
  const retryAtValue = positiveInteger(search.retryAt);

  return {
    status: statusValue === "submitted" || statusValue === "error" ? statusValue : undefined,
    subject: subjectValue && isDidCkb(subjectValue) ? subjectValue : undefined,
    transaction:
      transactionValue && HEX_32_PATTERN.test(transactionValue) ? transactionValue : undefined,
    claim: claimValue && HEX_32_PATTERN.test(claimValue) ? claimValue : undefined,
    output: outputValue,
    login: loginValue && GITHUB_LOGIN_PATTERN.test(loginValue) ? loginValue : undefined,
    code: codeValue && isErrorCode(codeValue) ? codeValue : undefined,
    retryAt: retryAtValue && retryAtValue > 0 ? retryAtValue : undefined,
  };
}

export function githubSubmissionFromSearch(
  search: GithubVerificationSearch,
): GithubSubmission | undefined {
  if (
    search.status !== "submitted" ||
    !search.subject ||
    !search.transaction ||
    !search.claim ||
    search.output === undefined ||
    !search.login
  ) {
    return undefined;
  }
  return {
    subject: search.subject,
    transactionHash: search.transaction as ccc.Hex,
    claimId: search.claim as ccc.Hex,
    outputIndex: search.output,
    login: search.login,
  };
}

const ERROR_MESSAGES: Record<GithubVerificationErrorCode, string> = {
  invalid_request: "The verification request was not valid. Choose an identity and try again.",
  oauth_configuration_error: "GitHub verification is temporarily unavailable.",
  oauth_denied: "GitHub access was not approved. No claim was issued.",
  oauth_state_invalid: "This verification session expired or has already been used.",
  provider_rate_limited: "GitHub is rate limiting verification requests.",
  provider_unavailable: "GitHub could not complete verification. Try again shortly.",
  credential_revocation_failed:
    "Vellum could not release GitHub access. Remove Vellum from GitHub Authorized OAuth Apps before retrying.",
  verification_failed: "The GitHub account could not be verified.",
  issuer_unavailable: "The Vellum issuer is temporarily unavailable.",
  issuance_failed: "The account was verified, but the claim transaction could not be submitted.",
};

export function githubVerificationErrorMessage(code?: GithubVerificationErrorCode): string {
  return code
    ? ERROR_MESSAGES[code]
    : "The GitHub verification result was incomplete. Start a new verification.";
}

export class GithubVerificationRequestError extends Error {
  constructor(readonly code?: GithubVerificationErrorCode) {
    super(githubVerificationErrorMessage(code));
    this.name = "GithubVerificationRequestError";
  }
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function parseAuthorizationResponse(value: unknown, now: number): string {
  const body = record(value);
  const authorizationUrl = body && scalar(body.authorizationUrl);
  const expiresAt = body && positiveInteger(body.expiresAt);
  if (
    !body ||
    body.ok !== true ||
    body.version !== "1" ||
    body.platform !== "github" ||
    !authorizationUrl ||
    !expiresAt ||
    expiresAt <= now
  ) {
    throw new GithubVerificationRequestError("verification_failed");
  }

  let url: URL;
  try {
    url = new URL(authorizationUrl);
  } catch {
    throw new GithubVerificationRequestError("verification_failed");
  }
  const states = url.searchParams.getAll("state");
  const scopes = url.searchParams.getAll("scope");
  if (
    `${url.origin}${url.pathname}` !== GITHUB_AUTHORIZE_URL ||
    url.username ||
    url.password ||
    states.length !== 1 ||
    !/^[A-Za-z0-9_-]{43}$/.test(states[0]) ||
    scopes.length !== 1 ||
    scopes[0] !== "read:user"
  ) {
    throw new GithubVerificationRequestError("verification_failed");
  }
  return url.toString();
}

function errorCodeFromResponse(value: unknown): GithubVerificationErrorCode | undefined {
  const body = record(value);
  const error = body && record(body.error);
  const code = error && scalar(error.code);
  return code && isErrorCode(code) ? code : undefined;
}

export async function requestGithubAuthorization(
  did: string,
  fetchImplementation: FetchImplementation = globalThis.fetch,
  now: () => number = () => Math.floor(Date.now() / 1_000),
): Promise<string> {
  if (!isDidCkb(did)) throw new GithubVerificationRequestError("invalid_request");

  let response: Response;
  try {
    response = await fetchImplementation("/api/verify/github/start", {
      method: "POST",
      credentials: "same-origin",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({ version: "1", subject: { did } }),
    });
  } catch {
    throw new GithubVerificationRequestError("provider_unavailable");
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new GithubVerificationRequestError("verification_failed");
  }
  if (!response.ok) throw new GithubVerificationRequestError(errorCodeFromResponse(body));
  return parseAuthorizationResponse(body, now());
}

export async function fetchPublicIssuerMetadata(
  fetchImplementation: FetchImplementation = globalThis.fetch,
): Promise<PublicIssuerMetadata> {
  const response = await fetchImplementation("/api/issuer", {
    method: "GET",
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error("Issuer metadata is unavailable");

  const body = record(await response.json());
  const issuer = body && record(body.issuer);
  const did = issuer && scalar(issuer.did);
  if (
    !body ||
    body.ok !== true ||
    body.version !== "1" ||
    !issuer ||
    !did ||
    !isDidCkb(did) ||
    issuer.network !== "ckb_testnet" ||
    issuer.payer !== "issuer" ||
    issuer.submission !== "service"
  ) {
    throw new Error("Issuer metadata is invalid");
  }
  return { did, network: "ckb_testnet", payer: "issuer", submission: "service" };
}
