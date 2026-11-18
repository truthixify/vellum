import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import {
  defaultDidControllerDependencies,
  DidControllerInactiveError,
  DidControllerUnavailableError,
  resolveDidController,
  verifyControllerSignature,
  type ControllerEnvironment,
  type DidControllerDependencies,
} from "../identity/controller.js";
import type { SubjectProof } from "../verification/contracts.js";
import type { GovernanceChallengeRequest } from "./contracts.js";
import { GovernanceServiceError } from "./errors.js";

const CHALLENGE_TTL_SECONDS = 5 * 60;
const NONCE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

type ChallengePayload = {
  choice: GovernanceChallengeRequest["choice"];
  controllerLockHash: string;
  expiresAt: number;
  issuedAt: number;
  nonce: string;
  proposalId: string;
  subjectDid: string;
  version: 1;
};

export type GovernanceChallengeDependencies = DidControllerDependencies & {
  nonceBytes: () => Uint8Array;
};

const defaultDependencies: GovernanceChallengeDependencies = {
  ...defaultDidControllerDependencies,
  nonceBytes: () => randomBytes(32),
};

export type VerifiedGovernanceProof = {
  controllerLockHash: string;
  expiresAt: number;
  nonce: string;
};

function challengeError(message = "The vote authorization is invalid or expired."): never {
  throw new GovernanceServiceError("challenge_invalid", 400, message);
}

function secret(value: string | undefined): string {
  if (!value || Buffer.byteLength(value, "utf8") < 32 || Buffer.byteLength(value, "utf8") > 1_024) {
    throw new GovernanceServiceError(
      "service_unavailable",
      503,
      "Governance vote authorization is unavailable.",
    );
  }
  return value;
}

function signature(payload: string, secretValue: string): string {
  return createHmac("sha256", secretValue).update(`governance-vote:${payload}`).digest("base64url");
}

function encode(payload: ChallengePayload, secretValue: string): string {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${signature(encoded, secretValue)}`;
}

function decode(value: string, secretValue: string): ChallengePayload {
  if (value.length > 4_096) challengeError();
  const parts = value.split(".");
  if (parts.length !== 2 || parts.some((part) => !/^[A-Za-z0-9_-]+$/.test(part))) {
    challengeError();
  }
  const expected = Buffer.from(signature(parts[0], secretValue), "base64url");
  const supplied = Buffer.from(parts[1], "base64url");
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) challengeError();

  let parsed: unknown;
  try {
    const bytes = Buffer.from(parts[0], "base64url");
    if (bytes.toString("base64url") !== parts[0]) challengeError();
    parsed = JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    if (error instanceof GovernanceServiceError) throw error;
    challengeError();
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) challengeError();
  const candidate = parsed as Partial<ChallengePayload>;
  if (
    Object.keys(candidate).sort().join(",") !==
      "choice,controllerLockHash,expiresAt,issuedAt,nonce,proposalId,subjectDid,version" ||
    candidate.version !== 1 ||
    !["yes", "no"].includes(candidate.choice ?? "") ||
    typeof candidate.controllerLockHash !== "string" ||
    !/^0x[0-9a-f]{64}$/.test(candidate.controllerLockHash) ||
    typeof candidate.expiresAt !== "number" ||
    !Number.isSafeInteger(candidate.expiresAt) ||
    typeof candidate.issuedAt !== "number" ||
    !Number.isSafeInteger(candidate.issuedAt) ||
    typeof candidate.nonce !== "string" ||
    !NONCE_PATTERN.test(candidate.nonce) ||
    typeof candidate.proposalId !== "string" ||
    candidate.proposalId.length < 1 ||
    candidate.proposalId.length > 128 ||
    typeof candidate.subjectDid !== "string" ||
    candidate.subjectDid.length > 128
  ) {
    challengeError();
  }
  return candidate as ChallengePayload;
}

function message(payload: ChallengePayload): string {
  return [
    "Vellum governance vote",
    `Proposal: ${payload.proposalId}`,
    `Choice: ${payload.choice}`,
    `Identity: ${payload.subjectDid}`,
    `Controller: ${payload.controllerLockHash}`,
    `Nonce: ${payload.nonce}`,
    `Expires: ${payload.expiresAt}`,
  ].join("\n");
}

async function controller(
  did: string,
  environment: ControllerEnvironment,
  dependencies: GovernanceChallengeDependencies,
) {
  try {
    return await resolveDidController(did, environment, dependencies);
  } catch (error) {
    if (error instanceof DidControllerInactiveError) {
      throw new GovernanceServiceError("subject_not_found", 404, error.message);
    }
    if (error instanceof DidControllerUnavailableError) {
      throw new GovernanceServiceError(
        "service_unavailable",
        503,
        "The identity controller could not be resolved.",
      );
    }
    throw error;
  }
}

export async function createGovernanceChallenge(
  request: GovernanceChallengeRequest,
  stateSecret: string | undefined,
  now: number,
  environment: ControllerEnvironment = process.env,
  dependencies: GovernanceChallengeDependencies = defaultDependencies,
): Promise<{ challenge: string; expiresAt: number; message: string }> {
  const secretValue = secret(stateSecret);
  if (!Number.isSafeInteger(now) || now <= 0) throw new TypeError("Invalid challenge timestamp");
  const resolved = await controller(request.subject.did, environment, dependencies);
  const nonce = Buffer.from(dependencies.nonceBytes()).toString("base64url");
  if (!NONCE_PATTERN.test(nonce)) {
    throw new TypeError("Challenge nonce must contain 32 random bytes");
  }
  const payload: ChallengePayload = {
    choice: request.choice,
    controllerLockHash: resolved.lock.hash(),
    expiresAt: now + CHALLENGE_TTL_SECONDS,
    issuedAt: now,
    nonce,
    proposalId: request.proposalId,
    subjectDid: request.subject.did,
    version: 1,
  };
  return {
    challenge: encode(payload, secretValue),
    expiresAt: payload.expiresAt,
    message: message(payload),
  };
}

export async function verifyGovernanceProof(
  request: Omit<GovernanceChallengeRequest, "version">,
  proof: SubjectProof,
  stateSecret: string | undefined,
  now: number,
  environment: ControllerEnvironment = process.env,
  dependencies: GovernanceChallengeDependencies = defaultDependencies,
): Promise<VerifiedGovernanceProof> {
  const payload = decode(proof.challenge, secret(stateSecret));
  if (
    payload.proposalId !== request.proposalId ||
    payload.choice !== request.choice ||
    payload.subjectDid !== request.subject.did ||
    payload.issuedAt > now ||
    payload.expiresAt !== payload.issuedAt + CHALLENGE_TTL_SECONDS ||
    now >= payload.expiresAt
  ) {
    challengeError();
  }

  const resolved = await controller(request.subject.did, environment, dependencies);
  if (resolved.lock.hash() !== payload.controllerLockHash) {
    throw new GovernanceServiceError(
      "subject_control_invalid",
      400,
      "The identity controller changed. Start the vote again.",
    );
  }
  if (
    !(await verifyControllerSignature(message(payload), resolved, proof.signature, dependencies))
  ) {
    throw new GovernanceServiceError(
      "subject_control_invalid",
      400,
      "The wallet does not control the selected identity.",
    );
  }
  return {
    controllerLockHash: payload.controllerLockHash,
    expiresAt: payload.expiresAt,
    nonce: payload.nonce,
  };
}
