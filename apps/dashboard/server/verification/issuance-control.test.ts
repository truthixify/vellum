import { describe, expect, mock, test } from "bun:test";

import { MemoryVerificationCoordinator } from "./coordination";
import { VerificationServiceError } from "./errors";
import { coordinateIssuance } from "./issuance-control";

const NOW = 1_800_000_000;

function input(coordinator: MemoryVerificationCoordinator, issue: () => Promise<string>) {
  return {
    accountId: "account-1",
    coordinator,
    issue,
    now: NOW,
    platform: "github" as const,
    subjectDid: "did:ckb:subject",
  };
}

describe("coordinated issuance", () => {
  test("keeps the cooldown after successful issuance", async () => {
    const coordinator = new MemoryVerificationCoordinator();
    await expect(coordinateIssuance(input(coordinator, async () => "issued"))).resolves.toBe(
      "issued",
    );
    await expect(coordinator.acquireIssuerLease()).resolves.toBeUndefined();

    const second = coordinateIssuance(input(coordinator, async () => "duplicate"));
    await expect(second).rejects.toBeInstanceOf(VerificationServiceError);
    await expect(second).rejects.toMatchObject({
      code: "verification_rate_limited",
      retryAt: NOW + 7 * 24 * 60 * 60,
    });
  });

  test("releases the cooldown and issuer lease after a failed attempt", async () => {
    const coordinator = new MemoryVerificationCoordinator();
    const failure = new Error("submission failed");
    await expect(
      coordinateIssuance(input(coordinator, async () => Promise.reject(failure))),
    ).rejects.toBe(failure);

    await expect(coordinateIssuance(input(coordinator, async () => "retried"))).resolves.toBe(
      "retried",
    );
  });

  test("waits briefly for the durable issuer lease", async () => {
    const coordinator = new MemoryVerificationCoordinator();
    const held = await coordinator.acquireIssuerLease();
    if (!held) throw new Error("Expected an issuer lease");
    const sleep = mock(async () => coordinator.releaseIssuerLease(held));

    await expect(
      coordinateIssuance(
        input(coordinator, async () => "issued"),
        { sleep },
      ),
    ).resolves.toBe("issued");
    expect(sleep).toHaveBeenCalledTimes(1);
  });
});
