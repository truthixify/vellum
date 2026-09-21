import type { VerificationErrorCode } from "./contracts.js";

export class VerificationServiceError extends Error {
  constructor(
    readonly code: VerificationErrorCode,
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "VerificationServiceError";
  }
}

export class IssuerConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IssuerConfigurationError";
  }
}

export class OAuthConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OAuthConfigurationError";
  }
}

export class GithubOAuthError extends VerificationServiceError {
  constructor(
    code: Extract<
      VerificationErrorCode,
      | "oauth_denied"
      | "oauth_state_invalid"
      | "provider_rate_limited"
      | "provider_unavailable"
      | "credential_revocation_failed"
    >,
    status: number,
    message: string,
    readonly retryAt?: number,
  ) {
    super(code, status, message);
    this.name = "GithubOAuthError";
  }
}

export class DiscordOAuthError extends VerificationServiceError {
  constructor(
    code: Extract<
      VerificationErrorCode,
      | "oauth_denied"
      | "oauth_state_invalid"
      | "provider_rate_limited"
      | "provider_unavailable"
      | "credential_revocation_failed"
    >,
    status: number,
    message: string,
    readonly retryAt?: number,
  ) {
    super(code, status, message);
    this.name = "DiscordOAuthError";
  }
}
