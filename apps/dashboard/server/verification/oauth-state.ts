import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { didVerificationSubjectSchema, type DidVerificationSubject } from "./contracts";
import { OAuthConfigurationError, GithubOAuthError } from "./errors";

export const GITHUB_OAUTH_STATE_TTL_SECONDS = 5 * 60;
export const GITHUB_OAUTH_COOKIE_NAME = "vellum_github_oauth";

type OAuthStatePayload = {
  issuedAt: number;
  nonce: string;
  subject: DidVerificationSubject;
};

export type CreatedOAuthState = {
  codeChallenge: string;
  cookie: string;
  expiresAt: number;
  state: string;
};

export type ConsumedOAuthState = {
  codeVerifier: string;
  subject: DidVerificationSubject;
};

function stateSecret(value: string | undefined): string {
  if (!value || Buffer.byteLength(value, "utf8") < 32 || Buffer.byteLength(value, "utf8") > 1_024) {
    throw new OAuthConfigurationError("The OAuth state secret is not configured securely.");
  }
  return value;
}

function signature(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function codeVerifier(nonce: string, secret: string): string {
  return createHmac("sha256", secret).update(`github-pkce:${nonce}`).digest("base64url");
}

function codeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier, "ascii").digest("base64url");
}

function cookieAttributes(maxAge: number, secure: boolean): string {
  return [
    `Path=/api/verify/github/callback`,
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
    secure ? "Secure" : undefined,
  ]
    .filter((value): value is string => value !== undefined)
    .join("; ");
}

function cookieValue(header: string | null): string | undefined {
  if (!header) return undefined;
  const prefix = `${GITHUB_OAUTH_COOKIE_NAME}=`;
  const matches = header
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(prefix));
  if (matches.length !== 1) return undefined;
  return matches[0].slice(prefix.length);
}

function decodeBase64Url(value: string): Buffer {
  if (value.length > 2_048 || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new GithubOAuthError(
      "oauth_state_invalid",
      400,
      "The GitHub verification session is invalid.",
    );
  }
  const decoded = Buffer.from(value, "base64url");
  if (decoded.toString("base64url") !== value) {
    throw new GithubOAuthError(
      "oauth_state_invalid",
      400,
      "The GitHub verification session is invalid.",
    );
  }
  return decoded;
}

export function createGithubOAuthState(
  subject: DidVerificationSubject,
  secretValue: string | undefined,
  now: number,
  secure: boolean,
  nonceBytes: () => Uint8Array = () => randomBytes(32),
): CreatedOAuthState {
  const secret = stateSecret(secretValue);
  const parsedSubject = didVerificationSubjectSchema.parse(subject);
  if (!Number.isSafeInteger(now) || now <= 0) {
    throw new TypeError("OAuth state time must be a positive Unix timestamp");
  }

  const nonce = Buffer.from(nonceBytes()).toString("base64url");
  if (!/^[A-Za-z0-9_-]{43}$/.test(nonce)) {
    throw new TypeError("OAuth state nonce must contain 32 random bytes");
  }
  const payload: OAuthStatePayload = { issuedAt: now, nonce, subject: parsedSubject };
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const value = `${encodedPayload}.${signature(encodedPayload, secret)}`;
  const verifier = codeVerifier(nonce, secret);

  return {
    codeChallenge: codeChallenge(verifier),
    state: nonce,
    expiresAt: now + GITHUB_OAUTH_STATE_TTL_SECONDS,
    cookie: `${GITHUB_OAUTH_COOKIE_NAME}=${value}; ${cookieAttributes(
      GITHUB_OAUTH_STATE_TTL_SECONDS,
      secure,
    )}`,
  };
}

export function consumeGithubOAuthState(
  cookieHeader: string | null,
  queryState: string,
  secretValue: string | undefined,
  now: number,
): ConsumedOAuthState {
  const secret = stateSecret(secretValue);
  const value = cookieValue(cookieHeader);
  const parts = value?.split(".");
  if (!parts || parts.length !== 2) {
    throw new GithubOAuthError(
      "oauth_state_invalid",
      400,
      "The GitHub verification session is missing or has already been used.",
    );
  }

  const [encodedPayload, suppliedSignature] = parts;
  const expectedSignature = signature(encodedPayload, secret);
  const suppliedBytes = decodeBase64Url(suppliedSignature);
  const expectedBytes = Buffer.from(expectedSignature, "base64url");
  if (
    suppliedBytes.length !== expectedBytes.length ||
    !timingSafeEqual(suppliedBytes, expectedBytes)
  ) {
    throw new GithubOAuthError(
      "oauth_state_invalid",
      400,
      "The GitHub verification session is invalid.",
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(decodeBase64Url(encodedPayload).toString("utf8"));
  } catch {
    throw new GithubOAuthError(
      "oauth_state_invalid",
      400,
      "The GitHub verification session is invalid.",
    );
  }
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new GithubOAuthError(
      "oauth_state_invalid",
      400,
      "The GitHub verification session is invalid.",
    );
  }

  const candidate = payload as Partial<OAuthStatePayload>;
  const subject = didVerificationSubjectSchema.safeParse(candidate.subject);
  if (
    !subject.success ||
    typeof candidate.nonce !== "string" ||
    !/^[A-Za-z0-9_-]{43}$/.test(candidate.nonce) ||
    candidate.nonce !== queryState ||
    !Number.isSafeInteger(candidate.issuedAt) ||
    typeof candidate.issuedAt !== "number" ||
    candidate.issuedAt <= 0 ||
    candidate.issuedAt > now ||
    now >= candidate.issuedAt + GITHUB_OAUTH_STATE_TTL_SECONDS
  ) {
    throw new GithubOAuthError(
      "oauth_state_invalid",
      400,
      "The GitHub verification session is invalid or expired.",
    );
  }

  return {
    codeVerifier: codeVerifier(candidate.nonce, secret),
    subject: subject.data,
  };
}

export function clearGithubOAuthCookie(secure: boolean): string {
  return `${GITHUB_OAUTH_COOKIE_NAME}=; ${cookieAttributes(0, secure)}`;
}
