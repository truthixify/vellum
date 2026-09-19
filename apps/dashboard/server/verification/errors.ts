import type { VerificationErrorCode } from "./contracts";

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
