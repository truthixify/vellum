import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { didVerificationSubjectSchema, type DidVerificationSubject } from "./contracts.js";
import {
  DiscordOAuthError,
  GithubOAuthError,
  OAuthConfigurationError,
  TelegramOAuthError,
} from "./errors.js";

export const GITHUB_OAUTH_STATE_TTL_SECONDS = 5 * 60;
export const GITHUB_OAUTH_COOKIE_NAME = "vellum_github_oauth";
export const DISCORD_OAUTH_STATE_TTL_SECONDS = 5 * 60;
export const DISCORD_OAUTH_COOKIE_NAME = "vellum_discord_oauth";
export const TELEGRAM_OAUTH_STATE_TTL_SECONDS = 5 * 60;
export const TELEGRAM_OAUTH_COOKIE_NAME = "vellum_telegram_oauth";

type OAuthProvider = "github" | "discord" | "telegram";

type OAuthStatePayload = {
  controllerLockHash: string;
  issuedAt: number;
  nonce: string;
  provider: OAuthProvider;
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
  controllerLockHash: string;
  subject: DidVerificationSubject;
};

export type CreatedDiscordOAuthState = Omit<CreatedOAuthState, "codeChallenge">;
export type ConsumedDiscordOAuthState = Pick<ConsumedOAuthState, "controllerLockHash" | "subject">;
export type CreatedTelegramOAuthState = CreatedOAuthState;
export type ConsumedTelegramOAuthState = ConsumedOAuthState & { expiresAt: number };

const PROVIDER_CONFIG = {
  github: {
    callbackPath: "/api/verify/github/callback",
    cookieName: GITHUB_OAUTH_COOKIE_NAME,
    displayName: "GitHub",
    ttl: GITHUB_OAUTH_STATE_TTL_SECONDS,
  },
  discord: {
    callbackPath: "/api/verify/discord/callback",
    cookieName: DISCORD_OAUTH_COOKIE_NAME,
    displayName: "Discord",
    ttl: DISCORD_OAUTH_STATE_TTL_SECONDS,
  },
  telegram: {
    callbackPath: "/api/verify/telegram/callback",
    cookieName: TELEGRAM_OAUTH_COOKIE_NAME,
    displayName: "Telegram",
    ttl: TELEGRAM_OAUTH_STATE_TTL_SECONDS,
  },
} as const;

function stateSecret(value: string | undefined): string {
  if (!value || Buffer.byteLength(value, "utf8") < 32 || Buffer.byteLength(value, "utf8") > 1_024) {
    throw new OAuthConfigurationError("The OAuth state secret is not configured securely.");
  }
  return value;
}

function signature(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function codeVerifier(provider: "github" | "telegram", nonce: string, secret: string): string {
  return createHmac("sha256", secret).update(`${provider}-pkce:${nonce}`).digest("base64url");
}

function codeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier, "ascii").digest("base64url");
}

function providerError(
  provider: OAuthProvider,
  message: string,
): GithubOAuthError | DiscordOAuthError | TelegramOAuthError {
  if (provider === "github") return new GithubOAuthError("oauth_state_invalid", 400, message);
  if (provider === "discord") return new DiscordOAuthError("oauth_state_invalid", 400, message);
  return new TelegramOAuthError("oauth_state_invalid", 400, message);
}

function cookieAttributes(provider: OAuthProvider, maxAge: number, secure: boolean): string {
  return [
    `Path=${PROVIDER_CONFIG[provider].callbackPath}`,
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
    secure ? "Secure" : undefined,
  ]
    .filter((value): value is string => value !== undefined)
    .join("; ");
}

function cookieValue(provider: OAuthProvider, header: string | null): string | undefined {
  if (!header) return undefined;
  const prefix = `${PROVIDER_CONFIG[provider].cookieName}=`;
  const matches = header
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(prefix));
  if (matches.length !== 1) return undefined;
  return matches[0].slice(prefix.length);
}

function decodeBase64Url(provider: OAuthProvider, value: string): Buffer {
  if (value.length > 2_048 || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw providerError(
      provider,
      `The ${PROVIDER_CONFIG[provider].displayName} verification session is invalid.`,
    );
  }
  const decoded = Buffer.from(value, "base64url");
  if (decoded.toString("base64url") !== value) {
    throw providerError(
      provider,
      `The ${PROVIDER_CONFIG[provider].displayName} verification session is invalid.`,
    );
  }
  return decoded;
}

function createProviderOAuthState(
  provider: OAuthProvider,
  subject: DidVerificationSubject,
  controllerLockHash: string,
  secretValue: string | undefined,
  now: number,
  secure: boolean,
  nonceBytes: () => Uint8Array,
): { cookie: string; expiresAt: number; nonce: string; secret: string } {
  const secret = stateSecret(secretValue);
  const parsedSubject = didVerificationSubjectSchema.parse(subject);
  if (!Number.isSafeInteger(now) || now <= 0) {
    throw new TypeError("OAuth state time must be a positive Unix timestamp");
  }
  if (!/^0x[0-9a-f]{64}$/.test(controllerLockHash)) {
    throw new TypeError("OAuth state controller lock hash must be 32 bytes");
  }

  const nonce = Buffer.from(nonceBytes()).toString("base64url");
  if (!/^[A-Za-z0-9_-]{43}$/.test(nonce)) {
    throw new TypeError("OAuth state nonce must contain 32 random bytes");
  }
  const payload: OAuthStatePayload = {
    controllerLockHash,
    issuedAt: now,
    nonce,
    provider,
    subject: parsedSubject,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const value = `${encodedPayload}.${signature(encodedPayload, secret)}`;
  const config = PROVIDER_CONFIG[provider];

  return {
    nonce,
    secret,
    expiresAt: now + config.ttl,
    cookie: `${config.cookieName}=${value}; ${cookieAttributes(provider, config.ttl, secure)}`,
  };
}

export function createGithubOAuthState(
  subject: DidVerificationSubject,
  controllerLockHash: string,
  secretValue: string | undefined,
  now: number,
  secure: boolean,
  nonceBytes: () => Uint8Array = () => randomBytes(32),
): CreatedOAuthState {
  const created = createProviderOAuthState(
    "github",
    subject,
    controllerLockHash,
    secretValue,
    now,
    secure,
    nonceBytes,
  );
  const verifier = codeVerifier("github", created.nonce, created.secret);

  return {
    codeChallenge: codeChallenge(verifier),
    state: created.nonce,
    expiresAt: created.expiresAt,
    cookie: created.cookie,
  };
}

export function createDiscordOAuthState(
  subject: DidVerificationSubject,
  controllerLockHash: string,
  secretValue: string | undefined,
  now: number,
  secure: boolean,
  nonceBytes: () => Uint8Array = () => randomBytes(32),
): CreatedDiscordOAuthState {
  const created = createProviderOAuthState(
    "discord",
    subject,
    controllerLockHash,
    secretValue,
    now,
    secure,
    nonceBytes,
  );
  return {
    state: created.nonce,
    expiresAt: created.expiresAt,
    cookie: created.cookie,
  };
}

export function createTelegramOAuthState(
  subject: DidVerificationSubject,
  controllerLockHash: string,
  secretValue: string | undefined,
  now: number,
  secure: boolean,
  nonceBytes: () => Uint8Array = () => randomBytes(32),
): CreatedTelegramOAuthState {
  const created = createProviderOAuthState(
    "telegram",
    subject,
    controllerLockHash,
    secretValue,
    now,
    secure,
    nonceBytes,
  );
  const verifier = codeVerifier("telegram", created.nonce, created.secret);
  return {
    codeChallenge: codeChallenge(verifier),
    state: created.nonce,
    expiresAt: created.expiresAt,
    cookie: created.cookie,
  };
}

function consumeProviderOAuthState(
  provider: OAuthProvider,
  cookieHeader: string | null,
  queryState: string,
  secretValue: string | undefined,
  now: number,
): {
  controllerLockHash: string;
  expiresAt: number;
  nonce: string;
  secret: string;
  subject: DidVerificationSubject;
} {
  const secret = stateSecret(secretValue);
  const value = cookieValue(provider, cookieHeader);
  const parts = value?.split(".");
  const displayName = PROVIDER_CONFIG[provider].displayName;
  if (!parts || parts.length !== 2) {
    throw providerError(
      provider,
      `The ${displayName} verification session is missing or has already been used.`,
    );
  }

  const [encodedPayload, suppliedSignature] = parts;
  const expectedSignature = signature(encodedPayload, secret);
  const suppliedBytes = decodeBase64Url(provider, suppliedSignature);
  const expectedBytes = Buffer.from(expectedSignature, "base64url");
  if (
    suppliedBytes.length !== expectedBytes.length ||
    !timingSafeEqual(suppliedBytes, expectedBytes)
  ) {
    throw providerError(provider, `The ${displayName} verification session is invalid.`);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(decodeBase64Url(provider, encodedPayload).toString("utf8"));
  } catch (error) {
    if (
      error instanceof GithubOAuthError ||
      error instanceof DiscordOAuthError ||
      error instanceof TelegramOAuthError
    ) {
      throw error;
    }
    throw providerError(provider, `The ${displayName} verification session is invalid.`);
  }
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw providerError(provider, `The ${displayName} verification session is invalid.`);
  }

  const candidate = payload as Partial<OAuthStatePayload>;
  const subject = didVerificationSubjectSchema.safeParse(candidate.subject);
  const ttl = PROVIDER_CONFIG[provider].ttl;
  if (
    candidate.provider !== provider ||
    !subject.success ||
    typeof candidate.controllerLockHash !== "string" ||
    !/^0x[0-9a-f]{64}$/.test(candidate.controllerLockHash) ||
    typeof candidate.nonce !== "string" ||
    !/^[A-Za-z0-9_-]{43}$/.test(candidate.nonce) ||
    candidate.nonce !== queryState ||
    !Number.isSafeInteger(candidate.issuedAt) ||
    typeof candidate.issuedAt !== "number" ||
    candidate.issuedAt <= 0 ||
    candidate.issuedAt > now ||
    now >= candidate.issuedAt + ttl
  ) {
    throw providerError(provider, `The ${displayName} verification session is invalid or expired.`);
  }

  return {
    controllerLockHash: candidate.controllerLockHash,
    expiresAt: candidate.issuedAt + ttl,
    nonce: candidate.nonce,
    secret,
    subject: subject.data,
  };
}

export function consumeGithubOAuthState(
  cookieHeader: string | null,
  queryState: string,
  secretValue: string | undefined,
  now: number,
): ConsumedOAuthState {
  const consumed = consumeProviderOAuthState("github", cookieHeader, queryState, secretValue, now);

  return {
    codeVerifier: codeVerifier("github", consumed.nonce, consumed.secret),
    controllerLockHash: consumed.controllerLockHash,
    subject: consumed.subject,
  };
}

export function consumeDiscordOAuthState(
  cookieHeader: string | null,
  queryState: string,
  secretValue: string | undefined,
  now: number,
): ConsumedDiscordOAuthState {
  const consumed = consumeProviderOAuthState("discord", cookieHeader, queryState, secretValue, now);
  return { controllerLockHash: consumed.controllerLockHash, subject: consumed.subject };
}

export function consumeTelegramOAuthState(
  cookieHeader: string | null,
  queryState: string,
  secretValue: string | undefined,
  now: number,
): ConsumedTelegramOAuthState {
  const consumed = consumeProviderOAuthState(
    "telegram",
    cookieHeader,
    queryState,
    secretValue,
    now,
  );
  return {
    codeVerifier: codeVerifier("telegram", consumed.nonce, consumed.secret),
    controllerLockHash: consumed.controllerLockHash,
    expiresAt: consumed.expiresAt,
    subject: consumed.subject,
  };
}

export function clearGithubOAuthCookie(secure: boolean): string {
  return `${GITHUB_OAUTH_COOKIE_NAME}=; ${cookieAttributes("github", 0, secure)}`;
}

export function clearDiscordOAuthCookie(secure: boolean): string {
  return `${DISCORD_OAUTH_COOKIE_NAME}=; ${cookieAttributes("discord", 0, secure)}`;
}

export function clearTelegramOAuthCookie(secure: boolean): string {
  return `${TELEGRAM_OAUTH_COOKIE_NAME}=; ${cookieAttributes("telegram", 0, secure)}`;
}
