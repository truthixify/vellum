import {
  GOVERNANCE_API_VERSION,
  GOVERNANCE_NETWORK,
  GOVERNANCE_PROPOSAL,
  governanceProposalStatus,
  type GovernanceChallenge,
  type GovernanceEvaluation,
  type GovernanceProposalSnapshot,
  type GovernanceResultsState,
  type GovernanceVoteReceipt,
  type GovernanceVoteResult,
} from "../../src/lib/governance-contracts.js";
import {
  createGovernanceChallenge,
  verifyGovernanceProof,
  type VerifiedGovernanceProof,
} from "./challenge.js";
import type { GovernanceChallengeRequest, GovernanceVoteRequest } from "./contracts.js";
import {
  evaluateGovernanceSubject,
  GovernanceEvaluationUnavailableError,
  GovernanceSubjectNotFoundError,
  InvalidGovernanceSubjectError,
} from "./evaluation.js";
import { GovernanceServiceError } from "./errors.js";
import {
  createGovernanceLedger,
  governanceReceiptId,
  GovernanceStorageUnavailableError,
  type GovernanceLedger,
} from "./ledger.js";

export type GovernanceServiceEnvironment = {
  [key: string]: string | undefined;
  CKB_RPC_URL?: string;
  UPSTASH_REDIS_REST_TOKEN?: string;
  UPSTASH_REDIS_REST_URL?: string;
  VELLUM_OAUTH_STATE_SECRET?: string;
};

export type GovernanceServiceDependencies = {
  now: () => number;
  ledger: () => GovernanceLedger;
  evaluateSubject: (subjectDid: string) => Promise<GovernanceEvaluation>;
  createChallenge: (
    request: GovernanceChallengeRequest,
    now: number,
  ) => Promise<GovernanceChallenge>;
  verifyProof: (request: GovernanceVoteRequest, now: number) => Promise<VerifiedGovernanceProof>;
};

export type GovernanceService = {
  proposal(): Promise<GovernanceProposalSnapshot>;
  evaluate(subjectDid: string): Promise<GovernanceEvaluation>;
  challenge(request: GovernanceChallengeRequest): Promise<GovernanceChallenge>;
  vote(request: GovernanceVoteRequest): Promise<GovernanceVoteResult>;
  receipt(receiptId: string): Promise<GovernanceVoteReceipt>;
};

function serviceTime(now: () => number): number {
  const value = now();
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new Error("The governance clock is invalid.");
  return value;
}

function assertProposal(proposalId: string): void {
  if (proposalId !== GOVERNANCE_PROPOSAL.id) {
    throw new GovernanceServiceError("invalid_request", 400, "The governance proposal is unknown.");
  }
}

function assertOpen(now: number): void {
  const status = governanceProposalStatus(now);
  if (status === "open") return;
  throw new GovernanceServiceError(
    "proposal_not_open",
    409,
    status === "upcoming"
      ? "The governance proposal is not open yet."
      : "The governance proposal is closed.",
  );
}

async function resultsState(ledger: GovernanceLedger): Promise<GovernanceResultsState> {
  try {
    return { status: "available", results: await ledger.getResults(GOVERNANCE_PROPOSAL.id) };
  } catch {
    return { status: "unavailable", message: "The current vote tally is temporarily unavailable." };
  }
}

async function mapEvaluation(
  subjectDid: string,
  evaluate: (subjectDid: string) => Promise<GovernanceEvaluation>,
): Promise<GovernanceEvaluation> {
  try {
    return await evaluate(subjectDid);
  } catch (error) {
    if (error instanceof InvalidGovernanceSubjectError) {
      throw new GovernanceServiceError("invalid_request", 400, error.message);
    }
    if (error instanceof GovernanceSubjectNotFoundError) {
      throw new GovernanceServiceError("subject_not_found", 404, error.message);
    }
    if (error instanceof GovernanceEvaluationUnavailableError) {
      throw new GovernanceServiceError("service_unavailable", 503, error.message);
    }
    throw error;
  }
}

function storageError(error: unknown): never {
  if (error instanceof GovernanceStorageUnavailableError) {
    throw new GovernanceServiceError("service_unavailable", 503, error.message);
  }
  throw error;
}

export function createGovernanceService(
  environment: GovernanceServiceEnvironment = process.env,
  overrides: Partial<GovernanceServiceDependencies> = {},
): GovernanceService {
  let configuredLedger: GovernanceLedger | undefined;
  const dependencies: GovernanceServiceDependencies = {
    now: () => Math.floor(Date.now() / 1_000),
    ledger: () => (configuredLedger ??= createGovernanceLedger(environment)),
    evaluateSubject: (subjectDid) => evaluateGovernanceSubject(subjectDid, environment),
    createChallenge: (request, now) =>
      createGovernanceChallenge(request, environment.VELLUM_OAUTH_STATE_SECRET, now, environment),
    verifyProof: (request, now) =>
      verifyGovernanceProof(
        request,
        request.proof,
        environment.VELLUM_OAUTH_STATE_SECRET,
        now,
        environment,
      ),
    ...overrides,
  };

  return {
    async proposal() {
      const now = serviceTime(dependencies.now);
      let results: GovernanceResultsState;
      try {
        results = await resultsState(dependencies.ledger());
      } catch {
        results = {
          status: "unavailable",
          message: "The current vote tally is temporarily unavailable.",
        };
      }
      return {
        version: GOVERNANCE_API_VERSION,
        network: GOVERNANCE_NETWORK,
        proposal: GOVERNANCE_PROPOSAL,
        proposalStatus: governanceProposalStatus(now),
        serverTime: now,
        results,
      };
    },

    evaluate(subjectDid) {
      return mapEvaluation(subjectDid, dependencies.evaluateSubject);
    },

    async challenge(request) {
      const now = serviceTime(dependencies.now);
      assertProposal(request.proposalId);
      assertOpen(now);
      return dependencies.createChallenge(request, now);
    },

    async vote(request) {
      const now = serviceTime(dependencies.now);
      assertProposal(request.proposalId);
      assertOpen(now);
      const proof = await dependencies.verifyProof(request, now);

      let ledger: GovernanceLedger;
      let existing: GovernanceVoteReceipt | undefined;
      try {
        ledger = dependencies.ledger();
        existing = await ledger.getVote(request.proposalId, request.subject.did);
      } catch (error) {
        storageError(error);
      }
      if (existing) {
        if (existing.choice !== request.choice) {
          throw new GovernanceServiceError(
            "already_voted",
            409,
            "This identity already recorded a different choice for the proposal.",
          );
        }
        return {
          receipt: existing,
          recordStatus: "duplicate",
          results: await resultsState(ledger!),
        };
      }

      const evaluation = await mapEvaluation(request.subject.did, dependencies.evaluateSubject);
      if (evaluation.status !== "eligible" || evaluation.participationWeight === null) {
        throw new GovernanceServiceError(
          "ineligible",
          403,
          "The selected identity does not satisfy the published GitHub claim requirement.",
        );
      }
      const receipt: GovernanceVoteReceipt = {
        version: GOVERNANCE_API_VERSION,
        receiptId: governanceReceiptId(request.proposalId, request.subject.did),
        network: GOVERNANCE_NETWORK,
        proposalId: request.proposalId,
        subjectDid: request.subject.did,
        choice: request.choice,
        participationWeight: evaluation.participationWeight,
        eligibilityPolicyVersion: evaluation.eligibilityPolicyVersion,
        reputation: evaluation.reputation,
        evaluatedAt: evaluation.evaluatedAt,
        recordedAt: now,
        controllerLockHash: proof.controllerLockHash,
        evidence: evaluation.evidence,
      };

      let recorded;
      try {
        recorded = await ledger!.recordVote(receipt, proof.nonce, proof.expiresAt, now);
      } catch (error) {
        storageError(error);
      }
      if (recorded!.status === "challenge-replayed") {
        throw new GovernanceServiceError(
          "challenge_invalid",
          400,
          "The vote authorization expired or has already been used.",
        );
      }
      if (recorded!.status === "existing" && recorded!.receipt.choice !== request.choice) {
        throw new GovernanceServiceError(
          "already_voted",
          409,
          "This identity already recorded a different choice for the proposal.",
        );
      }
      return {
        receipt: recorded!.receipt,
        recordStatus: recorded!.status === "recorded" ? "recorded" : "duplicate",
        results: await resultsState(ledger!),
      };
    },

    async receipt(receiptId) {
      if (!/^0x[0-9a-f]{64}$/.test(receiptId)) {
        throw new GovernanceServiceError(
          "invalid_request",
          400,
          "The receipt identifier is invalid.",
        );
      }
      try {
        const receipt = await dependencies.ledger().getReceipt(receiptId);
        if (!receipt) {
          throw new GovernanceServiceError(
            "receipt_not_found",
            404,
            "The vote receipt was not found.",
          );
        }
        return receipt;
      } catch (error) {
        if (error instanceof GovernanceServiceError) throw error;
        storageError(error);
      }
    },
  };
}
