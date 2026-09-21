import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { ccc } from "@ckb-ccc/core";
import { resolveDidCkb } from "@ckb-ccc/did-ckb";
import { verifyCredential, type CredentialKeyType, type SigningAlg } from "@joyid/ckb";

import type { DidVerificationSubject, SubjectProof, VerificationPlatform } from "./contracts.js";
import type { VerificationCoordinator } from "./coordination.js";
import { OAuthConfigurationError, VerificationServiceError } from "./errors.js";
import { issuerRpcUrl } from "./issuer.js";

const CHALLENGE_TTL_SECONDS = 5 * 60;
const JOYID_TESTNET_SERVER_URL = "https://api.testnet.joyid.dev/api/v1";
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

export type SubjectProofDependencies = {
  createClient: (rpcUrl: string) => ccc.Client;
  nonceBytes: () => Uint8Array;
  resolveDid: typeof resolveDidCkb;
  verifyMessage: typeof ccc.Signer.verifyMessage;
  verifyJoyIdCredential: typeof verifyCredential;
};

const defaultDependencies: SubjectProofDependencies = {
  createClient: (rpcUrl) =>
    new ccc.ClientPublicTestnet({ url: rpcUrl, fallbacks: [], timeout: 10_000 }),
  nonceBytes: () => randomBytes(32),
  resolveDid: resolveDidCkb,
  verifyMessage: ccc.Signer.verifyMessage,
  verifyJoyIdCredential: verifyCredential,
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
    !["github", "discord"].includes(candidate.platform ?? "") ||
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
  const client = dependencies.createClient(issuerRpcUrl(environment));
  let record;
  try {
    record = await dependencies.resolveDid({ client, did: subject.did });
  } catch {
    throw new VerificationServiceError(
      "issuer_unavailable",
      503,
      "The selected identity could not be resolved.",
    );
  }
  if (!record) {
    throw new VerificationServiceError(
      "subject_control_invalid",
      400,
      "The selected identity is not active on CKB Testnet.",
    );
  }
  return { client, lock: record.cell.cellOutput.lock };
}

async function signerControlsLock(
  client: ccc.Client,
  lock: ccc.Script,
  walletSignature: SubjectProof["signature"],
  dependencies: SubjectProofDependencies,
): Promise<boolean> {
  const identity = walletSignature.identity;
  switch (walletSignature.signType) {
    case ccc.SignerSignType.CkbSecp256k1: {
      const signer = new ccc.SignerCkbPublicKey(client, identity);
      return (await signer.getAddressObjSecp256k1()).script.eq(lock);
    }
    case ccc.SignerSignType.EvmPersonal: {
      const signer = new ccc.SignerEvmAddressReadonly(client, identity);
      return (await signer.getAddressObjs()).some(({ script }) => script.eq(lock));
    }
    case ccc.SignerSignType.BtcEcdsa: {
      const publicKey = identity.startsWith("0x") ? identity : `0x${identity}`;
      const signer = new ccc.SignerBtcPublicKeyReadonly(client, "", publicKey);
      return (await signer.getAddressObjs()).some(({ script }) => script.eq(lock));
    }
    case ccc.SignerSignType.NostrEvent: {
      const signer = new ccc.SignerNostrPublicKeyReadonly(client, identity);
      return (await signer.getAddressObjs()).some(({ script }) => script.eq(lock));
    }
    case ccc.SignerSignType.DogeEcdsa: {
      const signer = new ccc.SignerDogeAddressReadonly(client, identity);
      return (await signer.getAddressObjs()).some(({ script }) => script.eq(lock));
    }
    case ccc.SignerSignType.JoyId: {
      let identityValue: unknown;
      let signatureValue: unknown;
      try {
        identityValue = JSON.parse(identity);
        signatureValue = JSON.parse(walletSignature.signature);
      } catch {
        return false;
      }
      if (
        typeof identityValue !== "object" ||
        identityValue === null ||
        Array.isArray(identityValue) ||
        typeof signatureValue !== "object" ||
        signatureValue === null ||
        Array.isArray(signatureValue)
      ) {
        return false;
      }
      const joyIdentity = identityValue as { keyType?: unknown; publicKey?: unknown };
      const joySignature = signatureValue as { alg?: unknown };
      if (
        typeof joyIdentity.publicKey !== "string" ||
        typeof joyIdentity.keyType !== "string" ||
        typeof joySignature.alg !== "number"
      ) {
        return false;
      }
      const address = ccc.Address.from({ prefix: client.addressPrefix, script: lock }).toString();
      return dependencies.verifyJoyIdCredential(
        {
          pubkey: joyIdentity.publicKey,
          address,
          keyType: joyIdentity.keyType as CredentialKeyType,
          alg: joySignature.alg as SigningAlg,
        },
        JOYID_TESTNET_SERVER_URL,
      );
    }
    default:
      return false;
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
  let verified = false;
  try {
    verified =
      (await dependencies.verifyMessage(
        message,
        new ccc.Signature(
          proof.signature.signature,
          proof.signature.identity,
          proof.signature.signType as ccc.SignerSignType,
        ),
      )) &&
      (await signerControlsLock(resolved.client, resolved.lock, proof.signature, dependencies));
  } catch {
    verified = false;
  }
  if (!verified) proofError();
  if (!(await coordinator.consumeChallenge(payload.nonce, payload.expiresAt, now))) {
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
