import {
  DISCORD_CLAIM_SCHEMA_HASH,
  DISCORD_CLAIM_SCHEMA_ID,
  DISCORD_COMMUNITY_CLAIM_SCHEMA_HASH,
  DISCORD_COMMUNITY_CLAIM_SCHEMA_ID,
  discordSnowflakeTimestamp,
  parseDiscordClaimPayload,
  parseDiscordCommunityClaimPayload,
  type DiscordCommunityMembership,
} from "@vellum/schemas";

import type { VerifiedClaim } from "./contracts.js";
import { DiscordOAuthError, OAuthConfigurationError } from "./errors.js";

const DISCORD_AUTHORIZE_URL = "https://discord.com/oauth2/authorize";
const DISCORD_TOKEN_URL = "https://discord.com/api/oauth2/token";
const DISCORD_REVOKE_URL = "https://discord.com/api/oauth2/token/revoke";
const DISCORD_API_URL = "https://discord.com/api/v10";
const DISCORD_SCOPES = ["guilds.members.read", "identify"] as const;
const PROVIDER_TIMEOUT_MS = 10_000;
const COMMUNITY_CLAIM_TTL_SECONDS = 30 * 86_400;
const SNOWFLAKE_PATTERN = /^[1-9][0-9]{16,19}$/;

export type TrustedDiscordRole = {
  roleId: string;
  name: string;
};

export type TrustedDiscordCommunity = {
  guildId: string;
  name: string;
  roles: readonly TrustedDiscordRole[];
};

export type DiscordOAuthEnvironment = {
  [key: string]: string | undefined;
  DISCORD_CLIENT_ID?: string;
  DISCORD_CLIENT_SECRET?: string;
  DISCORD_OAUTH_CALLBACK_URL?: string;
  DISCORD_TRUSTED_COMMUNITIES?: string;
  VELLUM_OAUTH_STATE_SECRET?: string;
};

export type DiscordOAuthConfig = {
  callbackUrl: URL;
  clientId: string;
  clientSecret: string;
  stateSecret: string;
  trustedCommunities: readonly TrustedDiscordCommunity[];
};

export type DiscordFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export type DiscordVerifierDependencies = {
  fetch: DiscordFetch;
  now: () => number;
};

export type DiscordVerification = {
  account: {
    id: string;
    username: string;
  };
  claims: [VerifiedClaim] | [VerifiedClaim, VerifiedClaim];
  memberships: DiscordCommunityMembership[];
};

const defaultDependencies: DiscordVerifierDependencies = {
  fetch: globalThis.fetch,
  now: () => Math.floor(Date.now() / 1_000),
};

type DiscordCredentials = {
  accessToken: string;
  valid: boolean;
};

function requiredValue(
  value: string | undefined,
  name: "client ID" | "client secret" | "callback URL" | "state secret",
): string {
  if (!value || value.trim() !== value) {
    throw new OAuthConfigurationError(`The Discord OAuth ${name} is not configured.`);
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

function isDiscordUsername(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= 32 &&
    [...value].every((character) => {
      const code = character.codePointAt(0)!;
      return code > 0x20 && code !== 0x7f;
    })
  );
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function compareSnowflakes(left: string, right: string): number {
  const leftValue = BigInt(left);
  const rightValue = BigInt(right);
  return leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
}

export function parseTrustedDiscordCommunities(
  value: string | undefined,
): TrustedDiscordCommunity[] {
  if (value === undefined || value === "") {
    throw new OAuthConfigurationError("The trusted Discord community configuration is missing.");
  }
  if (Buffer.byteLength(value, "utf8") > 16_384) {
    throw new OAuthConfigurationError("The trusted Discord community configuration is invalid.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new OAuthConfigurationError("The trusted Discord community configuration is invalid.");
  }
  if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > 16) {
    throw new OAuthConfigurationError("The trusted Discord community configuration is invalid.");
  }

  const communities = parsed.map((entry): TrustedDiscordCommunity => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new OAuthConfigurationError("The trusted Discord community configuration is invalid.");
    }
    const community = entry as Record<string, unknown>;
    if (
      !exactKeys(community, ["guildId", "name", "roles"]) ||
      typeof community.guildId !== "string" ||
      !SNOWFLAKE_PATTERN.test(community.guildId) ||
      !isLabel(community.name) ||
      !Array.isArray(community.roles) ||
      community.roles.length > 32
    ) {
      throw new OAuthConfigurationError("The trusted Discord community configuration is invalid.");
    }

    const roles = community.roles.map((entry): TrustedDiscordRole => {
      if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
        throw new OAuthConfigurationError(
          "The trusted Discord community configuration is invalid.",
        );
      }
      const role = entry as Record<string, unknown>;
      if (
        !exactKeys(role, ["name", "roleId"]) ||
        typeof role.roleId !== "string" ||
        !SNOWFLAKE_PATTERN.test(role.roleId) ||
        !isLabel(role.name)
      ) {
        throw new OAuthConfigurationError(
          "The trusted Discord community configuration is invalid.",
        );
      }
      return { roleId: role.roleId, name: role.name };
    });
    roles.sort((left, right) => compareSnowflakes(left.roleId, right.roleId));
    if (roles.some((role, index) => index > 0 && roles[index - 1].roleId === role.roleId)) {
      throw new OAuthConfigurationError("The trusted Discord community configuration is invalid.");
    }
    return { guildId: community.guildId, name: community.name, roles };
  });

  communities.sort((left, right) => compareSnowflakes(left.guildId, right.guildId));
  if (
    communities.some(
      (community, index) => index > 0 && communities[index - 1].guildId === community.guildId,
    )
  ) {
    throw new OAuthConfigurationError("The trusted Discord community configuration is invalid.");
  }
  return communities;
}

export function discordOAuthConfig(
  environment: DiscordOAuthEnvironment = process.env,
): DiscordOAuthConfig {
  const clientId = requiredValue(environment.DISCORD_CLIENT_ID, "client ID");
  const clientSecret = requiredValue(environment.DISCORD_CLIENT_SECRET, "client secret");
  const callbackValue = requiredValue(environment.DISCORD_OAUTH_CALLBACK_URL, "callback URL");
  const stateSecret = requiredValue(environment.VELLUM_OAUTH_STATE_SECRET, "state secret");

  if (!SNOWFLAKE_PATTERN.test(clientId) || clientSecret.length < 20 || clientSecret.length > 256) {
    throw new OAuthConfigurationError("The Discord OAuth credentials are invalid.");
  }
  if (
    Buffer.byteLength(stateSecret, "utf8") < 32 ||
    Buffer.byteLength(stateSecret, "utf8") > 1_024
  ) {
    throw new OAuthConfigurationError("The OAuth state secret is not configured securely.");
  }

  let callbackUrl: URL;
  try {
    callbackUrl = new URL(callbackValue);
  } catch {
    throw new OAuthConfigurationError("The Discord OAuth callback URL is invalid.");
  }
  if (
    (callbackUrl.protocol !== "https:" &&
      !(callbackUrl.protocol === "http:" && isLoopback(callbackUrl.hostname))) ||
    callbackUrl.username ||
    callbackUrl.password ||
    callbackUrl.pathname !== "/api/verify/discord/callback" ||
    callbackUrl.search ||
    callbackUrl.hash
  ) {
    throw new OAuthConfigurationError("The Discord OAuth callback URL is invalid.");
  }

  return {
    callbackUrl,
    clientId,
    clientSecret,
    stateSecret,
    trustedCommunities: parseTrustedDiscordCommunities(environment.DISCORD_TRUSTED_COMMUNITIES),
  };
}

export function discordAuthorizationUrl(config: DiscordOAuthConfig, state: string): string {
  const url = new URL(DISCORD_AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.callbackUrl.toString());
  url.searchParams.set("scope", DISCORD_SCOPES.join(" "));
  url.searchParams.set("state", state);
  return url.toString();
}

function timeoutSignal(): AbortSignal {
  return AbortSignal.timeout(PROVIDER_TIMEOUT_MS);
}

async function providerFetch(
  fetchImplementation: DiscordFetch,
  input: string | URL,
  init: RequestInit,
): Promise<Response> {
  try {
    return await fetchImplementation(input, { ...init, signal: timeoutSignal() });
  } catch {
    throw new DiscordOAuthError(
      "provider_unavailable",
      502,
      "Discord did not respond. Try connecting again.",
    );
  }
}

function retryTimestamp(response: Response, now: number): number | undefined {
  for (const name of ["retry-after", "x-ratelimit-reset-after"]) {
    const value = response.headers.get(name);
    if (value && Number.isFinite(Number(value)) && Number(value) >= 0) {
      return now + Math.ceil(Number(value));
    }
  }
  const reset = response.headers.get("x-ratelimit-reset");
  if (reset && Number.isFinite(Number(reset)) && Number(reset) > now) {
    return Math.ceil(Number(reset));
  }
  return undefined;
}

function throwProviderResponse(response: Response, now: number): never {
  if (response.status === 429) {
    throw new DiscordOAuthError(
      "provider_rate_limited",
      429,
      "Discord is rate limiting verification. Try again after the reset time.",
      retryTimestamp(response, now),
    );
  }
  throw new DiscordOAuthError(
    "provider_unavailable",
    502,
    "Discord could not complete verification. Try connecting again.",
  );
}

async function jsonBody(response: Response): Promise<Record<string, unknown>> {
  try {
    const value: unknown = await response.json();
    if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw new DiscordOAuthError(
      "provider_unavailable",
      502,
      "Discord returned an invalid response. Try connecting again.",
    );
  }
}

async function exchangeDiscordCode(
  code: string,
  config: DiscordOAuthConfig,
  dependencies: DiscordVerifierDependencies,
): Promise<DiscordCredentials> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: config.callbackUrl.toString(),
  });
  const response = await providerFetch(dependencies.fetch, DISCORD_TOKEN_URL, {
    method: "POST",
    headers: {
      accept: "application/json",
      authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`, "utf8").toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded",
      "user-agent": "Vellum Discord verifier",
    },
    body,
  });
  if (!response.ok) throwProviderResponse(response, dependencies.now());

  const value = await jsonBody(response);
  const scopes =
    typeof value.scope === "string" ? value.scope.split(/\s+/).filter(Boolean).sort() : [];
  if (
    typeof value.access_token !== "string" ||
    value.access_token.length < 1 ||
    value.access_token.length > 2_048 ||
    typeof value.token_type !== "string" ||
    value.token_type.toLowerCase() !== "bearer" ||
    scopes.length !== DISCORD_SCOPES.length ||
    scopes.some((scope, index) => scope !== DISCORD_SCOPES[index])
  ) {
    if (
      typeof value.access_token === "string" &&
      value.access_token.length >= 1 &&
      value.access_token.length <= 2_048
    ) {
      return { accessToken: value.access_token, valid: false };
    }
    throw new DiscordOAuthError(
      "provider_unavailable",
      502,
      "Discord returned an invalid authorization response. Try connecting again.",
    );
  }
  return { accessToken: value.access_token, valid: true };
}

async function fetchDiscordAccount(
  accessToken: string,
  dependencies: DiscordVerifierDependencies,
): Promise<{ id: string; username: string }> {
  const response = await providerFetch(dependencies.fetch, `${DISCORD_API_URL}/users/@me`, {
    method: "GET",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${accessToken}`,
      "user-agent": "Vellum Discord verifier",
    },
  });
  if (!response.ok) throwProviderResponse(response, dependencies.now());

  const value = await jsonBody(response);
  if (
    typeof value.id !== "string" ||
    !SNOWFLAKE_PATTERN.test(value.id) ||
    !isDiscordUsername(value.username) ||
    value.bot === true
  ) {
    throw new DiscordOAuthError(
      "provider_unavailable",
      502,
      "Discord returned incomplete account data. Try connecting again.",
    );
  }
  return { id: value.id, username: value.username };
}

async function fetchCommunityMembership(
  accessToken: string,
  community: TrustedDiscordCommunity,
  verifiedAt: number,
  dependencies: DiscordVerifierDependencies,
): Promise<DiscordCommunityMembership | undefined> {
  const response = await providerFetch(
    dependencies.fetch,
    `${DISCORD_API_URL}/users/@me/guilds/${community.guildId}/member`,
    {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${accessToken}`,
        "user-agent": "Vellum Discord verifier",
      },
    },
  );
  if (response.status === 404) return undefined;
  if (!response.ok) throwProviderResponse(response, dependencies.now());

  const value = await jsonBody(response);
  const joinedAt = typeof value.joined_at === "string" ? Date.parse(value.joined_at) : Number.NaN;
  if (
    !Number.isFinite(joinedAt) ||
    Math.floor(joinedAt / 1_000) <= 0 ||
    Math.floor(joinedAt / 1_000) > verifiedAt ||
    !Array.isArray(value.roles) ||
    value.roles.some((role) => typeof role !== "string" || !SNOWFLAKE_PATTERN.test(role))
  ) {
    throw new DiscordOAuthError(
      "provider_unavailable",
      502,
      "Discord returned incomplete community data. Try connecting again.",
    );
  }

  const assignedRoles = new Set(value.roles as string[]);
  return {
    guild_id: community.guildId,
    community_name: community.name,
    joined_at: Math.floor(joinedAt / 1_000),
    recognized_roles: community.roles
      .filter((role) => assignedRoles.has(role.roleId))
      .map((role) => ({ role_id: role.roleId, role_name: role.name })),
  };
}

async function fetchCommunityMemberships(
  accessToken: string,
  config: DiscordOAuthConfig,
  verifiedAt: number,
  dependencies: DiscordVerifierDependencies,
): Promise<DiscordCommunityMembership[]> {
  const memberships: DiscordCommunityMembership[] = [];
  for (const community of config.trustedCommunities) {
    const membership = await fetchCommunityMembership(
      accessToken,
      community,
      verifiedAt,
      dependencies,
    );
    if (membership) memberships.push(membership);
  }
  return memberships;
}

async function revokeDiscordCredentials(
  accessToken: string,
  config: DiscordOAuthConfig,
  dependencies: DiscordVerifierDependencies,
): Promise<void> {
  const response = await providerFetch(dependencies.fetch, DISCORD_REVOKE_URL, {
    method: "POST",
    headers: {
      accept: "application/json",
      authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`, "utf8").toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded",
      "user-agent": "Vellum Discord verifier",
    },
    body: new URLSearchParams({ token: accessToken, token_type_hint: "access_token" }),
  });
  if (response.ok) return;
  throw new DiscordOAuthError(
    "credential_revocation_failed",
    502,
    "Discord access could not be released. Remove Vellum from Discord Authorized Apps before retrying.",
    response.status === 429 ? retryTimestamp(response, dependencies.now()) : undefined,
  );
}

export async function verifyDiscordAuthorization(
  code: string,
  config: DiscordOAuthConfig,
  dependencies: DiscordVerifierDependencies = defaultDependencies,
): Promise<DiscordVerification> {
  let accessToken: string | undefined;
  let account: { id: string; username: string };
  let memberships: DiscordCommunityMembership[];
  let verifiedAt: number;

  try {
    const credentials = await exchangeDiscordCode(code, config, dependencies);
    accessToken = credentials.accessToken;
    if (!credentials.valid) {
      throw new DiscordOAuthError(
        "provider_unavailable",
        502,
        "Discord authorization did not grant the expected access. Start verification again.",
      );
    }
    account = await fetchDiscordAccount(accessToken, dependencies);
    verifiedAt = dependencies.now();
    memberships = await fetchCommunityMemberships(accessToken, config, verifiedAt, dependencies);
  } finally {
    if (accessToken) {
      await revokeDiscordCredentials(accessToken, config, dependencies);
      accessToken = undefined;
    }
  }

  let identityPayload;
  let communityPayload;
  try {
    identityPayload = parseDiscordClaimPayload({
      user_id: account.id,
      username: account.username,
      profile_url: `https://discord.com/users/${account.id}`,
      account_created_at: discordSnowflakeTimestamp(account.id),
      verified_at: verifiedAt,
    });
    communityPayload =
      memberships.length > 0
        ? parseDiscordCommunityClaimPayload({
            user_id: account.id,
            verified_at: verifiedAt,
            memberships,
          })
        : undefined;
  } catch {
    throw new DiscordOAuthError(
      "provider_unavailable",
      502,
      "Discord returned account data that cannot be verified.",
    );
  }

  const identityClaim: VerifiedClaim = {
    schema: { id: DISCORD_CLAIM_SCHEMA_ID, hash: DISCORD_CLAIM_SCHEMA_HASH },
    payload: identityPayload,
    issuedAt: verifiedAt,
  };
  const communityClaim: VerifiedClaim | undefined = communityPayload
    ? {
        schema: {
          id: DISCORD_COMMUNITY_CLAIM_SCHEMA_ID,
          hash: DISCORD_COMMUNITY_CLAIM_SCHEMA_HASH,
        },
        payload: communityPayload,
        issuedAt: verifiedAt,
        expiresAt: verifiedAt + COMMUNITY_CLAIM_TTL_SECONDS,
      }
    : undefined;

  return {
    account,
    memberships,
    claims: communityClaim ? [identityClaim, communityClaim] : [identityClaim],
  };
}
