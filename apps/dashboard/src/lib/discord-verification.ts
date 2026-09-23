import { ccc } from "@ckb-ccc/core";

import { isDidCkb } from "./verification-issuer";

const HEX_32_PATTERN = /^0x[0-9a-f]{64}$/;
const DISCORD_AUTHORIZE_URL = "https://discord.com/oauth2/authorize";
const DISCORD_SCOPES = ["guilds.members.read", "identify"] as const;

export const DISCORD_VERIFICATION_ERROR_CODES = [
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

export type DiscordVerificationErrorCode = (typeof DISCORD_VERIFICATION_ERROR_CODES)[number];

export type DiscordVerificationSearch = {
  status?: "error" | "submitted";
  subject?: string;
  transaction?: string;
  claim?: string;
  output?: number;
  communityClaim?: string;
  communityOutput?: number;
  username?: string;
  communities?: number;
  code?: DiscordVerificationErrorCode;
  retryAt?: number;
};

export type DiscordSubmission = {
  subject: string;
  transactionHash: ccc.Hex;
  claimId: ccc.Hex;
  outputIndex: number;
  communityClaimId?: ccc.Hex;
  communityOutputIndex?: number;
  username: string;
  communityCount: number;
};

type FetchImplementation = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

function scalar(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function isDiscordUsername(value: string): boolean {
  return (
    value.length >= 1 &&
    value.length <= 32 &&
    [...value].every((character) => {
      const code = character.codePointAt(0)!;
      return code > 0x20 && code !== 0x7f;
    })
  );
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

function isErrorCode(value: string): value is DiscordVerificationErrorCode {
  return DISCORD_VERIFICATION_ERROR_CODES.some((code) => code === value);
}

export function parseDiscordVerificationSearch(
  search: Record<string, unknown>,
): DiscordVerificationSearch {
  const status = scalar(search.status);
  const subject = scalar(search.subject);
  const transaction = scalar(search.transaction);
  const claim = scalar(search.claim);
  const output = nonnegativeInteger(search.output);
  const communityClaim = scalar(search.communityClaim);
  const communityOutput = nonnegativeInteger(search.communityOutput);
  const username = scalar(search.username);
  const communities = nonnegativeInteger(search.communities);
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
    username: username && isDiscordUsername(username) ? username : undefined,
    communities: communities !== undefined && communities <= 16 ? communities : undefined,
    code: code && isErrorCode(code) ? code : undefined,
    retryAt: retryAt && retryAt > 0 ? retryAt : undefined,
  };
}

export function discordSubmissionFromSearch(
  search: DiscordVerificationSearch,
): DiscordSubmission | undefined {
  const hasCommunityReference =
    search.communityClaim !== undefined && search.communityOutput !== undefined;
  if (
    search.status !== "submitted" ||
    !search.subject ||
    !search.transaction ||
    !search.claim ||
    search.output === undefined ||
    !search.username ||
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
    username: search.username,
    communityCount: search.communities,
  };
}

const ERROR_MESSAGES: Record<DiscordVerificationErrorCode, string> = {
  invalid_request: "The verification request was not valid. Choose an identity and try again.",
  oauth_configuration_error: "Discord verification is temporarily unavailable.",
  oauth_denied: "Discord access was not approved. No claim was issued.",
  oauth_state_invalid: "This verification session expired or has already been used.",
  subject_control_invalid: "The connected wallet does not control this identity.",
  verification_rate_limited: "This account or identity was verified recently.",
  provider_rate_limited: "Discord is rate limiting verification requests.",
  provider_unavailable: "Discord could not complete verification. Try again shortly.",
  credential_revocation_failed:
    "Vellum could not revoke Discord access. Remove Vellum from Discord Authorized Apps before retrying.",
  verification_failed: "The Discord account could not be verified.",
  issuer_unavailable: "The Vellum issuer is temporarily unavailable.",
  issuance_failed: "The account was verified, but the claim transaction could not be submitted.",
};

export function discordVerificationErrorMessage(code?: DiscordVerificationErrorCode): string {
  return code
    ? ERROR_MESSAGES[code]
    : "The Discord verification result was incomplete. Start a new verification.";
}

export class DiscordVerificationRequestError extends Error {
  constructor(readonly code?: DiscordVerificationErrorCode) {
    super(discordVerificationErrorMessage(code));
    this.name = "DiscordVerificationRequestError";
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
    body.platform !== "discord" ||
    !authorizationUrl ||
    !expiresAt ||
    expiresAt <= now
  ) {
    throw new DiscordVerificationRequestError("verification_failed");
  }

  let url: URL;
  try {
    url = new URL(authorizationUrl);
  } catch {
    throw new DiscordVerificationRequestError("verification_failed");
  }
  const states = url.searchParams.getAll("state");
  const scopes = url.searchParams.getAll("scope");
  const responseTypes = url.searchParams.getAll("response_type");
  if (
    `${url.origin}${url.pathname}` !== DISCORD_AUTHORIZE_URL ||
    url.username ||
    url.password ||
    states.length !== 1 ||
    !/^[A-Za-z0-9_-]{43}$/.test(states[0]) ||
    scopes.length !== 1 ||
    scopes[0].split(/\s+/).sort().join(" ") !== DISCORD_SCOPES.join(" ") ||
    responseTypes.length !== 1 ||
    responseTypes[0] !== "code" ||
    url.searchParams.has("code_challenge")
  ) {
    throw new DiscordVerificationRequestError("verification_failed");
  }
  return url.toString();
}

function errorCodeFromResponse(value: unknown): DiscordVerificationErrorCode | undefined {
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
  const expiresAt = body && nonnegativeInteger(body.expiresAt);
  if (
    !body ||
    body.ok !== true ||
    body.version !== "1" ||
    body.platform !== "discord" ||
    !challenge ||
    challenge.length > 4_096 ||
    !message ||
    message.length > 4_096 ||
    !expiresAt ||
    expiresAt <= now
  ) {
    throw new DiscordVerificationRequestError("verification_failed");
  }
  return { challenge, message };
}

export async function requestDiscordAuthorization(
  did: string,
  signer: Pick<ccc.Signer, "signMessage">,
  fetchImplementation: FetchImplementation = globalThis.fetch,
  now: () => number = () => Math.floor(Date.now() / 1_000),
): Promise<string> {
  if (!isDidCkb(did)) throw new DiscordVerificationRequestError("invalid_request");

  let challengeResponse: Response;
  try {
    challengeResponse = await fetchImplementation("/api/verify/discord/challenge", {
      method: "POST",
      credentials: "same-origin",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({ version: "1", subject: { did } }),
    });
  } catch {
    throw new DiscordVerificationRequestError("provider_unavailable");
  }

  let challengeBody: unknown;
  try {
    challengeBody = await challengeResponse.json();
  } catch {
    throw new DiscordVerificationRequestError("verification_failed");
  }
  if (!challengeResponse.ok) {
    throw new DiscordVerificationRequestError(errorCodeFromResponse(challengeBody));
  }
  const challenge = parseChallengeResponse(challengeBody, now());

  let signature: ccc.Signature;
  try {
    signature = await signer.signMessage(challenge.message);
  } catch {
    throw new DiscordVerificationRequestError("subject_control_invalid");
  }

  let response: Response;
  try {
    response = await fetchImplementation("/api/verify/discord/start", {
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
    throw new DiscordVerificationRequestError("provider_unavailable");
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new DiscordVerificationRequestError("verification_failed");
  }
  if (!response.ok) throw new DiscordVerificationRequestError(errorCodeFromResponse(body));
  return parseAuthorizationResponse(body, now());
}
