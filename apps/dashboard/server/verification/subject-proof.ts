import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { ccc } from "@ckb-ccc/core";

import {
  defaultDidControllerDependencies,
  DidControllerInactiveError,
  DidControllerUnavailableError,
  resolveDidController,
  verifyControllerSignature,
  type DidControllerDependencies,
} from "../identity/controller.js";
import {
  isVerificationPlatform,
  type DidVerificationSubject,
  type SubjectProof,
  type VerificationPlatform,
} from "./contracts.js";
import type { VerificationCoordinator } from "./coordination.js";
import { OAuthConfigurationError, VerificationServiceError } from "./errors.js";

const CHALLENGE_TTL_SECONDS = 5 * 60;
const NONCE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

type SubjectProofEnvironment = {
  [key: string]: string | undefined;
  CKB_RPC_URL?: string;
};

type ChallengePayload = {
  controllerLockHash: ccc.Hex;
  expiresAt: number;
  issuedAt: number;
  nonce: string;
  platform: VerificationPlatform;
  subject: DidVerificationSubject;
  version: 1;
};

export type SubjectChallenge = {
  challenge: string;
  expiresAt: number;
  message: string;
};

export type SubjectProofDependencies = DidControllerDependencies & {
  nonceBytes: () => Uint8Array;
};

const defaultDependencies: SubjectProofDependencies = {
  ...defaultDidControllerDependencies,
  nonceBytes: () => randomBytes(32),
};

function proofError(message = "The wallet does not control the selected identity."): never {
  throw new VerificationServiceError("subject_control_invalid", 400, message);
}

function secret(value: string | undefined): string {
  if (!value || Buffer.byteLength(value, "utf8") < 32 || Buffer.byteLength(value, "utf8") > 1_024) {
    throw new OAuthConfigurationError("The OAuth state secret is not configured securely.");
  }
  return value;
}

function signature(payload: string, secretValue: string): string {
  return createHmac("sha256", secretValue).update(`subject-proof:${payload}`).digest("base64url");
}

function encode(payload: ChallengePayload, secretValue: string): string {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${signature(encoded, secretValue)}`;
}

function decode(value: string, secretValue: string): ChallengePayload {
  if (value.length > 4_096) proofError();
  const parts = value.split(".");
  if (parts.length !== 2 || parts.some((part) => !/^[A-Za-z0-9_-]+$/.test(part))) proofError();
  const expected = Buffer.from(signature(parts[0], secretValue), "base64url");
  const supplied = Buffer.from(parts[1], "base64url");
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) proofError();

  let parsed: unknown;
  try {
    const bytes = Buffer.from(parts[0], "base64url");
    if (bytes.toString("base64url") !== parts[0]) proofError();
    parsed = JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    if (error instanceof VerificationServiceError) throw error;
    proofError();
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) proofError();
  const candidate = parsed as Partial<ChallengePayload>;
  if (
    Object.keys(candidate).sort().join(",") !==
      "controllerLockHash,expiresAt,issuedAt,nonce,platform,subject,version" ||
    candidate.version !== 1 ||
    !isVerificationPlatform(candidate.platform ?? "") ||
    !candidate.subject ||
    typeof candidate.subject.did !== "string" ||
    typeof candidate.controllerLockHash !== "string" ||
    !/^0x[0-9a-f]{64}$/.test(candidate.controllerLockHash) ||
    typeof candidate.nonce !== "string" ||
    !NONCE_PATTERN.test(candidate.nonce) ||
    !Number.isSafeInteger(candidate.issuedAt) ||
    !Number.isSafeInteger(candidate.expiresAt)
  ) {
    proofError();
  }
  return candidate as ChallengePayload;
}

function challengeMessage(payload: ChallengePayload): string {
  return [
    "Vellum account verification",
    `Provider: ${payload.platform}`,
    `Identity: ${payload.subject.did}`,
    `Controller: ${payload.controllerLockHash}`,
    `Nonce: ${payload.nonce}`,
    `Expires: ${payload.expiresAt}`,
  ].join("\n");
}

async function resolveController(
  subject: DidVerificationSubject,
  environment: SubjectProofEnvironment,
  dependencies: SubjectProofDependencies,
): Promise<{ client: ccc.Client; lock: ccc.Script }> {
  try {
    return await resolveDidController(subject.did, environment, dependencies);
  } catch (error) {
    if (error instanceof DidControllerInactiveError) {
      throw new VerificationServiceError("subject_control_invalid", 400, error.message);
    }
    if (!(error instanceof DidControllerUnavailableError)) throw error;
    throw new VerificationServiceError("issuer_unavailable", 503, error.message);
  }
}

export async function createSubjectChallenge(
  platform: VerificationPlatform,
  subject: DidVerificationSubject,
  stateSecret: string | undefined,
  now: number,
  environment: SubjectProofEnvironment = process.env,
  dependencies: SubjectProofDependencies = defaultDependencies,
): Promise<SubjectChallenge> {
  const secretValue = secret(stateSecret);
  if (!Number.isSafeInteger(now) || now <= 0) throw new TypeError("Invalid challenge timestamp");
  const { lock } = await resolveController(subject, environment, dependencies);
  const nonce = Buffer.from(dependencies.nonceBytes()).toString("base64url");
  if (!NONCE_PATTERN.test(nonce))
    throw new TypeError("Challenge nonce must contain 32 random bytes");
  const payload: ChallengePayload = {
    controllerLockHash: lock.hash(),
    expiresAt: now + CHALLENGE_TTL_SECONDS,
    issuedAt: now,
    nonce,
    platform,
    subject,
    version: 1,
  };
  return {
    challenge: encode(payload, secretValue),
    expiresAt: payload.expiresAt,
    message: challengeMessage(payload),
  };
}

export async function verifySubjectProof(
  platform: VerificationPlatform,
  subject: DidVerificationSubject,
  proof: SubjectProof,
  stateSecret: string | undefined,
  now: number,
  coordinator: VerificationCoordinator,
  environment: SubjectProofEnvironment = process.env,
  dependencies: SubjectProofDependencies = defaultDependencies,
): Promise<ccc.Hex> {
  const payload = decode(proof.challenge, secret(stateSecret));
  if (
    payload.platform !== platform ||
    payload.subject.did !== subject.did ||
    payload.issuedAt > now ||
    payload.expiresAt !== payload.issuedAt + CHALLENGE_TTL_SECONDS ||
    now >= payload.expiresAt
  ) {
    proofError("The wallet verification challenge is invalid or expired.");
  }

  const resolved = await resolveController(subject, environment, dependencies);
  if (resolved.lock.hash() !== payload.controllerLockHash) {
    proofError("The identity controller changed. Start verification again.");
  }

  const message = challengeMessage(payload);
  const verified = await verifyControllerSignature(
    message,
    resolved,
    proof.signature,
    dependencies,
  );
  if (!verified) proofError();
  if (!(await coordinator.consumeOnce(payload.nonce, payload.expiresAt, now))) {
    proofError("The wallet verification challenge expired or has already been used.");
  }
  return payload.controllerLockHash;
}

export async function assertSubjectController(
  subject: DidVerificationSubject,
  expectedLockHash: string,
  environment: SubjectProofEnvironment = process.env,
  dependencies: SubjectProofDependencies = defaultDependencies,
): Promise<void> {
  if (!/^0x[0-9a-f]{64}$/.test(expectedLockHash)) proofError();
  const resolved = await resolveController(subject, environment, dependencies);
  if (resolved.lock.hash() !== expectedLockHash) {
    proofError("The identity controller changed. Start verification again.");
  }
}
