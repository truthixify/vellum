import { ccc } from "@ckb-ccc/core";

import { isDidCkb } from "./verification-issuer";

export { fetchPublicIssuerMetadata, type PublicIssuerMetadata } from "./verification-issuer";

const HEX_32_PATTERN = /^0x[0-9a-f]{64}$/;
const GITHUB_LOGIN_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,98}[A-Za-z0-9])?$/;
const GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize";

export const GITHUB_VERIFICATION_ERROR_CODES = [
  "invalid_request",
  "oauth_configuration_error",
  "oauth_denied",
  "oauth_state_invalid",
  "subject_control_invalid",
  "verification_rate_limited",
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
  contributionClaim?: string;
  contributionOutput?: number;
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
  contribution?: {
    claimId: ccc.Hex;
    outputIndex: number;
  };
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
  const contributionClaimValue = scalar(search.contributionClaim);
  const contributionOutputValue = positiveInteger(search.contributionOutput);
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
    contributionClaim:
      contributionClaimValue && HEX_32_PATTERN.test(contributionClaimValue)
        ? contributionClaimValue
        : undefined,
    contributionOutput: contributionOutputValue,
    login: loginValue && GITHUB_LOGIN_PATTERN.test(loginValue) ? loginValue : undefined,
    code: codeValue && isErrorCode(codeValue) ? codeValue : undefined,
    retryAt: retryAtValue && retryAtValue > 0 ? retryAtValue : undefined,
  };
}

export function githubSubmissionFromSearch(
  search: GithubVerificationSearch,
): GithubSubmission | undefined {
  const hasContributionClaim = search.contributionClaim !== undefined;
  const hasContributionOutput = search.contributionOutput !== undefined;
  if (
    search.status !== "submitted" ||
    !search.subject ||
    !search.transaction ||
    !search.claim ||
    search.output === undefined ||
    !search.login ||
    hasContributionClaim !== hasContributionOutput ||
    (search.contributionClaim !== undefined && search.contributionClaim === search.claim) ||
    (search.contributionOutput !== undefined && search.contributionOutput === search.output)
  ) {
    return undefined;
  }
  const submission: GithubSubmission = {
    subject: search.subject,
    transactionHash: search.transaction as ccc.Hex,
    claimId: search.claim as ccc.Hex,
    outputIndex: search.output,
    login: search.login,
  };
  if (search.contributionClaim && search.contributionOutput !== undefined) {
    submission.contribution = {
      claimId: search.contributionClaim as ccc.Hex,
      outputIndex: search.contributionOutput,
    };
  }
  return submission;
}

const ERROR_MESSAGES: Record<GithubVerificationErrorCode, string> = {
  invalid_request: "The verification request was not valid. Choose an identity and try again.",
  oauth_configuration_error: "GitHub verification is temporarily unavailable.",
  oauth_denied: "GitHub access was not approved. No claim was issued.",
  oauth_state_invalid: "This verification session expired or has already been used.",
  subject_control_invalid: "The connected wallet does not control this identity.",
  verification_rate_limited: "This account or identity was verified recently.",
  provider_rate_limited: "GitHub is rate limiting verification requests.",
  provider_unavailable: "GitHub could not complete verification. Try again shortly.",
  credential_revocation_failed:
    "Vellum could not revoke GitHub access. Remove Vellum from GitHub Authorized OAuth Apps before retrying.",
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
  const codeChallenges = url.searchParams.getAll("code_challenge");
  const codeChallengeMethods = url.searchParams.getAll("code_challenge_method");
  if (
    `${url.origin}${url.pathname}` !== GITHUB_AUTHORIZE_URL ||
    url.username ||
    url.password ||
    states.length !== 1 ||
    !/^[A-Za-z0-9_-]{43}$/.test(states[0]) ||
    scopes.length !== 0 ||
    codeChallenges.length !== 1 ||
    !/^[A-Za-z0-9_-]{43}$/.test(codeChallenges[0]) ||
    codeChallengeMethods.length !== 1 ||
    codeChallengeMethods[0] !== "S256"
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

function parseChallengeResponse(
  value: unknown,
  now: number,
): {
  challenge: string;
  message: string;
} {
  const body = record(value);
  const challenge = body && scalar(body.challenge);
  const message = body && scalar(body.message);
  const expiresAt = body && positiveInteger(body.expiresAt);
  if (
    !body ||
    body.ok !== true ||
    body.version !== "1" ||
    body.platform !== "github" ||
    !challenge ||
    challenge.length > 4_096 ||
    !message ||
    message.length > 4_096 ||
    !expiresAt ||
    expiresAt <= now
  ) {
    throw new GithubVerificationRequestError("verification_failed");
  }
  return { challenge, message };
}

export async function requestGithubAuthorization(
  did: string,
  signer: Pick<ccc.Signer, "signMessage">,
  fetchImplementation: FetchImplementation = globalThis.fetch,
  now: () => number = () => Math.floor(Date.now() / 1_000),
): Promise<string> {
  if (!isDidCkb(did)) throw new GithubVerificationRequestError("invalid_request");

  let challengeResponse: Response;
  try {
    challengeResponse = await fetchImplementation("/api/verify/github/challenge", {
      method: "POST",
      credentials: "same-origin",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({ version: "1", subject: { did } }),
    });
  } catch {
    throw new GithubVerificationRequestError("provider_unavailable");
  }

  let challengeBody: unknown;
  try {
    challengeBody = await challengeResponse.json();
  } catch {
    throw new GithubVerificationRequestError("verification_failed");
  }
  if (!challengeResponse.ok) {
    throw new GithubVerificationRequestError(errorCodeFromResponse(challengeBody));
  }
  const challenge = parseChallengeResponse(challengeBody, now());

  let signature: ccc.Signature;
  try {
    signature = await signer.signMessage(challenge.message);
  } catch {
    throw new GithubVerificationRequestError("subject_control_invalid");
  }

  let response: Response;
  try {
    response = await fetchImplementation("/api/verify/github/start", {
      method: "POST",
      credentials: "same-origin",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({
        version: "1",
        subject: { did },
        proof: { challenge: challenge.challenge, signature },
      }),
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
