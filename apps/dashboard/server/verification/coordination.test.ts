import { describe, expect, mock, test } from "bun:test";

import { MemoryVerificationCoordinator, RedisVerificationCoordinator } from "./coordination";

const NOW = 1_800_000_000;

describe("verification coordination", () => {
  test("consumes challenges once and releases failed issuance reservations", async () => {
    const coordinator = new MemoryVerificationCoordinator();

    await expect(coordinator.consumeChallenge("challenge", NOW + 300, NOW)).resolves.toBe(true);
    await expect(coordinator.consumeChallenge("challenge", NOW + 300, NOW)).resolves.toBe(false);

    const first = await coordinator.reserveIssuance("github", "account", "did:ckb:subject", NOW);
    expect(first.ok).toBe(true);
    await expect(
      coordinator.reserveIssuance("github", "account", "did:ckb:other", NOW),
    ).resolves.toMatchObject({ ok: false });
    if (first.ok) await coordinator.releaseIssuance(first.reservation);
    await expect(
      coordinator.reserveIssuance("github", "account", "did:ckb:other", NOW),
    ).resolves.toMatchObject({ ok: true });
  });

  test("keeps account and subject cooldowns separate by provider", async () => {
    const coordinator = new MemoryVerificationCoordinator();

    await coordinator.reserveIssuance("github", "same-account", "did:ckb:first", NOW);
    await expect(
      coordinator.reserveIssuance("github", "other-account", "did:ckb:first", NOW),
    ).resolves.toMatchObject({ ok: false });
    await expect(
      coordinator.reserveIssuance("discord", "same-account", "did:ckb:first", NOW),
    ).resolves.toMatchObject({ ok: true });
  });

  test("uses atomic Redis commands without exposing raw account or DID values", async () => {
    const fetch = mock(async (_input: string | URL | Request, init?: RequestInit) => {
      const command = JSON.parse(String(init?.body)) as unknown[];
      return Response.json({ result: command[0] === "EVAL" ? [1, 604800] : "OK" });
    });
    const coordinator = new RedisVerificationCoordinator(
      {
        UPSTASH_REDIS_REST_TOKEN: "secret-token",
        UPSTASH_REDIS_REST_URL: "https://redis.example.test",
      },
      fetch,
    );

    await expect(
      coordinator.reserveIssuance("github", "private-account", "did:ckb:private", NOW),
    ).resolves.toMatchObject({ ok: true });
    const request = fetch.mock.calls[0];
    const serialized = String(request[1]?.body);
    expect(serialized).not.toContain("private-account");
    expect(serialized).not.toContain("did:ckb:private");
    expect(request[1]?.headers).toEqual({
      authorization: "Bearer secret-token",
      "content-type": "application/json",
    });
  });

  test("fails closed on malformed Redis responses", async () => {
    const coordinator = new RedisVerificationCoordinator(
      {
        UPSTASH_REDIS_REST_TOKEN: "secret-token",
        UPSTASH_REDIS_REST_URL: "https://redis.example.test",
      },
      async () => Response.json({ error: { message: "unexpected" }, result: "OK" }),
    );

    await expect(coordinator.consumeChallenge("challenge", NOW + 300, NOW)).rejects.toMatchObject({
      code: "issuer_unavailable",
    });
  });
});
