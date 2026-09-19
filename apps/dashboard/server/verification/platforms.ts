import type { VerificationPlatform, VerificationRequest, VerifiedClaim } from "./contracts";
import { VerificationServiceError } from "./errors";

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
  github: unavailable("github"),
  discord: unavailable("discord"),
  telegram: unavailable("telegram"),
  bluesky: unavailable("bluesky"),
};
