import type { VerificationPlatform } from "./contracts.js";
import type { VerificationCoordinator } from "./coordination.js";
import { VerificationServiceError } from "./errors.js";

const LOCK_ATTEMPTS = 9;
const LOCK_RETRY_MS = 250;

export type CoordinatedIssuanceInput<TResult> = {
  accountId: string;
  coordinator: VerificationCoordinator;
  issue: () => Promise<TResult>;
  now: number;
  platform: VerificationPlatform;
  subjectDid: string;
};

export type CoordinatedIssuanceDependencies = {
  sleep: (milliseconds: number) => Promise<void>;
};

const defaultDependencies: CoordinatedIssuanceDependencies = {
  sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
};

export async function coordinateIssuance<TResult>(
  input: CoordinatedIssuanceInput<TResult>,
  dependencies: CoordinatedIssuanceDependencies = defaultDependencies,
): Promise<TResult> {
  const reserved = await input.coordinator.reserveIssuance(
    input.platform,
    input.accountId,
    input.subjectDid,
    input.now,
  );
  if (!reserved.ok) {
    throw new VerificationServiceError(
      "verification_rate_limited",
      429,
      "This account or identity was verified recently.",
      reserved.retryAt,
    );
  }

  let lease;
  let issued = false;
  try {
    for (let attempt = 0; attempt < LOCK_ATTEMPTS; attempt += 1) {
      lease = await input.coordinator.acquireIssuerLease();
      if (lease) break;
      if (attempt + 1 < LOCK_ATTEMPTS) await dependencies.sleep(LOCK_RETRY_MS);
    }
    if (!lease) {
      throw new VerificationServiceError(
        "issuer_unavailable",
        503,
        "The claim issuer is busy. Try again shortly.",
      );
    }

    const result = await input.issue();
    issued = true;
    return result;
  } catch (error) {
    try {
      await input.coordinator.releaseIssuance(reserved.reservation);
    } catch {
      // The reservation expires automatically if the coordination service cannot release it.
    }
    throw error;
  } finally {
    if (lease) {
      try {
        if (issued) {
          await input.coordinator.settleIssuerLease(lease);
        } else {
          await input.coordinator.releaseIssuerLease(lease);
        }
      } catch {
        // The lease expires automatically if the coordination service cannot update it.
      }
    }
  }
}
