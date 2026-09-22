import {
  TELEGRAM_CLAIM_SCHEMA_HASH,
  TELEGRAM_CLAIM_SCHEMA_ID,
  TELEGRAM_COMMUNITY_CLAIM_SCHEMA_HASH,
  TELEGRAM_COMMUNITY_CLAIM_SCHEMA_ID,
  TELEGRAM_COMMUNITY_CLAIM_TTL_SECONDS,
  parseTelegramClaimPayload,
  parseTelegramCommunityClaimPayload,
  type TelegramCommunityMembership,
  type TelegramCommunityType,
} from "@vellum/schemas";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

import type { VerifiedClaim } from "./contracts.js";
import { OAuthConfigurationError, TelegramOAuthError } from "./errors.js";

const TELEGRAM_ISSUER = "https://oauth.telegram.org";
const TELEGRAM_AUTHORIZE_URL = `${TELEGRAM_ISSUER}/auth`;
const TELEGRAM_TOKEN_URL = `${TELEGRAM_ISSUER}/token`;
const TELEGRAM_JWKS_URL = `${TELEGRAM_ISSUER}/.well-known/jwks.json`;
const TELEGRAM_BOT_API_URL = "https://api.telegram.org";
const TELEGRAM_SCOPES = ["openid", "profile"] as const;
const PROVIDER_TIMEOUT_MS = 10_000;
const USER_ID_PATTERN = /^[1-9][0-9]{0,19}$/;
const CHAT_ID_PATTERN = /^-[1-9][0-9]{0,19}$/;
const USERNAME_PATTERN = /^[A-Za-z0-9_]{1,32}$/;
const BOT_TOKEN_PATTERN = /^([1-9][0-9]{0,19}):([A-Za-z0-9_-]{20,256})$/;

const telegramJwks = createRemoteJWKSet(new URL(TELEGRAM_JWKS_URL), {
  cooldownDuration: 30_000,
  timeoutDuration: PROVIDER_TIMEOUT_MS,
});

export type TelegramOAuthEnvironment = {
  [key: string]: string | undefined;
  TELEGRAM_CLIENT_ID?: string;
  TELEGRAM_CLIENT_SECRET?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_OAUTH_CALLBACK_URL?: string;
  TELEGRAM_TRUSTED_COMMUNITIES?: string;
  VELLUM_OAUTH_STATE_SECRET?: string;
};

export type TrustedTelegramCommunity = {
  chatId: string;
  name: string;
  type: TelegramCommunityType;
};

export type TelegramOAuthConfig = {
  callbackUrl: URL;
  botToken: string;
  botUserId: string;
  clientId: string;
  clientSecret: string;
  stateSecret: string;
  trustedCommunities: readonly TrustedTelegramCommunity[];
};

export type TelegramFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type TelegramIdTokenVerifier = (
  token: string,
  config: TelegramOAuthConfig,
  now: number,
) => Promise<JWTPayload>;

export type TelegramVerifierDependencies = {
  fetch: TelegramFetch;
  now: () => number;
  sleep?: (delayMs: number) => Promise<void>;
  verifyIdToken?: TelegramIdTokenVerifier;
};

export type TelegramVerification = {
  account: {
    id: string;
    displayName: string;
    username?: string;
  };
  claims: [VerifiedClaim] | [VerifiedClaim, VerifiedClaim];
  memberships: TelegramCommunityMembership[];
};

async function verifyTelegramIdToken(
  token: string,
  config: TelegramOAuthConfig,
  now: number,
): Promise<JWTPayload> {
  const result = await jwtVerify(token, telegramJwks, {
    algorithms: ["RS256", "ES256"],
    audience: config.clientId,
    clockTolerance: 30,
    currentDate: new Date(now * 1_000),
    issuer: TELEGRAM_ISSUER,
    maxTokenAge: "10 minutes",
  });
  return result.payload;
}

const defaultDependencies: TelegramVerifierDependencies = {
  fetch: globalThis.fetch,
  now: () => Math.floor(Date.now() / 1_000),
  sleep: wait,
  verifyIdToken: verifyTelegramIdToken,
};

function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function requiredValue(value: string | undefined, name: string): string {
  if (!value || value.trim() !== value) {
    throw new OAuthConfigurationError(`The Telegram OAuth ${name} is not configured.`);
  }
  return value;
}

function isLoopback(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

function isLabel(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= 100 &&
    value.trim() === value &&
    [...value].every((character) => {
      const code = character.codePointAt(0)!;
      return code > 0x1f && code !== 0x7f;
    })
  );
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

export function parseTrustedTelegramCommunities(
  value: string | undefined,
): TrustedTelegramCommunity[] {
  if (value === undefined || value === "" || Buffer.byteLength(value, "utf8") > 16_384) {
    throw new OAuthConfigurationError("The trusted Telegram community configuration is missing.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new OAuthConfigurationError("The trusted Telegram community configuration is invalid.");
  }
  if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > 16) {
    throw new OAuthConfigurationError("The trusted Telegram community configuration is invalid.");
  }

  const communities = parsed.map((entry): TrustedTelegramCommunity => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new OAuthConfigurationError("The trusted Telegram community configuration is invalid.");
    }
    const community = entry as Record<string, unknown>;
    if (
      !exactKeys(community, ["chatId", "name", "type"]) ||
      typeof community.chatId !== "string" ||
      !CHAT_ID_PATTERN.test(community.chatId) ||
      !isLabel(community.name) ||
      (community.type !== "channel" &&
        community.type !== "group" &&
        community.type !== "supergroup")
    ) {
      throw new OAuthConfigurationError("The trusted Telegram community configuration is invalid.");
    }
    return {
      chatId: community.chatId,
      name: community.name,
      type: community.type,
    };
  });
  communities.sort((left, right) =>
    BigInt(left.chatId) < BigInt(right.chatId)
      ? -1
      : BigInt(left.chatId) > BigInt(right.chatId)
        ? 1
        : 0,
  );
  if (
    communities.some(
      (community, index) => index > 0 && communities[index - 1].chatId === community.chatId,
    )
  ) {
    throw new OAuthConfigurationError("The trusted Telegram community configuration is invalid.");
  }
  return communities;
}

export function telegramOAuthConfig(
  environment: TelegramOAuthEnvironment = process.env,
): TelegramOAuthConfig {
  const clientId = requiredValue(environment.TELEGRAM_CLIENT_ID, "client ID");
  const clientSecret = requiredValue(environment.TELEGRAM_CLIENT_SECRET, "client secret");
  const botToken = requiredValue(environment.TELEGRAM_BOT_TOKEN, "bot token");
  const callbackValue = requiredValue(environment.TELEGRAM_OAUTH_CALLBACK_URL, "callback URL");
  const stateSecret = requiredValue(environment.VELLUM_OAUTH_STATE_SECRET, "state secret");
  const botTokenMatch = BOT_TOKEN_PATTERN.exec(botToken);

  if (
    !USER_ID_PATTERN.test(clientId) ||
    !botTokenMatch ||
    clientSecret.length < 20 ||
    clientSecret.length > 512 ||
    Buffer.byteLength(stateSecret, "utf8") < 32 ||
    Buffer.byteLength(stateSecret, "utf8") > 1_024
  ) {
    throw new OAuthConfigurationError("The Telegram OAuth credentials are invalid.");
  }

  let callbackUrl: URL;
  try {
    callbackUrl = new URL(callbackValue);
  } catch {
    throw new OAuthConfigurationError("The Telegram OAuth callback URL is invalid.");
  }
  if (
    (callbackUrl.protocol !== "https:" &&
      !(callbackUrl.protocol === "http:" && isLoopback(callbackUrl.hostname))) ||
    callbackUrl.username ||
    callbackUrl.password ||
    callbackUrl.pathname !== "/api/verify/telegram/callback" ||
    callbackUrl.search ||
    callbackUrl.hash
  ) {
    throw new OAuthConfigurationError("The Telegram OAuth callback URL is invalid.");
  }

  return {
    callbackUrl,
    botToken,
    botUserId: botTokenMatch[1],
    clientId,
    clientSecret,
    stateSecret,
    trustedCommunities: parseTrustedTelegramCommunities(environment.TELEGRAM_TRUSTED_COMMUNITIES),
  };
}

export function telegramAuthorizationUrl(
  config: TelegramOAuthConfig,
  state: string,
  codeChallenge: string,
): string {
  const url = new URL(TELEGRAM_AUTHORIZE_URL);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.callbackUrl.toString());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", TELEGRAM_SCOPES.join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

async function providerFetch(
  fetchImplementation: TelegramFetch,
  input: string | URL,
  init: RequestInit,
): Promise<Response> {
  try {
    return await fetchImplementation(input, {
      ...init,
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
  } catch {
    throw new TelegramOAuthError(
      "provider_unavailable",
      502,
      "Telegram did not respond. Try connecting again.",
    );
  }
}

async function jsonBody(response: Response): Promise<Record<string, unknown>> {
  try {
    const value: unknown = await response.json();
    if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw new TelegramOAuthError(
      "provider_unavailable",
      502,
      "Telegram returned an invalid response. Try connecting again.",
    );
  }
}

function retryTimestamp(
  value: Record<string, unknown> | undefined,
  now: number,
  headers?: Headers,
): number | undefined {
  const parameters =
    typeof value?.parameters === "object" &&
    value.parameters !== null &&
    !Array.isArray(value.parameters)
      ? (value.parameters as Record<string, unknown>)
      : undefined;
  const header = headers?.get("retry-after");
  const headerSeconds = header && /^\d+$/.test(header) ? Number(header) : undefined;
  const retryAfter = parameters?.retry_after ?? value?.retry_after ?? headerSeconds;
  return typeof retryAfter === "number" &&
    Number.isSafeInteger(retryAfter) &&
    retryAfter >= 0 &&
    retryAfter <= 86_400 &&
    Number.isSafeInteger(now + retryAfter)
    ? now + retryAfter
    : undefined;
}

async function fetchChatMember(
  userId: string,
  community: TrustedTelegramCommunity,
  config: TelegramOAuthConfig,
  dependencies: TelegramVerifierDependencies,
): Promise<Record<string, unknown>> {
  const delays = [0, 250, 1_000, 2_000] as const;
  for (const [attempt, delayMs] of delays.entries()) {
    if (delayMs > 0) {
      await (dependencies.sleep ?? wait)(delayMs);
    }
    const response = await providerFetch(
      dependencies.fetch,
      `${TELEGRAM_BOT_API_URL}/bot${config.botToken}/getChatMember`,
      {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/x-www-form-urlencoded",
          "user-agent": "Vellum Telegram verifier",
        },
        body: new URLSearchParams({ chat_id: community.chatId, user_id: userId }),
      },
    );
    const body = await jsonBody(response);
    const description =
      typeof body.description === "string" && body.description.length <= 256
        ? body.description
        : undefined;
    const transientParticipantFailure =
      response.status === 400 && description?.includes("PARTICIPANT_ID_INVALID") === true;
    if (transientParticipantFailure && attempt < delays.length - 1) continue;
    if (!response.ok || body.ok !== true) {
      const limited = response.status === 429;
      throw new TelegramOAuthError(
        limited ? "provider_rate_limited" : "provider_unavailable",
        limited ? 429 : 502,
        limited
          ? "Telegram is rate limiting community checks. Try again shortly."
          : `Telegram could not verify the configured community${description ? `: ${description}` : "."}`,
        limited ? retryTimestamp(body, dependencies.now(), response.headers) : undefined,
      );
    }
    if (typeof body.result !== "object" || body.result === null || Array.isArray(body.result)) {
      throw new TelegramOAuthError(
        "provider_unavailable",
        502,
        "Telegram returned invalid community membership data.",
      );
    }
    return body.result as Record<string, unknown>;
  }
  throw new TelegramOAuthError(
    "provider_unavailable",
    502,
    "Telegram could not verify the configured community.",
  );
}

function memberUserId(member: Record<string, unknown>): string | undefined {
  const user =
    typeof member.user === "object" && member.user !== null && !Array.isArray(member.user)
      ? (member.user as Record<string, unknown>)
      : undefined;
  return telegramUserId(user?.id);
}

function membershipRole(
  member: Record<string, unknown>,
): TelegramCommunityMembership["member_role"] | undefined {
  if (member.status === "creator") return "owner";
  if (member.status === "administrator") return "administrator";
  if (member.status === "member" || (member.status === "restricted" && member.is_member === true)) {
    return "member";
  }
  if (member.status === "left" || member.status === "kicked") return undefined;
  throw new TelegramOAuthError(
    "provider_unavailable",
    502,
    "Telegram returned an unknown community membership status.",
  );
}

async function fetchCommunityMembership(
  userId: string,
  community: TrustedTelegramCommunity,
  config: TelegramOAuthConfig,
  dependencies: TelegramVerifierDependencies,
): Promise<TelegramCommunityMembership | undefined> {
  const bot = await fetchChatMember(config.botUserId, community, config, dependencies);
  if (
    memberUserId(bot) !== config.botUserId ||
    (bot.status !== "creator" && bot.status !== "administrator")
  ) {
    throw new TelegramOAuthError(
      "oauth_configuration_error",
      503,
      "The Vellum bot must be an administrator in every trusted Telegram community.",
    );
  }

  const member = await fetchChatMember(userId, community, config, dependencies);
  if (memberUserId(member) !== userId) {
    throw new TelegramOAuthError(
      "provider_unavailable",
      502,
      "Telegram returned community membership for a different account.",
    );
  }
  const role = membershipRole(member);
  return role
    ? {
        chat_id: community.chatId,
        community_name: community.name,
        community_type: community.type,
        member_role: role,
      }
    : undefined;
}

async function fetchCommunityMemberships(
  userId: string,
  config: TelegramOAuthConfig,
  dependencies: TelegramVerifierDependencies,
): Promise<TelegramCommunityMembership[]> {
  const memberships = await Promise.all(
    config.trustedCommunities.map((community) =>
      fetchCommunityMembership(userId, community, config, dependencies),
    ),
  );
  return memberships.filter(
    (membership): membership is TelegramCommunityMembership => membership !== undefined,
  );
}

function isDisplayName(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= 128 &&
    value.trim() === value &&
    [...value].every((character) => {
      const code = character.codePointAt(0)!;
      return code > 0x1f && code !== 0x7f;
    })
  );
}

function telegramUserId(value: unknown): string | undefined {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 ? String(value) : undefined;
  }
  if (typeof value !== "string" || !USER_ID_PATTERN.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 && String(parsed) === value ? value : undefined;
}

export async function verifyTelegramAuthorization(
  code: string,
  codeVerifier: string,
  config: TelegramOAuthConfig,
  dependencies: TelegramVerifierDependencies = defaultDependencies,
): Promise<TelegramVerification> {
  const response = await providerFetch(dependencies.fetch, TELEGRAM_TOKEN_URL, {
    method: "POST",
    headers: {
      accept: "application/json",
      authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`, "utf8").toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded",
      "user-agent": "Vellum Telegram verifier",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: config.callbackUrl.toString(),
      client_id: config.clientId,
      code_verifier: codeVerifier,
    }),
  });
  if (!response.ok) {
    let errorBody: Record<string, unknown> | undefined;
    try {
      errorBody = await jsonBody(response);
    } catch {
      errorBody = undefined;
    }
    const limited = response.status === 429;
    throw new TelegramOAuthError(
      limited ? "provider_rate_limited" : "provider_unavailable",
      limited ? 429 : 502,
      limited
        ? "Telegram is rate limiting verification. Try again shortly."
        : "Telegram could not complete verification. Try connecting again.",
      limited ? retryTimestamp(errorBody, dependencies.now(), response.headers) : undefined,
    );
  }

  const body = await jsonBody(response);
  if (
    typeof body.id_token !== "string" ||
    body.id_token.length < 1 ||
    body.id_token.length > 16_384 ||
    typeof body.token_type !== "string" ||
    body.token_type.toLowerCase() !== "bearer"
  ) {
    throw new TelegramOAuthError(
      "provider_unavailable",
      502,
      "Telegram returned an invalid authorization response. Try connecting again.",
    );
  }

  const verifiedAt = dependencies.now();
  let payload: JWTPayload;
  try {
    payload = await (dependencies.verifyIdToken ?? verifyTelegramIdToken)(
      body.id_token,
      config,
      verifiedAt,
    );
  } catch {
    throw new TelegramOAuthError(
      "provider_unavailable",
      502,
      "Telegram returned an invalid identity token. Try connecting again.",
    );
  }

  const accountId = telegramUserId(payload.id);
  if (
    typeof payload.sub !== "string" ||
    !USER_ID_PATTERN.test(payload.sub) ||
    !accountId ||
    !isDisplayName(payload.name) ||
    (payload.preferred_username !== undefined &&
      (typeof payload.preferred_username !== "string" ||
        !USERNAME_PATTERN.test(payload.preferred_username)))
  ) {
    throw new TelegramOAuthError(
      "provider_unavailable",
      502,
      "Telegram returned incomplete account data. Try connecting again.",
    );
  }

  const account = {
    id: accountId,
    displayName: payload.name,
    ...(payload.preferred_username ? { username: payload.preferred_username } : {}),
  };
  const claimPayload = parseTelegramClaimPayload({
    user_id: account.id,
    display_name: account.displayName,
    ...(account.username
      ? { username: account.username, profile_url: `https://t.me/${account.username}` }
      : {}),
    verified_at: verifiedAt,
  });

  const memberships = await fetchCommunityMemberships(account.id, config, dependencies);
  const communityPayload =
    memberships.length > 0
      ? parseTelegramCommunityClaimPayload({
          user_id: account.id,
          verified_at: verifiedAt,
          memberships,
        })
      : undefined;
  const identityClaim: VerifiedClaim = {
    schema: { id: TELEGRAM_CLAIM_SCHEMA_ID, hash: TELEGRAM_CLAIM_SCHEMA_HASH },
    payload: claimPayload,
    issuedAt: verifiedAt,
  };
  const communityClaim: VerifiedClaim | undefined = communityPayload
    ? {
        schema: {
          id: TELEGRAM_COMMUNITY_CLAIM_SCHEMA_ID,
          hash: TELEGRAM_COMMUNITY_CLAIM_SCHEMA_HASH,
        },
        payload: communityPayload,
        issuedAt: verifiedAt,
        expiresAt: verifiedAt + TELEGRAM_COMMUNITY_CLAIM_TTL_SECONDS,
      }
    : undefined;

  return {
    account,
    claims: communityClaim ? [identityClaim, communityClaim] : [identityClaim],
    memberships,
  };
}
