import { ccc } from "@ckb-ccc/core";

import { isDidCkb } from "./verification-issuer";

export { fetchPublicIssuerMetadata, type PublicIssuerMetadata } from "./verification-issuer";

const HEX_32_PATTERN = /^0x[0-9a-f]{64}$/;
const TELEGRAM_USER_ID_PATTERN = /^[1-9][0-9]{0,19}$/;
const TELEGRAM_USERNAME_PATTERN = /^[A-Za-z0-9_]{1,32}$/;
const TELEGRAM_AUTHORIZE_URL = "https://oauth.telegram.org/auth";

export const TELEGRAM_VERIFICATION_ERROR_CODES = [
  "invalid_request",
  "oauth_configuration_error",
  "oauth_denied",
  "oauth_state_invalid",
  "subject_control_invalid",
  "verification_rate_limited",
  "provider_rate_limited",
  "provider_unavailable",
  "verification_failed",
  "issuer_unavailable",
  "issuance_failed",
] as const;

export type TelegramVerificationErrorCode = (typeof TELEGRAM_VERIFICATION_ERROR_CODES)[number];

export type TelegramVerificationSearch = {
  status?: "error" | "submitted";
  subject?: string;
  transaction?: string;
  claim?: string;
  output?: number;
  communityClaim?: string;
  communityOutput?: number;
  communities?: number;
  account?: string;
  name?: string;
  username?: string;
  code?: TelegramVerificationErrorCode;
  retryAt?: number;
};

export type TelegramSubmission = {
  subject: string;
  transactionHash: ccc.Hex;
  claimId: ccc.Hex;
  outputIndex: number;
  communityClaimId?: ccc.Hex;
  communityOutputIndex?: number;
  communityCount: number;
  accountId: string;
  displayName: string;
  username?: string;
};

type FetchImplementation = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

function scalar(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function nonnegativeInteger(value: unknown): number | undefined {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^\d+$/.test(value)
        ? Number(value)
        : Number.NaN;
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

function telegramAccountId(value: unknown): string | undefined {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 ? String(value) : undefined;
  }
  if (typeof value !== "string" || !TELEGRAM_USER_ID_PATTERN.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 && String(parsed) === value ? value : undefined;
}

function isDisplayName(value: string): boolean {
  return (
    value.length >= 1 &&
    value.length <= 128 &&
    value.trim() === value &&
    [...value].every((character) => {
      const code = character.codePointAt(0)!;
      return code > 0x1f && code !== 0x7f;
    })
  );
}

function isErrorCode(value: string): value is TelegramVerificationErrorCode {
  return TELEGRAM_VERIFICATION_ERROR_CODES.some((code) => code === value);
}

export function parseTelegramVerificationSearch(
  search: Record<string, unknown>,
): TelegramVerificationSearch {
  const status = scalar(search.status);
  const subject = scalar(search.subject);
  const transaction = scalar(search.transaction);
  const claim = scalar(search.claim);
  const output = nonnegativeInteger(search.output);
  const communityClaim = scalar(search.communityClaim);
  const communityOutput = nonnegativeInteger(search.communityOutput);
  const communities = nonnegativeInteger(search.communities);
  const account = telegramAccountId(search.account);
  const name = scalar(search.name);
  const username = scalar(search.username);
  const code = scalar(search.code);
  const retryAt = nonnegativeInteger(search.retryAt);

  return {
    status: status === "submitted" || status === "error" ? status : undefined,
    subject: subject && isDidCkb(subject) ? subject : undefined,
    transaction: transaction && HEX_32_PATTERN.test(transaction) ? transaction : undefined,
    claim: claim && HEX_32_PATTERN.test(claim) ? claim : undefined,
    output,
    communityClaim:
      communityClaim && HEX_32_PATTERN.test(communityClaim) ? communityClaim : undefined,
    communityOutput,
    communities: communities !== undefined && communities <= 16 ? communities : undefined,
    account: account && TELEGRAM_USER_ID_PATTERN.test(account) ? account : undefined,
    name: name && isDisplayName(name) ? name : undefined,
    username: username && TELEGRAM_USERNAME_PATTERN.test(username) ? username : undefined,
    code: code && isErrorCode(code) ? code : undefined,
    retryAt: retryAt && retryAt > 0 ? retryAt : undefined,
  };
}

export function telegramSubmissionFromSearch(
  search: TelegramVerificationSearch,
): TelegramSubmission | undefined {
  const hasCommunityReference =
    search.communityClaim !== undefined && search.communityOutput !== undefined;
  if (
    search.status !== "submitted" ||
    !search.subject ||
    !search.transaction ||
    !search.claim ||
    search.output === undefined ||
    !search.account ||
    !search.name ||
    search.communities === undefined ||
    search.communities > 0 !== hasCommunityReference
  ) {
    return undefined;
  }
  return {
    subject: search.subject,
    transactionHash: search.transaction as ccc.Hex,
    claimId: search.claim as ccc.Hex,
    outputIndex: search.output,
    communityClaimId: search.communityClaim as ccc.Hex | undefined,
    communityOutputIndex: search.communityOutput,
    communityCount: search.communities,
    accountId: search.account,
    displayName: search.name,
    username: search.username,
  };
}

const ERROR_MESSAGES: Record<TelegramVerificationErrorCode, string> = {
  invalid_request: "The verification request was not valid. Choose an identity and try again.",
  oauth_configuration_error: "Telegram verification is temporarily unavailable.",
  oauth_denied: "Telegram access was not approved. No claim was issued.",
  oauth_state_invalid: "This verification session expired or has already been used.",
  subject_control_invalid: "The connected wallet does not control this identity.",
  verification_rate_limited: "This account or identity was verified recently.",
  provider_rate_limited: "Telegram is rate limiting verification requests.",
  provider_unavailable: "Telegram could not complete verification. Try again shortly.",
  verification_failed: "The Telegram account could not be verified.",
  issuer_unavailable: "The Vellum issuer is temporarily unavailable.",
  issuance_failed: "The account was verified, but the claim transaction could not be submitted.",
};

export function telegramVerificationErrorMessage(code?: TelegramVerificationErrorCode): string {
  return code
    ? ERROR_MESSAGES[code]
    : "The Telegram verification result was incomplete. Start a new verification.";
}

export class TelegramVerificationRequestError extends Error {
  constructor(readonly code?: TelegramVerificationErrorCode) {
    super(telegramVerificationErrorMessage(code));
    this.name = "TelegramVerificationRequestError";
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
  const expiresAt = body && nonnegativeInteger(body.expiresAt);
  if (
    !body ||
    body.ok !== true ||
    body.version !== "1" ||
    body.platform !== "telegram" ||
    !authorizationUrl ||
    !expiresAt ||
    expiresAt <= now
  ) {
    throw new TelegramVerificationRequestError("verification_failed");
  }

  let url: URL;
  try {
    url = new URL(authorizationUrl);
  } catch {
    throw new TelegramVerificationRequestError("verification_failed");
  }
  const states = url.searchParams.getAll("state");
  const scopes = url.searchParams.getAll("scope");
  const responseTypes = url.searchParams.getAll("response_type");
  const codeChallenges = url.searchParams.getAll("code_challenge");
  const codeChallengeMethods = url.searchParams.getAll("code_challenge_method");
  if (
    `${url.origin}${url.pathname}` !== TELEGRAM_AUTHORIZE_URL ||
    url.username ||
    url.password ||
    states.length !== 1 ||
    !/^[A-Za-z0-9_-]{43}$/.test(states[0]) ||
    scopes.length !== 1 ||
    scopes[0].split(/\s+/).sort().join(" ") !== "openid profile" ||
    responseTypes.length !== 1 ||
    responseTypes[0] !== "code" ||
    codeChallenges.length !== 1 ||
    !/^[A-Za-z0-9_-]{43}$/.test(codeChallenges[0]) ||
    codeChallengeMethods.length !== 1 ||
    codeChallengeMethods[0] !== "S256"
  ) {
    throw new TelegramVerificationRequestError("verification_failed");
  }
  return url.toString();
}

function errorCodeFromResponse(value: unknown): TelegramVerificationErrorCode | undefined {
  const body = record(value);
  const error = body && record(body.error);
  const code = error && scalar(error.code);
  return code && isErrorCode(code) ? code : undefined;
}

function parseChallengeResponse(
  value: unknown,
  now: number,
): { challenge: string; message: string } {
  const body = record(value);
  const challenge = body && scalar(body.challenge);
  const message = body && scalar(body.message);
  const expiresAt = body && nonnegativeInteger(body.expiresAt);
  if (
    !body ||
    body.ok !== true ||
    body.version !== "1" ||
    body.platform !== "telegram" ||
    !challenge ||
    challenge.length > 4_096 ||
    !message ||
    message.length > 4_096 ||
    !expiresAt ||
    expiresAt <= now
  ) {
    throw new TelegramVerificationRequestError("verification_failed");
  }
  return { challenge, message };
}

export async function requestTelegramAuthorization(
  did: string,
  signer: Pick<ccc.Signer, "signMessage">,
  fetchImplementation: FetchImplementation = globalThis.fetch,
  now: () => number = () => Math.floor(Date.now() / 1_000),
): Promise<string> {
  if (!isDidCkb(did)) throw new TelegramVerificationRequestError("invalid_request");

  let challengeResponse: Response;
  try {
    challengeResponse = await fetchImplementation("/api/verify/telegram/challenge", {
      method: "POST",
      credentials: "same-origin",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({ version: "1", subject: { did } }),
    });
  } catch {
    throw new TelegramVerificationRequestError("provider_unavailable");
  }

  let challengeBody: unknown;
  try {
    challengeBody = await challengeResponse.json();
  } catch {
    throw new TelegramVerificationRequestError("verification_failed");
  }
  if (!challengeResponse.ok) {
    throw new TelegramVerificationRequestError(errorCodeFromResponse(challengeBody));
  }
  const challenge = parseChallengeResponse(challengeBody, now());

  let signature: ccc.Signature;
  try {
    signature = await signer.signMessage(challenge.message);
  } catch {
    throw new TelegramVerificationRequestError("subject_control_invalid");
  }

  let response: Response;
  try {
    response = await fetchImplementation("/api/verify/telegram/start", {
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
    throw new TelegramVerificationRequestError("provider_unavailable");
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new TelegramVerificationRequestError("verification_failed");
  }
  if (!response.ok) throw new TelegramVerificationRequestError(errorCodeFromResponse(body));
  return parseAuthorizationResponse(body, now());
}
