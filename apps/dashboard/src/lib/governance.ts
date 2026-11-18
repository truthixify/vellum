import type { ccc } from "@ckb-ccc/core";
import { z } from "zod";

import {
  GOVERNANCE_API_VERSION,
  GOVERNANCE_CHOICES,
  GOVERNANCE_NETWORK,
  GOVERNANCE_PROPOSAL,
  type GovernanceChallenge,
  type GovernanceChoice,
  type GovernanceErrorCode,
  type GovernanceEvaluation,
  type GovernanceProposalSnapshot,
  type GovernanceVoteReceipt,
  type GovernanceVoteResult,
} from "@/lib/governance-contracts";
import { isDidCkb } from "@/lib/verification-issuer";

type FetchImplementation = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

const safeTimestamp = z.number().int().positive().safe();
const hex32 = z.string().regex(/^0x[0-9a-f]{64}$/);
const choiceSchema = z.enum(GOVERNANCE_CHOICES);
const evidenceSchema = z
  .object({
    claimId: hex32,
    transactionHash: hex32,
    outputIndex: z.number().int().nonnegative().safe(),
    issuerDid: z.string().startsWith("did:ckb:"),
    schemaHash: hex32,
    issuedAt: safeTimestamp,
  })
  .strict();
const reputationSchema = z
  .object({
    policyVersion: z.string(),
    score: z.number().int().min(0).max(1_000),
    maximum: z.literal(1_000),
  })
  .strict();
const evaluationSchema = z
  .object({
    status: z.enum(["eligible", "ineligible"]),
    network: z.literal(GOVERNANCE_NETWORK),
    subjectDid: z.string().startsWith("did:ckb:"),
    evaluatedAt: safeTimestamp,
    eligibilityPolicyVersion: z.string(),
    reputation: reputationSchema,
    participationWeight: z.number().int().min(1).max(5).nullable(),
    evidence: z.array(evidenceSchema),
  })
  .strict();
const tallySchema = z
  .object({
    choice: choiceSchema,
    voterCount: z.number().int().nonnegative().safe(),
    weight: z.number().int().nonnegative().safe(),
  })
  .strict();
const resultsSchema = z
  .object({
    voterCount: z.number().int().nonnegative().safe(),
    totalWeight: z.number().int().nonnegative().safe(),
    tallies: z.array(tallySchema).length(2),
  })
  .strict();
const resultsStateSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("available"), results: resultsSchema }).strict(),
  z.object({ status: z.literal("unavailable"), message: z.string() }).strict(),
]);
const receiptSchema = z
  .object({
    version: z.literal(GOVERNANCE_API_VERSION),
    receiptId: hex32,
    network: z.literal(GOVERNANCE_NETWORK),
    proposalId: z.literal(GOVERNANCE_PROPOSAL.id),
    subjectDid: z.string().startsWith("did:ckb:"),
    choice: choiceSchema,
    participationWeight: z.number().int().min(1).max(5),
    eligibilityPolicyVersion: z.string(),
    reputation: reputationSchema,
    evaluatedAt: safeTimestamp,
    recordedAt: safeTimestamp,
    controllerLockHash: hex32,
    evidence: z.array(evidenceSchema).min(1),
  })
  .strict();

const ERROR_CODES = [
  "invalid_request",
  "method_not_allowed",
  "proposal_not_open",
  "subject_not_found",
  "subject_control_invalid",
  "challenge_invalid",
  "ineligible",
  "already_voted",
  "receipt_not_found",
  "service_unavailable",
] as const satisfies readonly GovernanceErrorCode[];

const errorSchema = z
  .object({
    ok: z.literal(false),
    version: z.literal(GOVERNANCE_API_VERSION),
    error: z.object({ code: z.enum(ERROR_CODES), message: z.string().min(1).max(500) }).strict(),
  })
  .strict();

export class GovernanceRequestError extends Error {
  constructor(
    readonly code: GovernanceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "GovernanceRequestError";
  }
}

function invalidResponse(): never {
  throw new GovernanceRequestError(
    "service_unavailable",
    "The governance service returned an invalid response.",
  );
}

async function requestJson(
  input: string,
  init: RequestInit | undefined,
  fetchImplementation: FetchImplementation,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchImplementation(input, init);
  } catch {
    throw new GovernanceRequestError(
      "service_unavailable",
      "The governance service is unavailable.",
    );
  }
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    invalidResponse();
  }
  if (!response.ok) {
    const parsed = errorSchema.safeParse(value);
    if (!parsed.success) invalidResponse();
    throw new GovernanceRequestError(parsed.data.error.code, parsed.data.error.message);
  }
  return value;
}

function proposalMatches(value: unknown): value is typeof GOVERNANCE_PROPOSAL {
  return JSON.stringify(value) === JSON.stringify(GOVERNANCE_PROPOSAL);
}

export async function fetchGovernanceProposal(
  fetchImplementation: FetchImplementation = globalThis.fetch,
): Promise<GovernanceProposalSnapshot> {
  const schema = z
    .object({
      ok: z.literal(true),
      version: z.literal(GOVERNANCE_API_VERSION),
      network: z.literal(GOVERNANCE_NETWORK),
      proposal: z.custom<typeof GOVERNANCE_PROPOSAL>(proposalMatches),
      proposalStatus: z.enum(["upcoming", "open", "closed"]),
      serverTime: safeTimestamp,
      results: resultsStateSchema,
    })
    .strict();
  const parsed = schema.safeParse(
    await requestJson(
      "/api/governance/proposal",
      { credentials: "same-origin" },
      fetchImplementation,
    ),
  );
  if (!parsed.success) invalidResponse();
  const { ok: _ok, ...snapshot } = parsed.data;
  return snapshot;
}

export async function evaluateGovernanceDid(
  did: string,
  fetchImplementation: FetchImplementation = globalThis.fetch,
): Promise<GovernanceEvaluation> {
  if (!isDidCkb(did)) {
    throw new GovernanceRequestError("invalid_request", "Use a canonical did:ckb identity.");
  }
  const schema = z
    .object({
      ok: z.literal(true),
      version: z.literal(GOVERNANCE_API_VERSION),
      evaluation: evaluationSchema,
    })
    .strict();
  const parsed = schema.safeParse(
    await requestJson(
      `/api/governance/evaluate?did=${encodeURIComponent(did)}`,
      { credentials: "same-origin" },
      fetchImplementation,
    ),
  );
  if (!parsed.success) invalidResponse();
  return parsed.data.evaluation;
}

export async function fetchGovernanceReceipt(
  receiptId: string,
  fetchImplementation: FetchImplementation = globalThis.fetch,
): Promise<GovernanceVoteReceipt> {
  if (!/^0x[0-9a-f]{64}$/.test(receiptId)) {
    throw new GovernanceRequestError("invalid_request", "The receipt identifier is invalid.");
  }
  const schema = z
    .object({
      ok: z.literal(true),
      version: z.literal(GOVERNANCE_API_VERSION),
      receipt: receiptSchema,
    })
    .strict();
  const parsed = schema.safeParse(
    await requestJson(
      `/api/governance/receipt?id=${encodeURIComponent(receiptId)}`,
      { credentials: "same-origin" },
      fetchImplementation,
    ),
  );
  if (!parsed.success) invalidResponse();
  return parsed.data.receipt;
}

function challengeSchema(now: number) {
  return z
    .object({
      ok: z.literal(true),
      version: z.literal(GOVERNANCE_API_VERSION),
      challenge: z
        .object({
          challenge: z.string().min(1).max(4_096),
          message: z.string().min(1).max(4_096),
          expiresAt: safeTimestamp.refine((value) => value > now),
        })
        .strict(),
    })
    .strict();
}

export async function submitGovernanceVote(
  did: string,
  choice: GovernanceChoice,
  signer: Pick<ccc.Signer, "signMessage">,
  fetchImplementation: FetchImplementation = globalThis.fetch,
  now: () => number = () => Math.floor(Date.now() / 1_000),
): Promise<GovernanceVoteResult> {
  if (!isDidCkb(did)) {
    throw new GovernanceRequestError("invalid_request", "Use a canonical did:ckb identity.");
  }
  if (!GOVERNANCE_CHOICES.includes(choice)) {
    throw new GovernanceRequestError("invalid_request", "Select a published vote choice.");
  }
  const intent = {
    version: GOVERNANCE_API_VERSION,
    proposalId: GOVERNANCE_PROPOSAL.id,
    choice,
    subject: { did },
  } as const;
  const challengeValue = await requestJson(
    "/api/governance/challenge",
    {
      method: "POST",
      credentials: "same-origin",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify(intent),
    },
    fetchImplementation,
  );
  const challengeResult = challengeSchema(now()).safeParse(challengeValue);
  if (!challengeResult.success) invalidResponse();
  const challenge: GovernanceChallenge = challengeResult.data.challenge;

  let signature: ccc.Signature;
  try {
    signature = await signer.signMessage(challenge.message);
  } catch {
    throw new GovernanceRequestError(
      "subject_control_invalid",
      "The wallet did not authorize the vote.",
    );
  }

  const voteSchema = z
    .object({
      ok: z.literal(true),
      version: z.literal(GOVERNANCE_API_VERSION),
      receipt: receiptSchema,
      recordStatus: z.enum(["recorded", "duplicate"]),
      results: resultsStateSchema,
    })
    .strict();
  const parsed = voteSchema.safeParse(
    await requestJson(
      "/api/governance/vote",
      {
        method: "POST",
        credentials: "same-origin",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify({
          ...intent,
          proof: { challenge: challenge.challenge, signature },
        }),
      },
      fetchImplementation,
    ),
  );
  if (!parsed.success) invalidResponse();
  const { ok: _ok, version: _version, ...result } = parsed.data;
  return result;
}
