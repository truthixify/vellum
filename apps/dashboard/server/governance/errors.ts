import type { GovernanceErrorCode } from "../../src/lib/governance-contracts.js";

export class GovernanceServiceError extends Error {
  constructor(
    readonly code: GovernanceErrorCode,
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "GovernanceServiceError";
  }
}
