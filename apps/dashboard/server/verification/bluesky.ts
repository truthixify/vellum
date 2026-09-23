import {
  AT_PROTOCOL_DID_PATTERN,
  BLUESKY_HANDLE_PATTERN,
  blueskyIdentitySchema,
  parseBlueskyClaimPayload,
  type BlueskyClaimPayload,
} from "@vellum/schemas";

import type { VerifiedClaim } from "./contracts.js";
import { BlueskyVerificationError, OAuthConfigurationError } from "./errors.js";

const BLUESKY_PDS_ORIGIN = "https://bsky.social";
const BLUESKY_PUBLIC_API_ORIGIN = "https://public.api.bsky.app";
const CREATE_SESSION_URL = `${BLUESKY_PDS_ORIGIN}/xrpc/com.atproto.server.createSession`;
const DELETE_SESSION_URL = `${BLUESKY_PDS_ORIGIN}/xrpc/com.atproto.server.deleteSession`;
const RESOLVE_HANDLE_URL = `${BLUESKY_PUBLIC_API_ORIGIN}/xrpc/com.atproto.identity.resolveHandle`;
const PROVIDER_TIMEOUT_MS = 10_000;
const BLUESKY_APP_PASSWORD_PATTERN = /^[a-z0-9]{4}(?:-[a-z0-9]{4}){3}$/;

export type BlueskyEnvironment = {
  [key: string]: string | undefined;
  VELLUM_OAUTH_STATE_SECRET?: string;
};

export type BlueskyFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export type BlueskyAccount = {
  did: string;
  handle: string;
  profileUrl: string;
};

export type BlueskyVerification = {
  account: BlueskyAccount;
  claim: VerifiedClaim;
};

export type BlueskyVerifierDependencies = {
  fetch: BlueskyFetch;
  now: () => number;
};

const defaultDependencies: BlueskyVerifierDependencies = {
  fetch: globalThis.fetch,
  now: () => Math.floor(Date.now() / 1_000),
};

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function scalar(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function retryAt(response: Response, now: number): number | undefined {
  const reset = response.headers.get("ratelimit-reset");
  if (reset && /^\d+$/.test(reset)) {
    const timestamp = Number(reset);
    if (Number.isSafeInteger(timestamp) && timestamp > now) return timestamp;
  }
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter && /^\d+$/.test(retryAfter)) {
    const seconds = Number(retryAfter);
    if (Number.isSafeInteger(seconds) && seconds >= 0) return now + seconds;
  }
  return undefined;
}

function providerError(
  response: Response,
  now: number,
  operation: "authenticate" | "resolve" | "close",
): BlueskyVerificationError {
  if (response.status === 429) {
    return new BlueskyVerificationError(
      "provider_rate_limited",
      429,
      "Bluesky is rate limiting verification requests.",
      retryAt(response, now),
    );
  }
  if (operation === "authenticate" && (response.status === 400 || response.status === 401)) {
    return new BlueskyVerificationError(
      "verification_failed",
      401,
      "The Bluesky handle or app password was not accepted.",
    );
  }
  if (operation === "close") {
    return new BlueskyVerificationError(
      "credential_revocation_failed",
      502,
      "The temporary Bluesky session could not be closed.",
    );
  }
  return new BlueskyVerificationError(
    "provider_unavailable",
    502,
    "Bluesky could not complete verification.",
  );
}

async function parseProviderJson(response: Response): Promise<Record<string, unknown>> {
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new BlueskyVerificationError(
      "provider_unavailable",
      502,
      "Bluesky returned an invalid response.",
    );
  }
  const parsed = record(value);
  if (!parsed) {
    throw new BlueskyVerificationError(
      "provider_unavailable",
      502,
      "Bluesky returned an invalid response.",
    );
  }
  return parsed;
}

async function createSession(
  handle: string,
  appPassword: string,
  dependencies: BlueskyVerifierDependencies,
): Promise<{ active: boolean; did?: string; handle?: string; refreshJwt: string }> {
  let response: Response;
  try {
    response = await dependencies.fetch(CREATE_SESSION_URL, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({ identifier: handle, password: appPassword }),
      redirect: "error",
      referrerPolicy: "no-referrer",
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
  } catch {
    throw new BlueskyVerificationError(
      "provider_unavailable",
      502,
      "Bluesky could not be reached.",
    );
  }
  if (!response.ok) throw providerError(response, dependencies.now(), "authenticate");

  const body = await parseProviderJson(response);
  const returnedHandle = scalar(body.handle)?.toLowerCase();
  const did = scalar(body.did);
  const refreshJwt = scalar(body.refreshJwt);
  if (!refreshJwt || refreshJwt.length > 16_384) {
    throw new BlueskyVerificationError(
      "provider_unavailable",
      502,
      "Bluesky returned an invalid authentication response.",
    );
  }
  return { active: body.active !== false, did, handle: returnedHandle, refreshJwt };
}

async function resolveHandle(
  handle: string,
  dependencies: BlueskyVerifierDependencies,
): Promise<string> {
  const url = new URL(RESOLVE_HANDLE_URL);
  url.searchParams.set("handle", handle);
  let response: Response;
  try {
    response = await dependencies.fetch(url, {
      method: "GET",
      headers: { accept: "application/json" },
      cache: "no-store",
      redirect: "error",
      referrerPolicy: "no-referrer",
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
  } catch {
    throw new BlueskyVerificationError(
      "provider_unavailable",
      502,
      "The Bluesky handle could not be resolved.",
    );
  }
  if (!response.ok) throw providerError(response, dependencies.now(), "resolve");
  const did = scalar((await parseProviderJson(response)).did);
  if (!did || did.length > 2_048 || !AT_PROTOCOL_DID_PATTERN.test(did)) {
    throw new BlueskyVerificationError(
      "provider_unavailable",
      502,
      "Bluesky returned an invalid identity resolution.",
    );
  }
  return did;
}

async function closeSession(
  refreshJwt: string,
  dependencies: BlueskyVerifierDependencies,
): Promise<void> {
  let response: Response;
  try {
    response = await dependencies.fetch(DELETE_SESSION_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${refreshJwt}` },
      redirect: "error",
      referrerPolicy: "no-referrer",
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
  } catch {
    throw new BlueskyVerificationError(
      "credential_revocation_failed",
      502,
      "The temporary Bluesky session could not be closed.",
    );
  }
  if (!response.ok) throw providerError(response, dependencies.now(), "close");
}

export function blueskyVerificationConfig(environment: BlueskyEnvironment): {
  stateSecret: string;
} {
  const stateSecret = environment.VELLUM_OAUTH_STATE_SECRET;
  if (
    !stateSecret ||
    Buffer.byteLength(stateSecret, "utf8") < 32 ||
    Buffer.byteLength(stateSecret, "utf8") > 1_024
  ) {
    throw new OAuthConfigurationError("Bluesky verification is not configured securely.");
  }
  return { stateSecret };
}

export function normalizeBlueskyHandle(value: string): string {
  const handle = value.trim().replace(/^@/, "").toLowerCase();
  if (handle.length > 253 || !BLUESKY_HANDLE_PATTERN.test(handle)) {
    throw new BlueskyVerificationError("verification_failed", 400, "Enter a valid Bluesky handle.");
  }
  return handle;
}

export async function verifyBlueskyCredentials(
  input: { handle: string; appPassword: string },
  dependencies: BlueskyVerifierDependencies = defaultDependencies,
): Promise<BlueskyVerification> {
  const handle = normalizeBlueskyHandle(input.handle);
  if (!BLUESKY_APP_PASSWORD_PATTERN.test(input.appPassword)) {
    throw new BlueskyVerificationError(
      "verification_failed",
      400,
      "Enter a dedicated Bluesky app password.",
    );
  }
  const issuedAt = dependencies.now();
  if (!Number.isSafeInteger(issuedAt) || issuedAt <= 0) {
    throw new TypeError("Invalid Bluesky verification timestamp");
  }

  const session = await createSession(handle, input.appPassword, dependencies);
  let resolvedDid: string | undefined;
  let verificationFailure: unknown;
  try {
    if (
      !session.active ||
      !session.handle ||
      session.handle !== handle ||
      session.handle.length > 253 ||
      !BLUESKY_HANDLE_PATTERN.test(session.handle) ||
      !session.did ||
      session.did.length > 2_048 ||
      !AT_PROTOCOL_DID_PATTERN.test(session.did)
    ) {
      throw new BlueskyVerificationError(
        "verification_failed",
        401,
        "The Bluesky account could not be verified as active.",
      );
    }
    resolvedDid = await resolveHandle(session.handle, dependencies);
    if (resolvedDid !== session.did) {
      throw new BlueskyVerificationError(
        "verification_failed",
        409,
        "The Bluesky handle does not currently resolve to the authenticated account.",
      );
    }
  } catch (error) {
    verificationFailure = error;
  }

  await closeSession(session.refreshJwt, dependencies);
  if (verificationFailure) throw verificationFailure;

  const payload: BlueskyClaimPayload = parseBlueskyClaimPayload({
    did: resolvedDid!,
    handle: session.handle,
    profile_url: `https://bsky.app/profile/${resolvedDid}`,
    verified_at: issuedAt,
  });
  return {
    account: {
      did: payload.did,
      handle: payload.handle,
      profileUrl: payload.profile_url,
    },
    claim: {
      schema: { id: blueskyIdentitySchema.id, hash: blueskyIdentitySchema.hash },
      payload,
      issuedAt,
    },
  };
}
