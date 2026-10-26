import { describe, expect, test } from "bun:test";

import {
  loadPublicProfile,
  type PublicProfileDependencies,
  type PublicProfileUpdate,
} from "./public-profile";

const DID = "did:ckb:fn7u37m7vwerr4ojysgdwwp4mescjtrp";

function dependencies(
  overrides: Partial<PublicProfileDependencies> = {},
): PublicProfileDependencies {
  return {
    createClient: () => ({}) as never,
    resolveDid: async () =>
      ({
        did: DID,
        data: {
          type: "v1",
          value: {
            document: {
              services: {
                profile: {
                  type: "VellumProfile",
                  endpoint: "inline",
                  displayName: "Builder",
                },
              },
            },
          },
        },
      }) as never,
    readClaims: async () => ({ claims: [], invalid: [] }),
    fetchReputation: async () =>
      ({
        ok: true,
        version: "1",
        network: "ckb_testnet",
        subject: DID,
        status: "available",
        policyVersion: "vellum.reputation.v7",
        evaluatedAt: 1_800_000_000,
        overall: { score: 0, maximum: 1_000 },
        categories: [],
        evidence: [],
        excludedEvidence: [],
      }) as never,
    timeoutMs: 8_000,
    ...overrides,
  };
}

describe("public profile loader", () => {
  test("rejects invalid identifiers before starting network work", async () => {
    let calls = 0;
    const result = await loadPublicProfile("did:ckb:invalid", {
      createClient: () => {
        calls += 1;
        return {} as never;
      },
    });
    expect(result).toEqual({ status: "invalid" });
    expect(calls).toBe(0);
  });

  test("starts identity, claims, and reputation reads together", async () => {
    const calls: string[] = [];
    let finishIdentity!: (value: never) => void;
    let finishClaims!: (value: never) => void;
    let finishReputation!: (value: never) => void;
    const identity = new Promise<never>((resolve) => (finishIdentity = resolve));
    const claims = new Promise<never>((resolve) => (finishClaims = resolve));
    const reputation = new Promise<never>((resolve) => (finishReputation = resolve));

    const pending = loadPublicProfile(
      DID,
      dependencies({
        resolveDid: (() => {
          calls.push("identity");
          return identity;
        }) as never,
        readClaims: (() => {
          calls.push("claims");
          return claims;
        }) as never,
        fetchReputation: (() => {
          calls.push("reputation");
          return reputation;
        }) as never,
      }),
    );

    expect(calls).toEqual(["identity", "claims", "reputation"]);
    finishIdentity(null as never);
    finishClaims({ claims: [], invalid: [] } as never);
    finishReputation({} as never);
    expect(await pending).toEqual({ status: "not-found" });
  });

  test("keeps a resolved identity when a secondary section fails", async () => {
    const result = await loadPublicProfile(
      DID,
      dependencies({
        readClaims: async () => {
          throw new Error("Indexer offline");
        },
      }),
    );

    expect(result.status).toBe("available");
    if (result.status !== "available") throw new Error("Expected an available profile");
    expect(result.identity.profile.displayName).toBe("Builder");
    expect(result.claims).toEqual({
      status: "unavailable",
      message: "Vellum could not read this identity's complete Claim Cell ledger.",
    });
    expect(result.reputation.status).toBe("available");
  });

  test("settles stalled secondary sections as unavailable", async () => {
    const stalled = new Promise<never>(() => undefined);
    const result = await loadPublicProfile(
      DID,
      dependencies({
        readClaims: (() => stalled) as never,
        fetchReputation: (() => stalled) as never,
        timeoutMs: 5,
      }),
    );

    expect(result).toMatchObject({
      status: "available",
      claims: { status: "unavailable" },
      reputation: { status: "unavailable" },
    });
  });

  test("settles a stalled identity read as unavailable", async () => {
    const result = await loadPublicProfile(
      DID,
      dependencies({
        resolveDid: (() => new Promise<never>(() => undefined)) as never,
        timeoutMs: 5,
      }),
    );

    expect(result).toEqual({
      status: "unavailable",
      message: "Vellum could not resolve this identity on CKB Testnet.",
    });
  });

  test("publishes the identity before slower profile sections settle", async () => {
    let finishClaims!: (value: never) => void;
    let finishReputation!: (value: never) => void;
    const claims = new Promise<never>((resolve) => (finishClaims = resolve));
    const reputation = new Promise<never>((resolve) => (finishReputation = resolve));
    const updates: PublicProfileUpdate[] = [];

    const pending = loadPublicProfile(
      DID,
      dependencies({
        readClaims: (() => claims) as never,
        fetchReputation: (() => reputation) as never,
      }),
      (update) => updates.push(update),
    );

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(updates).toContainEqual(
      expect.objectContaining({
        section: "identity",
        value: expect.objectContaining({ status: "available" }),
      }),
    );

    finishClaims({ claims: [], invalid: [] } as never);
    finishReputation({} as never);
    await pending;
  });

  test("distinguishes missing identities from resolution failures", async () => {
    await expect(
      loadPublicProfile(DID, dependencies({ resolveDid: async () => undefined })),
    ).resolves.toEqual({ status: "not-found" });
    await expect(
      loadPublicProfile(
        DID,
        dependencies({
          resolveDid: async () => {
            throw new Error("RPC offline");
          },
        }),
      ),
    ).resolves.toEqual({
      status: "unavailable",
      message: "Vellum could not resolve this identity on CKB Testnet.",
    });
  });
});
