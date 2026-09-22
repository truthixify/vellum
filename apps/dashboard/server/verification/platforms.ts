import type { VerificationPlatform, VerificationRequest, VerifiedClaim } from "./contracts.js";
import { VerificationServiceError } from "./errors.js";

export type PlatformVerifier = (request: VerificationRequest) => Promise<VerifiedClaim>;

export type PlatformVerifierRegistry = Record<VerificationPlatform, PlatformVerifier>;

function unavailable(platform: VerificationPlatform): PlatformVerifier {
  return async () => {
    throw new VerificationServiceError(
      "not_implemented",
      501,
      `${platform} verification is not available yet.`,
    );
  };
}

export const platformVerifiers: PlatformVerifierRegistry = {
  github: async () => {
    throw new VerificationServiceError(
      "invalid_request",
      400,
      "Start GitHub verification through the OAuth endpoint.",
    );
  },
  discord: async () => {
    throw new VerificationServiceError(
      "invalid_request",
      400,
      "Start Discord verification through the OAuth endpoint.",
    );
  },
  telegram: async () => {
    throw new VerificationServiceError(
      "invalid_request",
      400,
      "Start Telegram verification through the OAuth endpoint.",
    );
  },
  bluesky: async () => {
    throw new VerificationServiceError(
      "invalid_request",
      400,
      "Start Bluesky verification through the protected submission endpoint.",
    );
  },
};
