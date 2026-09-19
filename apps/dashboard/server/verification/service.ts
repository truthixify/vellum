import {
  VERIFICATION_API_VERSION,
  claimIssuanceResultSchema,
  isVerificationPlatform,
  verificationRequestSchema,
  verifiedClaimSchema,
  type ClaimIssuanceResult,
  type VerificationError,
  type VerificationPlatform,
  type VerificationRequest,
  type VerificationResponse,
  type VerifiedClaim,
} from "./contracts";
import { IssuerConfigurationError, VerificationServiceError } from "./errors";
import { issueVerifiedClaim } from "./issuer";
import { platformVerifiers, type PlatformVerifierRegistry } from "./platforms";

export type ClaimIssuer = (
  subject: VerificationRequest["subject"],
  claim: VerifiedClaim,
) => Promise<ClaimIssuanceResult>;

export type VerificationServiceDependencies = {
  verifiers: PlatformVerifierRegistry;
  issueClaim: ClaimIssuer;
};

export type VerificationServiceResult = {
  status: number;
  body: VerificationResponse;
};

const defaultDependencies: VerificationServiceDependencies = {
  verifiers: platformVerifiers,
  issueClaim: issueVerifiedClaim,
};

function errorResult(
  status: number,
  code: VerificationError["error"]["code"],
  message: string,
): VerificationServiceResult {
  return {
    status,
    body: {
      ok: false,
      version: VERIFICATION_API_VERSION,
      error: { code, message },
    },
  };
}

function validateVerifiedClaim(platform: VerificationPlatform, value: unknown): VerifiedClaim {
  const claim = verifiedClaimSchema.safeParse(value);
  if (!claim.success || !claim.data.schema.id.startsWith(`vellum.social.${platform}.`)) {
    throw new VerificationServiceError(
      "verification_failed",
      422,
      "The platform verifier returned an invalid claim.",
    );
  }
  return claim.data;
}

export async function verifyPlatformProof(
  routePlatform: string,
  input: unknown,
  dependencies: VerificationServiceDependencies = defaultDependencies,
): Promise<VerificationServiceResult> {
  if (!isVerificationPlatform(routePlatform)) {
    return errorResult(404, "unsupported_platform", "The requested platform is not supported.");
  }

  const request = verificationRequestSchema.safeParse(input);
  if (!request.success || request.data.platform !== routePlatform) {
    return errorResult(
      400,
      "invalid_request",
      "The request body does not match the verification contract.",
    );
  }

  let verified: VerifiedClaim;
  try {
    verified = validateVerifiedClaim(
      routePlatform,
      await dependencies.verifiers[routePlatform](request.data),
    );
  } catch (error) {
    if (error instanceof VerificationServiceError) {
      return errorResult(error.status, error.code, error.message);
    }
    return errorResult(
      502,
      "verification_failed",
      "The platform proof could not be verified. Try again later.",
    );
  }

  try {
    const issuance = claimIssuanceResultSchema.parse(
      await dependencies.issueClaim(request.data.subject, verified),
    );
    return {
      status: 201,
      body: {
        ok: true,
        version: VERIFICATION_API_VERSION,
        platform: routePlatform,
        subject: request.data.subject,
        claim: verified,
        issuance,
      },
    };
  } catch (error) {
    if (error instanceof IssuerConfigurationError) {
      return errorResult(
        503,
        "issuer_unavailable",
        "The claim issuer is not available. Try again later.",
      );
    }
    return errorResult(502, "issuance_failed", "The claim could not be issued. Try again later.");
  }
}
