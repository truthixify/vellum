import type { VerificationErrorCode } from "./contracts.js";

export class VerificationServiceError extends Error {
  constructor(
    readonly code: VerificationErrorCode,
    readonly status: number,
    message: string,
    readonly retryAt?: number,
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

export class VerificationCoordinationError extends VerificationServiceError {
  constructor(message: string) {
    super("issuer_unavailable", 503, message);
    this.name = "VerificationCoordinationError";
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
    retryAt?: number,
  ) {
    super(code, status, message, retryAt);
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
    retryAt?: number,
  ) {
    super(code, status, message, retryAt);
    this.name = "DiscordOAuthError";
  }
}

export class TelegramOAuthError extends VerificationServiceError {
  constructor(
    code: Extract<
      VerificationErrorCode,
      | "oauth_configuration_error"
      | "oauth_denied"
      | "oauth_state_invalid"
      | "provider_rate_limited"
      | "provider_unavailable"
    >,
    status: number,
    message: string,
    retryAt?: number,
  ) {
    super(code, status, message, retryAt);
    this.name = "TelegramOAuthError";
  }
}

export class BlueskyVerificationError extends VerificationServiceError {
  constructor(
    code: Extract<
      VerificationErrorCode,
      | "provider_rate_limited"
      | "provider_unavailable"
      | "credential_revocation_failed"
      | "verification_failed"
    >,
    status: number,
    message: string,
    retryAt?: number,
  ) {
    super(code, status, message, retryAt);
    this.name = "BlueskyVerificationError";
  }
}
