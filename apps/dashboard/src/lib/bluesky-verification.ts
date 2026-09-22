import { ccc } from "@ckb-ccc/core";
import {
  AT_PROTOCOL_DID_PATTERN,
  BLUESKY_CLAIM_SCHEMA_HASH,
  BLUESKY_CLAIM_SCHEMA_ID,
  BLUESKY_HANDLE_PATTERN,
  parseBlueskyClaimPayload,
  type BlueskyClaimPayload,
} from "@vellum/schemas";

import { isDidCkb } from "./verification-issuer";

const HEX_32_PATTERN = /^0x[0-9a-f]{64}$/;
const APP_PASSWORD_URL = "https://bsky.app/settings/app-passwords";

export const BLUESKY_VERIFICATION_ERROR_CODES = [
  "invalid_request",
  "oauth_configuration_error",
  "subject_control_invalid",
  "verification_rate_limited",
  "provider_rate_limited",
  "provider_unavailable",
  "credential_revocation_failed",
  "verification_failed",
  "issuer_unavailable",
  "issuance_failed",
] as const;

export type BlueskyVerificationErrorCode = (typeof BLUESKY_VERIFICATION_ERROR_CODES)[number];

export type BlueskyVerificationSearch = {
  status?: "submitted";
  subject?: string;
  transaction?: string;
  claim?: string;
  output?: number;
  accountDid?: string;
  handle?: string;
};

export type BlueskySubmission = {
  subject: string;
  transactionHash: ccc.Hex;
  claimId: ccc.Hex;
  outputIndex: number;
  accountDid: string;
  handle: string;
};

export type BlueskyFormSpec = {
  appPasswordUrl: typeof APP_PASSWORD_URL;
};

type FetchImplementation = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

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

function isErrorCode(value: string): value is BlueskyVerificationErrorCode {
  return BLUESKY_VERIFICATION_ERROR_CODES.some((code) => code === value);
}

export function parseBlueskyVerificationSearch(
  search: Record<string, unknown>,
): BlueskyVerificationSearch {
  const status = scalar(search.status);
  const subject = scalar(search.subject);
  const transaction = scalar(search.transaction);
  const claim = scalar(search.claim);
  const output = nonnegativeInteger(search.output);
  const accountDid = scalar(search.accountDid);
  const handle = scalar(search.handle);
  return {
    status: status === "submitted" ? status : undefined,
    subject: subject && isDidCkb(subject) ? subject : undefined,
    transaction: transaction && HEX_32_PATTERN.test(transaction) ? transaction : undefined,
    claim: claim && HEX_32_PATTERN.test(claim) ? claim : undefined,
    output,
    accountDid:
      accountDid && accountDid.length <= 2_048 && AT_PROTOCOL_DID_PATTERN.test(accountDid)
        ? accountDid
        : undefined,
    handle:
      handle && handle.length <= 253 && BLUESKY_HANDLE_PATTERN.test(handle) ? handle : undefined,
  };
}

export function blueskySubmissionFromSearch(
  search: BlueskyVerificationSearch,
): BlueskySubmission | undefined {
  if (
    search.status !== "submitted" ||
    !search.subject ||
    !search.transaction ||
    !search.claim ||
    search.output === undefined ||
    !search.accountDid ||
    !search.handle
  ) {
    return undefined;
  }
  return {
    subject: search.subject,
    transactionHash: search.transaction as ccc.Hex,
    claimId: search.claim as ccc.Hex,
    outputIndex: search.output,
    accountDid: search.accountDid,
    handle: search.handle,
  };
}

export function blueskySubmissionSearch(
  submission: BlueskySubmission,
): Required<BlueskyVerificationSearch> {
  return {
    status: "submitted",
    subject: submission.subject,
    transaction: submission.transactionHash,
    claim: submission.claimId,
    output: submission.outputIndex,
    accountDid: submission.accountDid,
    handle: submission.handle,
  };
}

const ERROR_MESSAGES: Record<BlueskyVerificationErrorCode, string> = {
  invalid_request: "Enter a valid Bluesky handle and app password, then try again.",
  oauth_configuration_error: "Bluesky verification is temporarily unavailable.",
  subject_control_invalid: "The connected wallet does not control this identity.",
  verification_rate_limited: "This account or identity was verified recently.",
  provider_rate_limited: "Bluesky is rate limiting verification requests.",
  provider_unavailable: "Bluesky could not complete verification. Try again shortly.",
  credential_revocation_failed:
    "Vellum could not close temporary Bluesky access. Revoke the app password before retrying.",
  verification_failed: "The Bluesky handle or app password was not accepted.",
  issuer_unavailable: "The Vellum issuer is temporarily unavailable.",
  issuance_failed: "The account was verified, but the claim transaction could not be submitted.",
};

export function blueskyVerificationErrorMessage(code?: BlueskyVerificationErrorCode): string {
  return code ? ERROR_MESSAGES[code] : "Bluesky verification did not complete.";
}

export class BlueskyVerificationRequestError extends Error {
  constructor(
    readonly code?: BlueskyVerificationErrorCode,
    readonly retryAt?: number,
  ) {
    super(blueskyVerificationErrorMessage(code));
    this.name = "BlueskyVerificationRequestError";
  }
}

function matchesFormField(
  value: unknown,
  expected: {
    name: "handle" | "appPassword";
    type: "text" | "password";
    label: string;
    autoComplete: "username" | "off";
    minimumLength?: number;
    maximumLength: number;
  },
): boolean {
  const field = record(value);
  return (
    !!field &&
    Object.keys(field).length === (expected.minimumLength === undefined ? 6 : 7) &&
    field.name === expected.name &&
    field.type === expected.type &&
    field.label === expected.label &&
    field.autoComplete === expected.autoComplete &&
    field.required === true &&
    field.minimumLength === expected.minimumLength &&
    field.maximumLength === expected.maximumLength
  );
}

function errorFromResponse(value: unknown): BlueskyVerificationRequestError {
  const body = record(value);
  const error = body && record(body.error);
  const code = error && scalar(error.code);
  const retryAt = error && nonnegativeInteger(error.retryAt);
  return new BlueskyVerificationRequestError(
    code && isErrorCode(code) ? code : undefined,
    retryAt && retryAt > 0 ? retryAt : undefined,
  );
}

async function responseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new BlueskyVerificationRequestError("provider_unavailable");
  }
}

export async function fetchBlueskyFormSpec(
  fetchImplementation: FetchImplementation = globalThis.fetch,
): Promise<BlueskyFormSpec> {
  let response: Response;
  try {
    response = await fetchImplementation("/api/verify/bluesky/start", {
      method: "GET",
      credentials: "same-origin",
      headers: { accept: "application/json" },
    });
  } catch {
    throw new BlueskyVerificationRequestError("provider_unavailable");
  }
  const value = await responseJson(response);
  if (!response.ok) throw errorFromResponse(value);
  const body = record(value);
  if (
    !body ||
    body.ok !== true ||
    body.version !== "1" ||
    body.platform !== "bluesky" ||
    body.appPasswordUrl !== APP_PASSWORD_URL ||
    !Array.isArray(body.fields) ||
    body.fields.length !== 2 ||
    !matchesFormField(body.fields[0], {
      name: "handle",
      type: "text",
      label: "Bluesky handle",
      autoComplete: "username",
      maximumLength: 253,
    }) ||
    !matchesFormField(body.fields[1], {
      name: "appPassword",
      type: "password",
      label: "App password",
      autoComplete: "off",
      minimumLength: 19,
      maximumLength: 19,
    })
  ) {
    throw new BlueskyVerificationRequestError("provider_unavailable");
  }
  return { appPasswordUrl: APP_PASSWORD_URL };
}

function parseChallenge(value: unknown, now: number): { challenge: string; message: string } {
  const body = record(value);
  const challenge = body && scalar(body.challenge);
  const message = body && scalar(body.message);
  const expiresAt = body && nonnegativeInteger(body.expiresAt);
  if (
    !body ||
    body.ok !== true ||
    body.version !== "1" ||
    body.platform !== "bluesky" ||
    !challenge ||
    challenge.length > 4_096 ||
    !message ||
    message.length > 4_096 ||
    !expiresAt ||
    expiresAt <= now
  ) {
    throw new BlueskyVerificationRequestError("verification_failed");
  }
  return { challenge, message };
}

function parseSubmission(value: unknown, expectedSubject: string): BlueskySubmission {
  const body = record(value);
  const subject = body && record(body.subject);
  const account = body && record(body.account);
  const claim = body && record(body.claim);
  const schema = claim && record(claim.schema);
  const issuance = body && record(body.issuance);
  if (
    !body ||
    body.ok !== true ||
    body.version !== "1" ||
    body.platform !== "bluesky" ||
    !account ||
    !claim ||
    !schema ||
    !issuance ||
    subject?.did !== expectedSubject ||
    schema.id !== BLUESKY_CLAIM_SCHEMA_ID ||
    schema.hash !== BLUESKY_CLAIM_SCHEMA_HASH ||
    claim.expiresAt !== undefined ||
    !Number.isSafeInteger(claim.issuedAt) ||
    issuance.status !== "submitted" ||
    issuance.network !== "ckb_testnet" ||
    issuance.payer !== "issuer"
  ) {
    throw new BlueskyVerificationRequestError("verification_failed");
  }

  let payload: BlueskyClaimPayload;
  try {
    payload = parseBlueskyClaimPayload(claim.payload);
  } catch {
    throw new BlueskyVerificationRequestError("verification_failed");
  }
  const transactionHash = scalar(issuance.transactionHash);
  const claimId = scalar(issuance.claimId);
  const outputIndex = nonnegativeInteger(issuance.outputIndex);
  if (
    payload.verified_at !== claim.issuedAt ||
    account.did !== payload.did ||
    account.handle !== payload.handle ||
    account.profileUrl !== payload.profile_url ||
    !transactionHash ||
    !HEX_32_PATTERN.test(transactionHash) ||
    !claimId ||
    !HEX_32_PATTERN.test(claimId) ||
    outputIndex === undefined
  ) {
    throw new BlueskyVerificationRequestError("verification_failed");
  }
  return {
    subject: expectedSubject,
    transactionHash: transactionHash as ccc.Hex,
    claimId: claimId as ccc.Hex,
    outputIndex,
    accountDid: payload.did,
    handle: payload.handle,
  };
}

export async function submitBlueskyVerification(
  did: string,
  credentials: { handle: string; appPassword: string },
  signer: Pick<ccc.Signer, "signMessage">,
  fetchImplementation: FetchImplementation = globalThis.fetch,
  now: () => number = () => Math.floor(Date.now() / 1_000),
): Promise<BlueskySubmission> {
  if (!isDidCkb(did)) throw new BlueskyVerificationRequestError("invalid_request");

  let challengeResponse: Response;
  try {
    challengeResponse = await fetchImplementation("/api/verify/bluesky/challenge", {
      method: "POST",
      credentials: "same-origin",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({ version: "1", subject: { did } }),
    });
  } catch {
    throw new BlueskyVerificationRequestError("provider_unavailable");
  }
  const challengeBody = await responseJson(challengeResponse);
  if (!challengeResponse.ok) throw errorFromResponse(challengeBody);
  const challenge = parseChallenge(challengeBody, now());

  let signature: ccc.Signature;
  try {
    signature = await signer.signMessage(challenge.message);
  } catch {
    throw new BlueskyVerificationRequestError("subject_control_invalid");
  }

  let response: Response;
  try {
    response = await fetchImplementation("/api/verify/bluesky/submit", {
      method: "POST",
      credentials: "same-origin",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({
        version: "1",
        subject: { did },
        proof: { challenge: challenge.challenge, signature },
        handle: credentials.handle.trim().replace(/^@/, "").toLowerCase(),
        appPassword: credentials.appPassword,
      }),
    });
  } catch {
    throw new BlueskyVerificationRequestError("provider_unavailable");
  }
  const responseBody = await responseJson(response);
  if (!response.ok) throw errorFromResponse(responseBody);
  return parseSubmission(responseBody, did);
}
