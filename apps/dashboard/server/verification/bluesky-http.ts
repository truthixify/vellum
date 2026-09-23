import { blueskyIdentitySchema, parseBlueskyClaimPayload } from "@vellum/schemas";

import {
  VERIFICATION_API_VERSION,
  blueskySubmitRequestSchema,
  claimIssuanceResultSchema,
  oauthChallengeRequestSchema,
  verifiedClaimSchema,
  type ClaimIssuanceResult,
  type VerificationErrorCode,
  type VerificationSubject,
  type VerifiedClaim,
} from "./contracts.js";
import { createVerificationCoordinator, type VerificationCoordinator } from "./coordination.js";
import {
  IssuerConfigurationError,
  OAuthConfigurationError,
  VerificationCoordinationError,
  VerificationServiceError,
} from "./errors.js";
import { jsonResponse, parseJsonBody, RequestBodyError } from "./http.js";
import { coordinateIssuance } from "./issuance-control.js";
import { issueVerifiedClaim } from "./issuer.js";
import { logVerificationFailure, type VerificationFailureLogger } from "./logging.js";
import {
  assertSubjectController,
  createSubjectChallenge,
  verifySubjectProof,
} from "./subject-proof.js";
import {
  blueskyVerificationConfig,
  verifyBlueskyCredentials,
  type BlueskyEnvironment,
  type BlueskyFetch,
  type BlueskyVerification,
} from "./bluesky.js";

type BlueskyAction = "start" | "challenge" | "submit";

export type BlueskyClaimIssuer = (
  subject: VerificationSubject,
  claim: VerifiedClaim,
) => Promise<ClaimIssuanceResult>;

export type BlueskyHttpDependencies = {
  environment: BlueskyEnvironment;
  fetch: BlueskyFetch;
  issueClaim: BlueskyClaimIssuer;
  createCoordinator: (environment: BlueskyEnvironment) => VerificationCoordinator;
  assertSubjectController: typeof assertSubjectController;
  createSubjectChallenge: typeof createSubjectChallenge;
  verifySubjectProof: typeof verifySubjectProof;
  verifyCredentials: typeof verifyBlueskyCredentials;
  logFailure: VerificationFailureLogger;
  now: () => number;
};

const defaultDependencies: BlueskyHttpDependencies = {
  environment: process.env,
  fetch: globalThis.fetch,
  issueClaim: (subject, claim) => issueVerifiedClaim(subject, claim),
  createCoordinator: createVerificationCoordinator,
  assertSubjectController,
  createSubjectChallenge,
  verifySubjectProof,
  verifyCredentials: verifyBlueskyCredentials,
  logFailure: logVerificationFailure,
  now: () => Math.floor(Date.now() / 1_000),
};

function errorResponse(
  status: number,
  code: VerificationErrorCode,
  message: string,
  retryAt?: number,
  headers?: HeadersInit,
): Response {
  return jsonResponse(
    {
      ok: false,
      version: VERIFICATION_API_VERSION,
      error: { code, message, ...(retryAt === undefined ? {} : { retryAt }) },
    },
    status,
    headers,
  );
}

function exactlyOneParameter(url: URL, name: string): string | undefined {
  const values = url.searchParams.getAll(name);
  return values.length === 1 ? values[0] : undefined;
}

export function blueskyActionFromUrl(request: Request): BlueskyAction | undefined {
  const url = new URL(request.url);
  const segments = url.pathname.split("/").filter(Boolean);
  const value =
    segments.length === 4 &&
    segments[0] === "api" &&
    segments[1] === "verify" &&
    segments[2] === "bluesky"
      ? segments[3]
      : segments.length === 2 && segments[0] === "api" && segments[1] === "bluesky"
        ? exactlyOneParameter(url, "action")
        : undefined;
  return value === "start" || value === "challenge" || value === "submit" ? value : undefined;
}

function configured(dependencies: BlueskyHttpDependencies): {
  coordinator: VerificationCoordinator;
  stateSecret: string;
} {
  const config = blueskyVerificationConfig(dependencies.environment);
  return {
    coordinator: dependencies.createCoordinator(dependencies.environment),
    stateSecret: config.stateSecret,
  };
}

async function body(request: Request): Promise<unknown> {
  try {
    return await parseJsonBody(request);
  } catch (error) {
    if (error instanceof RequestBodyError) throw error;
    throw new RequestBodyError(400, "The request body must contain valid JSON.");
  }
}

async function handleStart(
  request: Request,
  dependencies: BlueskyHttpDependencies,
): Promise<Response> {
  if (request.method !== "GET") {
    return errorResponse(
      405,
      "method_not_allowed",
      "Use GET to load Bluesky verification.",
      undefined,
      {
        allow: "GET",
      },
    );
  }
  try {
    configured(dependencies);
  } catch (error) {
    if (error instanceof OAuthConfigurationError) {
      return errorResponse(
        503,
        "oauth_configuration_error",
        "Bluesky verification is temporarily unavailable.",
      );
    }
    throw error;
  }
  return jsonResponse({
    ok: true,
    version: VERIFICATION_API_VERSION,
    platform: "bluesky",
    fields: [
      {
        name: "handle",
        type: "text",
        label: "Bluesky handle",
        autoComplete: "username",
        required: true,
        maximumLength: 253,
      },
      {
        name: "appPassword",
        type: "password",
        label: "App password",
        autoComplete: "off",
        required: true,
        minimumLength: 19,
        maximumLength: 19,
      },
    ],
    appPasswordUrl: "https://bsky.app/settings/app-passwords",
  });
}

async function handleChallenge(
  request: Request,
  dependencies: BlueskyHttpDependencies,
): Promise<Response> {
  if (request.method !== "POST") {
    return errorResponse(
      405,
      "method_not_allowed",
      "Use POST to request a wallet challenge.",
      undefined,
      { allow: "POST" },
    );
  }

  let config;
  try {
    config = configured(dependencies);
  } catch (error) {
    if (error instanceof OAuthConfigurationError) {
      return errorResponse(
        503,
        "oauth_configuration_error",
        "Bluesky verification is temporarily unavailable.",
      );
    }
    throw error;
  }

  let value: unknown;
  try {
    value = await body(request);
  } catch (error) {
    return errorResponse(
      error instanceof RequestBodyError ? error.status : 400,
      "invalid_request",
      error instanceof Error ? error.message : "The verification request is invalid.",
    );
  }
  const parsed = oauthChallengeRequestSchema.safeParse(value);
  if (!parsed.success) {
    return errorResponse(
      400,
      "invalid_request",
      "Choose a valid did:ckb identity before connecting Bluesky.",
    );
  }

  try {
    const challenge = await dependencies.createSubjectChallenge(
      "bluesky",
      parsed.data.subject,
      config.stateSecret,
      dependencies.now(),
      dependencies.environment,
    );
    return jsonResponse({
      ok: true,
      version: VERIFICATION_API_VERSION,
      platform: "bluesky",
      ...challenge,
    });
  } catch (error) {
    if (error instanceof VerificationServiceError) {
      return errorResponse(error.status, error.code, error.message, error.retryAt);
    }
    dependencies.logFailure({
      error,
      platform: "bluesky",
      requestId: crypto.randomUUID(),
      stage: "challenge",
    });
    return errorResponse(503, "issuer_unavailable", "The selected identity could not be resolved.");
  }
}

function validateVerification(verification: BlueskyVerification): {
  accountDid: string;
  claim: VerifiedClaim;
} {
  const claim = verifiedClaimSchema.parse(verification.claim);
  const payload = parseBlueskyClaimPayload(claim.payload);
  if (
    claim.schema.id !== blueskyIdentitySchema.id ||
    claim.schema.hash !== blueskyIdentitySchema.hash ||
    claim.issuedAt !== payload.verified_at ||
    claim.expiresAt !== undefined ||
    verification.account.did !== payload.did ||
    verification.account.handle !== payload.handle ||
    verification.account.profileUrl !== payload.profile_url
  ) {
    throw new VerificationServiceError(
      "provider_unavailable",
      502,
      "Bluesky returned account data that cannot be verified.",
    );
  }
  return { accountDid: payload.did, claim };
}

async function handleSubmit(
  request: Request,
  dependencies: BlueskyHttpDependencies,
): Promise<Response> {
  if (request.method !== "POST") {
    return errorResponse(
      405,
      "method_not_allowed",
      "Use POST to submit Bluesky verification.",
      undefined,
      { allow: "POST" },
    );
  }

  let config;
  try {
    config = configured(dependencies);
  } catch (error) {
    if (
      error instanceof OAuthConfigurationError ||
      error instanceof VerificationCoordinationError
    ) {
      return errorResponse(
        503,
        "oauth_configuration_error",
        "Bluesky verification is temporarily unavailable.",
      );
    }
    throw error;
  }

  let value: unknown;
  try {
    value = await body(request);
  } catch (error) {
    return errorResponse(
      error instanceof RequestBodyError ? error.status : 400,
      "invalid_request",
      error instanceof Error ? error.message : "The verification request is invalid.",
    );
  }
  const parsed = blueskySubmitRequestSchema.safeParse(value);
  if (!parsed.success) {
    return errorResponse(
      400,
      "invalid_request",
      "Enter a valid handle and dedicated Bluesky app password.",
    );
  }

  const requestId = crypto.randomUUID();
  const now = dependencies.now();
  const coordinator = config.coordinator;
  let controllerLockHash: string;
  try {
    controllerLockHash = await dependencies.verifySubjectProof(
      "bluesky",
      parsed.data.subject,
      parsed.data.proof,
      config.stateSecret,
      now,
      coordinator,
      dependencies.environment,
    );
  } catch (error) {
    if (error instanceof VerificationServiceError) {
      return errorResponse(error.status, error.code, error.message, error.retryAt);
    }
    dependencies.logFailure({ error, platform: "bluesky", requestId, stage: "submit" });
    return errorResponse(
      400,
      "subject_control_invalid",
      "The wallet could not be verified for this identity.",
    );
  }

  let verified: BlueskyVerification;
  let validated: ReturnType<typeof validateVerification>;
  try {
    verified = await dependencies.verifyCredentials(
      { handle: parsed.data.handle, appPassword: parsed.data.appPassword },
      { fetch: dependencies.fetch, now: dependencies.now },
    );
    validated = validateVerification(verified);
  } catch (error) {
    if (error instanceof VerificationServiceError && error.code !== "verification_failed") {
      dependencies.logFailure({ error, platform: "bluesky", requestId, stage: "provider" });
    }
    if (error instanceof VerificationServiceError) {
      return errorResponse(error.status, error.code, error.message, error.retryAt);
    }
    dependencies.logFailure({ error, platform: "bluesky", requestId, stage: "provider" });
    return errorResponse(502, "provider_unavailable", "Bluesky could not complete verification.");
  }

  try {
    await dependencies.assertSubjectController(
      parsed.data.subject,
      controllerLockHash,
      dependencies.environment,
    );
    const issuance = claimIssuanceResultSchema.parse(
      await coordinateIssuance({
        accountId: validated.accountDid,
        coordinator,
        issue: () => dependencies.issueClaim(parsed.data.subject, validated.claim),
        now,
        platform: "bluesky",
        subjectDid: parsed.data.subject.did,
      }),
    );
    return jsonResponse(
      {
        ok: true,
        version: VERIFICATION_API_VERSION,
        platform: "bluesky",
        subject: parsed.data.subject,
        account: verified.account,
        claim: validated.claim,
        issuance,
      },
      201,
    );
  } catch (error) {
    dependencies.logFailure({ error, platform: "bluesky", requestId, stage: "issuance" });
    if (error instanceof VerificationServiceError) {
      return errorResponse(error.status, error.code, error.message, error.retryAt);
    }
    if (error instanceof IssuerConfigurationError) {
      return errorResponse(
        503,
        "issuer_unavailable",
        "The Vellum issuer is temporarily unavailable.",
      );
    }
    return errorResponse(
      502,
      "issuance_failed",
      "The account was verified, but the claim transaction could not be submitted.",
    );
  }
}

export async function handleBlueskyRequest(
  request: Request,
  dependencies: BlueskyHttpDependencies = defaultDependencies,
): Promise<Response> {
  const action = blueskyActionFromUrl(request);
  if (action === "start") return handleStart(request, dependencies);
  if (action === "challenge") return handleChallenge(request, dependencies);
  if (action === "submit") return handleSubmit(request, dependencies);
  return errorResponse(404, "invalid_request", "The Bluesky verification endpoint was not found.");
}
