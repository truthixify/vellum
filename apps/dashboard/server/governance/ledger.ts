import { createHash } from "node:crypto";

import { z } from "zod";

import {
  GOVERNANCE_API_VERSION,
  GOVERNANCE_CHOICES,
  GOVERNANCE_NETWORK,
  type GovernanceResults,
  type GovernanceVoteReceipt,
} from "../../src/lib/governance-contracts.js";

const KEY_PREFIX = "{vellum-governance}";

export type GovernanceLedgerEnvironment = {
  [key: string]: string | undefined;
  UPSTASH_REDIS_REST_TOKEN?: string;
  UPSTASH_REDIS_REST_URL?: string;
};

export type RecordVoteResult =
  | { status: "recorded"; receipt: GovernanceVoteReceipt }
  | { status: "existing"; receipt: GovernanceVoteReceipt }
  | { status: "challenge-replayed" };

export interface GovernanceLedger {
  getResults(proposalId: string): Promise<GovernanceResults>;
  getVote(proposalId: string, subjectDid: string): Promise<GovernanceVoteReceipt | undefined>;
  getReceipt(receiptId: string): Promise<GovernanceVoteReceipt | undefined>;
  recordVote(
    receipt: GovernanceVoteReceipt,
    nonce: string,
    challengeExpiresAt: number,
    now: number,
  ): Promise<RecordVoteResult>;
}

export class GovernanceStorageUnavailableError extends Error {
  constructor() {
    super("The governance vote ledger is unavailable.");
    this.name = "GovernanceStorageUnavailableError";
  }
}

type RedisFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function governanceReceiptId(proposalId: string, subjectDid: string): string {
  return `0x${digest(`${proposalId}\0${subjectDid}`)}`;
}

function proposalKey(proposalId: string): string {
  return digest(proposalId);
}

function voteKey(proposalId: string, subjectDid: string): string {
  return `${KEY_PREFIX}:proposal:${proposalKey(proposalId)}:vote:${digest(subjectDid)}`;
}

function receiptKey(receiptId: string): string {
  return `${KEY_PREFIX}:receipt:${digest(receiptId)}`;
}

function nonceKey(nonce: string): string {
  return `${KEY_PREFIX}:challenge:${digest(nonce)}`;
}

function tallyKey(proposalId: string): string {
  return `${KEY_PREFIX}:proposal:${proposalKey(proposalId)}:tally`;
}

function redisConfig(environment: GovernanceLedgerEnvironment): { token: string; url: string } {
  const token = environment.UPSTASH_REDIS_REST_TOKEN;
  const urlValue = environment.UPSTASH_REDIS_REST_URL;
  if (!token || token.trim() !== token || token.length > 4_096 || !urlValue) {
    throw new GovernanceStorageUnavailableError();
  }
  let url: URL;
  try {
    url = new URL(urlValue);
  } catch {
    throw new GovernanceStorageUnavailableError();
  }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new GovernanceStorageUnavailableError();
  }
  return { token, url: url.toString().replace(/\/$/, "") };
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
      throw new GovernanceStorageUnavailableError();
    }
    if (!response.ok) throw new GovernanceStorageUnavailableError();

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new GovernanceStorageUnavailableError();
    }
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      throw new GovernanceStorageUnavailableError();
    }
    const result = body as { error?: unknown; result?: unknown };
    if ("error" in result || !("result" in result)) throw new GovernanceStorageUnavailableError();
    return result.result;
  }
}

const evidenceSchema = z
  .object({
    claimId: z.string().regex(/^0x[0-9a-f]{64}$/),
    transactionHash: z.string().regex(/^0x[0-9a-f]{64}$/),
    outputIndex: z.number().int().nonnegative().safe(),
    issuerDid: z.string().startsWith("did:ckb:"),
    schemaHash: z.string().regex(/^0x[0-9a-f]{64}$/),
    issuedAt: z.number().int().positive().safe(),
  })
  .strict();

const receiptSchema = z
  .object({
    version: z.literal(GOVERNANCE_API_VERSION),
    receiptId: z.string().regex(/^0x[0-9a-f]{64}$/),
    network: z.literal(GOVERNANCE_NETWORK),
    proposalId: z.string().min(1).max(128),
    subjectDid: z.string().startsWith("did:ckb:"),
    choice: z.enum(GOVERNANCE_CHOICES),
    participationWeight: z.number().int().min(1).max(5),
    eligibilityPolicyVersion: z.string().min(1).max(128),
    reputation: z
      .object({
        policyVersion: z.string().min(1).max(128),
        score: z.number().int().min(0).max(1_000),
        maximum: z.literal(1_000),
      })
      .strict(),
    evaluatedAt: z.number().int().positive().safe(),
    recordedAt: z.number().int().positive().safe(),
    controllerLockHash: z.string().regex(/^0x[0-9a-f]{64}$/),
    evidence: z.array(evidenceSchema).min(1).max(16),
  })
  .strict();

function parseReceipt(value: unknown): GovernanceVoteReceipt {
  let candidate = value;
  if (typeof value === "string") {
    try {
      candidate = JSON.parse(value);
    } catch {
      throw new GovernanceStorageUnavailableError();
    }
  }
  const parsed = receiptSchema.safeParse(candidate);
  if (!parsed.success) throw new GovernanceStorageUnavailableError();
  if (
    parsed.data.receiptId !== governanceReceiptId(parsed.data.proposalId, parsed.data.subjectDid)
  ) {
    throw new GovernanceStorageUnavailableError();
  }
  return parsed.data;
}

function emptyResults(): GovernanceResults {
  return {
    voterCount: 0,
    totalWeight: 0,
    tallies: GOVERNANCE_CHOICES.map((choice) => ({ choice, voterCount: 0, weight: 0 })),
  };
}

function safeCount(value: unknown): number {
  const count = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : Number.NaN;
  if (!Number.isSafeInteger(count) || count < 0) throw new GovernanceStorageUnavailableError();
  return count;
}

function parseHash(value: unknown): Map<string, unknown> {
  if (value === null) return new Map();
  if (Array.isArray(value) && value.length % 2 === 0) {
    const entries: [string, unknown][] = [];
    for (let index = 0; index < value.length; index += 2) {
      if (typeof value[index] !== "string") throw new GovernanceStorageUnavailableError();
      entries.push([value[index] as string, value[index + 1]]);
    }
    return new Map(entries);
  }
  if (typeof value === "object" && value !== null) {
    return new Map(Object.entries(value));
  }
  throw new GovernanceStorageUnavailableError();
}

function resultsFromHash(value: unknown): GovernanceResults {
  const hash = parseHash(value);
  if (hash.size === 0) return emptyResults();
  const yesWeight = safeCount(hash.get("yes_weight"));
  const yesVoters = safeCount(hash.get("yes_voters"));
  const noWeight = safeCount(hash.get("no_weight"));
  const noVoters = safeCount(hash.get("no_voters"));
  const totalWeight = safeCount(hash.get("total_weight"));
  const voterCount = safeCount(hash.get("voter_count"));
  if (yesWeight + noWeight !== totalWeight || yesVoters + noVoters !== voterCount) {
    throw new GovernanceStorageUnavailableError();
  }
  return {
    voterCount,
    totalWeight,
    tallies: [
      { choice: "yes", voterCount: yesVoters, weight: yesWeight },
      { choice: "no", voterCount: noVoters, weight: noWeight },
    ],
  };
}

const RECORD_VOTE_SCRIPT = `
local existing = redis.call("GET", KEYS[1])
if existing then
  return {0, existing}
end
if redis.call("EXISTS", KEYS[3]) == 1 then
  return {-1, ""}
end
redis.call("SET", KEYS[3], "consumed", "EX", ARGV[4])
redis.call("SET", KEYS[1], ARGV[1])
redis.call("SET", KEYS[2], ARGV[1])
redis.call("HINCRBY", KEYS[4], ARGV[2] .. "_weight", ARGV[3])
redis.call("HINCRBY", KEYS[4], ARGV[2] .. "_voters", 1)
redis.call("HINCRBY", KEYS[4], "total_weight", ARGV[3])
redis.call("HINCRBY", KEYS[4], "voter_count", 1)
return {1, ARGV[1]}
`.trim();

export class RedisGovernanceLedger implements GovernanceLedger {
  private readonly redis: RedisRest;

  constructor(environment: GovernanceLedgerEnvironment, fetchImplementation: RedisFetch = fetch) {
    this.redis = new RedisRest(redisConfig(environment), fetchImplementation);
  }

  async getResults(proposalId: string): Promise<GovernanceResults> {
    return resultsFromHash(await this.redis.command(["HGETALL", tallyKey(proposalId)]));
  }

  async getVote(
    proposalId: string,
    subjectDid: string,
  ): Promise<GovernanceVoteReceipt | undefined> {
    const value = await this.redis.command(["GET", voteKey(proposalId, subjectDid)]);
    return value === null ? undefined : parseReceipt(value);
  }

  async getReceipt(receiptId: string): Promise<GovernanceVoteReceipt | undefined> {
    const value = await this.redis.command(["GET", receiptKey(receiptId)]);
    return value === null ? undefined : parseReceipt(value);
  }

  async recordVote(
    receipt: GovernanceVoteReceipt,
    nonce: string,
    challengeExpiresAt: number,
    now: number,
  ): Promise<RecordVoteResult> {
    const parsed = parseReceipt(receipt);
    if (!Number.isSafeInteger(challengeExpiresAt) || !Number.isSafeInteger(now)) {
      throw new GovernanceStorageUnavailableError();
    }
    const ttl = challengeExpiresAt - now;
    if (ttl <= 0) return { status: "challenge-replayed" };
    const serialized = JSON.stringify(parsed);
    const result = await this.redis.command([
      "EVAL",
      RECORD_VOTE_SCRIPT,
      4,
      voteKey(parsed.proposalId, parsed.subjectDid),
      receiptKey(parsed.receiptId),
      nonceKey(nonce),
      tallyKey(parsed.proposalId),
      serialized,
      parsed.choice,
      parsed.participationWeight,
      ttl,
    ]);
    if (!Array.isArray(result) || result.length !== 2) {
      throw new GovernanceStorageUnavailableError();
    }
    const state = Number(result[0]);
    if (state === -1) return { status: "challenge-replayed" };
    if (state !== 0 && state !== 1) throw new GovernanceStorageUnavailableError();
    return {
      status: state === 1 ? "recorded" : "existing",
      receipt: parseReceipt(result[1]),
    };
  }
}

type MemoryNonce = { expiresAt: number };

export class MemoryGovernanceLedger implements GovernanceLedger {
  private readonly votes = new Map<string, GovernanceVoteReceipt>();
  private readonly receipts = new Map<string, GovernanceVoteReceipt>();
  private readonly nonces = new Map<string, MemoryNonce>();

  async getResults(proposalId: string): Promise<GovernanceResults> {
    const results = emptyResults();
    for (const receipt of this.votes.values()) {
      if (receipt.proposalId !== proposalId) continue;
      const tally = results.tallies.find(({ choice }) => choice === receipt.choice)!;
      tally.voterCount += 1;
      tally.weight += receipt.participationWeight;
      results.voterCount += 1;
      results.totalWeight += receipt.participationWeight;
    }
    return results;
  }

  async getVote(
    proposalId: string,
    subjectDid: string,
  ): Promise<GovernanceVoteReceipt | undefined> {
    return this.votes.get(voteKey(proposalId, subjectDid));
  }

  async getReceipt(receiptId: string): Promise<GovernanceVoteReceipt | undefined> {
    return this.receipts.get(receiptId);
  }

  async recordVote(
    receipt: GovernanceVoteReceipt,
    nonce: string,
    challengeExpiresAt: number,
    now: number,
  ): Promise<RecordVoteResult> {
    const parsed = parseReceipt(receipt);
    const key = voteKey(parsed.proposalId, parsed.subjectDid);
    const existing = this.votes.get(key);
    if (existing) return { status: "existing", receipt: existing };
    const priorNonce = this.nonces.get(nonce);
    if (challengeExpiresAt <= now || (priorNonce && priorNonce.expiresAt > now)) {
      return { status: "challenge-replayed" };
    }
    this.nonces.set(nonce, { expiresAt: challengeExpiresAt });
    this.votes.set(key, parsed);
    this.receipts.set(parsed.receiptId, parsed);
    return { status: "recorded", receipt: parsed };
  }
}

export function createGovernanceLedger(environment: GovernanceLedgerEnvironment): GovernanceLedger {
  return new RedisGovernanceLedger(environment);
}
