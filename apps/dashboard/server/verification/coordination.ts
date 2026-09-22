import { createHash, randomBytes } from "node:crypto";

import type { VerificationPlatform } from "./contracts.js";
import { OAuthConfigurationError, VerificationCoordinationError } from "./errors.js";

const CHALLENGE_PREFIX = "{vellum-verification}:challenge";
const ISSUANCE_PREFIX = "{vellum-verification}:issuance";
const ISSUER_LOCK_KEY = "{vellum-verification}:issuer-lock";
const ISSUANCE_COOLDOWN_SECONDS = 7 * 24 * 60 * 60;
const ISSUER_LOCK_SECONDS = 3 * 60;
const ISSUER_SETTLE_SECONDS = 30;

export type CoordinationEnvironment = {
  [key: string]: string | undefined;
  UPSTASH_REDIS_REST_TOKEN?: string;
  UPSTASH_REDIS_REST_URL?: string;
};

export type IssuanceReservation = {
  keys: readonly [string, string];
  token: string;
};

export type IssuerLease = { token: string };

export type IssuanceReservationResult =
  | { ok: true; reservation: IssuanceReservation }
  | { ok: false; retryAt: number };

export interface VerificationCoordinator {
  consumeOnce(id: string, expiresAt: number, now: number): Promise<boolean>;
  reserveIssuance(
    platform: VerificationPlatform,
    accountId: string,
    subjectDid: string,
    now: number,
  ): Promise<IssuanceReservationResult>;
  releaseIssuance(reservation: IssuanceReservation): Promise<void>;
  acquireIssuerLease(): Promise<IssuerLease | undefined>;
  settleIssuerLease(lease: IssuerLease): Promise<void>;
  releaseIssuerLease(lease: IssuerLease): Promise<void>;
}

type RedisFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function token(): string {
  return randomBytes(32).toString("base64url");
}

function assertTimestamp(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${field} must be a positive Unix timestamp`);
  }
}

function coordinationConfig(environment: CoordinationEnvironment): { token: string; url: string } {
  const urlValue = environment.UPSTASH_REDIS_REST_URL;
  const tokenValue = environment.UPSTASH_REDIS_REST_TOKEN;
  if (!urlValue || !tokenValue || tokenValue.trim() !== tokenValue || tokenValue.length > 4_096) {
    throw new OAuthConfigurationError("Verification coordination is not configured.");
  }

  let url: URL;
  try {
    url = new URL(urlValue);
  } catch {
    throw new OAuthConfigurationError("Verification coordination is not configured.");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new OAuthConfigurationError("Verification coordination is not configured.");
  }
  return { token: tokenValue, url: url.toString().replace(/\/$/, "") };
}

class RedisRest {
  constructor(
    private readonly config: { token: string; url: string },
    private readonly fetchImplementation: RedisFetch,
  ) {}

  async command(command: readonly (string | number)[]): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetchImplementation(this.config.url, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.config.token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(command),
        signal: AbortSignal.timeout(5_000),
      });
    } catch {
      throw new VerificationCoordinationError("Verification coordination is unavailable.");
    }
    if (!response.ok) {
      throw new VerificationCoordinationError("Verification coordination is unavailable.");
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new VerificationCoordinationError("Verification coordination is unavailable.");
    }
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      throw new VerificationCoordinationError("Verification coordination is unavailable.");
    }
    const result = body as { error?: unknown; result?: unknown };
    if ("error" in result || !("result" in result)) {
      throw new VerificationCoordinationError("Verification coordination is unavailable.");
    }
    return result.result;
  }
}

const RESERVE_SCRIPT = `
local first = redis.call("GET", KEYS[1])
local second = redis.call("GET", KEYS[2])
if first or second then
  local first_ttl = redis.call("TTL", KEYS[1])
  local second_ttl = redis.call("TTL", KEYS[2])
  return {0, math.max(first_ttl, second_ttl, 1)}
end
redis.call("SET", KEYS[1], ARGV[1], "EX", ARGV[2])
redis.call("SET", KEYS[2], ARGV[1], "EX", ARGV[2])
return {1, tonumber(ARGV[2])}
`.trim();

const RELEASE_SCRIPT = `
for index, key in ipairs(KEYS) do
  if redis.call("GET", key) == ARGV[1] then
    redis.call("DEL", key)
  end
end
return 1
`.trim();

const SETTLE_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("EXPIRE", KEYS[1], ARGV[2])
end
return 0
`.trim();

export class RedisVerificationCoordinator implements VerificationCoordinator {
  private readonly redis: RedisRest;

  constructor(environment: CoordinationEnvironment, fetchImplementation: RedisFetch = fetch) {
    this.redis = new RedisRest(coordinationConfig(environment), fetchImplementation);
  }

  async consumeOnce(id: string, expiresAt: number, now: number): Promise<boolean> {
    assertTimestamp(expiresAt, "Challenge expiry");
    assertTimestamp(now, "Current time");
    const ttl = expiresAt - now;
    if (ttl <= 0) return false;
    const result = await this.redis.command([
      "SET",
      `${CHALLENGE_PREFIX}:${digest(id)}`,
      "consumed",
      "NX",
      "EX",
      ttl,
    ]);
    return result === "OK";
  }

  async reserveIssuance(
    platform: VerificationPlatform,
    accountId: string,
    subjectDid: string,
    now: number,
  ): Promise<IssuanceReservationResult> {
    assertTimestamp(now, "Current time");
    const reservationToken = token();
    const keys = [
      `${ISSUANCE_PREFIX}:account:${platform}:${digest(accountId)}`,
      `${ISSUANCE_PREFIX}:subject:${platform}:${digest(subjectDid)}`,
    ] as const;
    const result = await this.redis.command([
      "EVAL",
      RESERVE_SCRIPT,
      2,
      ...keys,
      reservationToken,
      ISSUANCE_COOLDOWN_SECONDS,
    ]);
    if (
      !Array.isArray(result) ||
      result.length !== 2 ||
      ![0, 1].includes(Number(result[0])) ||
      !Number.isFinite(Number(result[1]))
    ) {
      throw new VerificationCoordinationError("Verification coordination is unavailable.");
    }
    if (Number(result[0]) === 0) {
      return { ok: false, retryAt: now + Math.max(1, Math.ceil(Number(result[1]))) };
    }
    return { ok: true, reservation: { keys, token: reservationToken } };
  }

  async releaseIssuance(reservation: IssuanceReservation): Promise<void> {
    await this.redis.command([
      "EVAL",
      RELEASE_SCRIPT,
      reservation.keys.length,
      ...reservation.keys,
      reservation.token,
    ]);
  }

  async acquireIssuerLease(): Promise<IssuerLease | undefined> {
    const lease = { token: token() };
    const result = await this.redis.command([
      "SET",
      ISSUER_LOCK_KEY,
      lease.token,
      "NX",
      "EX",
      ISSUER_LOCK_SECONDS,
    ]);
    return result === "OK" ? lease : undefined;
  }

  async releaseIssuerLease(lease: IssuerLease): Promise<void> {
    await this.redis.command(["EVAL", RELEASE_SCRIPT, 1, ISSUER_LOCK_KEY, lease.token]);
  }

  async settleIssuerLease(lease: IssuerLease): Promise<void> {
    await this.redis.command([
      "EVAL",
      SETTLE_SCRIPT,
      1,
      ISSUER_LOCK_KEY,
      lease.token,
      ISSUER_SETTLE_SECONDS,
    ]);
  }
}

type MemoryEntry = { expiresAt: number; value: string };

export class MemoryVerificationCoordinator implements VerificationCoordinator {
  private readonly values = new Map<string, MemoryEntry>();

  private get(key: string, now: number): MemoryEntry | undefined {
    const entry = this.values.get(key);
    if (entry && entry.expiresAt <= now) {
      this.values.delete(key);
      return undefined;
    }
    return entry;
  }

  async consumeOnce(id: string, expiresAt: number, now: number): Promise<boolean> {
    const key = `${CHALLENGE_PREFIX}:${digest(id)}`;
    if (expiresAt <= now || this.get(key, now)) return false;
    this.values.set(key, { expiresAt, value: "consumed" });
    return true;
  }

  async reserveIssuance(
    platform: VerificationPlatform,
    accountId: string,
    subjectDid: string,
    now: number,
  ): Promise<IssuanceReservationResult> {
    const keys = [
      `${ISSUANCE_PREFIX}:account:${platform}:${digest(accountId)}`,
      `${ISSUANCE_PREFIX}:subject:${platform}:${digest(subjectDid)}`,
    ] as const;
    const existing = keys.map((key) => this.get(key, now)).filter(Boolean) as MemoryEntry[];
    if (existing.length > 0) {
      return { ok: false, retryAt: Math.max(...existing.map(({ expiresAt }) => expiresAt)) };
    }
    const reservationToken = token();
    for (const key of keys) {
      this.values.set(key, {
        expiresAt: now + ISSUANCE_COOLDOWN_SECONDS,
        value: reservationToken,
      });
    }
    return { ok: true, reservation: { keys, token: reservationToken } };
  }

  async releaseIssuance(reservation: IssuanceReservation): Promise<void> {
    for (const key of reservation.keys) {
      if (this.values.get(key)?.value === reservation.token) this.values.delete(key);
    }
  }

  async acquireIssuerLease(): Promise<IssuerLease | undefined> {
    const now = Math.floor(Date.now() / 1_000);
    if (this.get(ISSUER_LOCK_KEY, now)) return undefined;
    const lease = { token: token() };
    this.values.set(ISSUER_LOCK_KEY, {
      expiresAt: now + ISSUER_LOCK_SECONDS,
      value: lease.token,
    });
    return lease;
  }

  async releaseIssuerLease(lease: IssuerLease): Promise<void> {
    if (this.values.get(ISSUER_LOCK_KEY)?.value === lease.token) {
      this.values.delete(ISSUER_LOCK_KEY);
    }
  }

  async settleIssuerLease(lease: IssuerLease): Promise<void> {
    const entry = this.values.get(ISSUER_LOCK_KEY);
    if (entry?.value === lease.token) {
      entry.expiresAt = Math.floor(Date.now() / 1_000) + ISSUER_SETTLE_SECONDS;
    }
  }
}

export function createVerificationCoordinator(
  environment: CoordinationEnvironment,
): VerificationCoordinator {
  return new RedisVerificationCoordinator(environment);
}
