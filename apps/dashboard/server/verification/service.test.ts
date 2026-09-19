import { describe, expect, mock, test } from "bun:test";

import type { ClaimIssuanceResult, VerifiedClaim } from "./contracts";
import { IssuerConfigurationError } from "./errors";
import {
  platformVerifiers,
  type PlatformVerifier,
  type PlatformVerifierRegistry,
} from "./platforms";
import { verifyPlatformProof, type VerificationServiceDependencies } from "./service";

const SUBJECT_DID = "did:ckb:fn7u37m7vwerr4ojysgdwwp4mescjtrp";
const HASH = `0x${"22".repeat(32)}`;
const TRANSACTION_HASH = `0x${"33".repeat(32)}`;
const CLAIM_ID = `0x${"44".repeat(32)}`;

const request = {
  version: "1",
  platform: "github",
  subject: { did: SUBJECT_DID },
  proof: { code: "proof" },
} as const;

const claim: VerifiedClaim = {
  schema: { id: "vellum.social.github.v1", hash: HASH },
  payload: { login: "builder", accountCreatedAt: "2020-01-01T00:00:00Z" },
  issuedAt: 1_700_000_000,
};

const issuance: ClaimIssuanceResult = {
  status: "submitted",
  network: "ckb_testnet",
  payer: "issuer",
  transactionHash: TRANSACTION_HASH,
  claimId: CLAIM_ID,
  outputIndex: 1,
};

function registry(github: PlatformVerifier): PlatformVerifierRegistry {
  const unavailable: PlatformVerifier = async () => {
    throw new Error("not expected");
  };
  return {
    github,
    discord: unavailable,
    telegram: unavailable,
    bluesky: unavailable,
  };
}

function dependencies(overrides: Partial<VerificationServiceDependencies> = {}) {
  return {
    verifiers: registry(async () => claim),
    issueClaim: async () => issuance,
    ...overrides,
  } satisfies VerificationServiceDependencies;
}

describe("verification service", () => {
  test("returns the typed claim and submitted transaction result", async () => {
    const verifier = mock(async () => claim);
    const issuer = mock(async () => issuance);

    const result = await verifyPlatformProof(
      "github",
      request,
      dependencies({ verifiers: registry(verifier), issueClaim: issuer }),
    );

    expect(result).toEqual({
      status: 201,
      body: {
        ok: true,
        version: "1",
        platform: "github",
        subject: request.subject,
        claim,
        issuance,
      },
    });
    expect(verifier).toHaveBeenCalledTimes(1);
    expect(issuer).toHaveBeenCalledWith(request.subject, claim);
  });

  test("rejects unknown and mismatched platforms before dispatch", async () => {
    const verifier = mock(async () => claim);
    const deps = dependencies({ verifiers: registry(verifier) });

    expect(await verifyPlatformProof("x", request, deps)).toMatchObject({
      status: 404,
      body: { ok: false, error: { code: "unsupported_platform" } },
    });
    expect(
      await verifyPlatformProof("discord", { ...request, platform: "github" }, deps),
    ).toMatchObject({
      status: 400,
      body: { ok: false, error: { code: "invalid_request" } },
    });
    expect(verifier).not.toHaveBeenCalled();
  });

  test("returns a stable placeholder without invoking issuance", async () => {
    const issuer = mock(async () => issuance);
    const result = await verifyPlatformProof("github", request, {
      verifiers: platformVerifiers,
      issueClaim: issuer,
    });

    expect(result).toEqual({
      status: 501,
      body: {
        ok: false,
        version: "1",
        error: {
          code: "not_implemented",
          message: "github verification is not available yet.",
        },
      },
    });
    expect(issuer).not.toHaveBeenCalled();
  });

  test("does not issue a malformed or cross-platform claim", async () => {
    const issuer = mock(async () => issuance);
    const result = await verifyPlatformProof(
      "github",
      request,
      dependencies({
        verifiers: registry(async () => ({
          ...claim,
          schema: { ...claim.schema, id: "vellum.social.discord.v1" },
        })),
        issueClaim: issuer,
      }),
    );

    expect(result).toMatchObject({
      status: 422,
      body: { ok: false, error: { code: "verification_failed" } },
    });
    expect(issuer).not.toHaveBeenCalled();
  });

  test("separates verifier, issuer configuration, and submission failures", async () => {
    const verifierFailure = await verifyPlatformProof(
      "github",
      request,
      dependencies({ verifiers: registry(async () => Promise.reject(new Error("provider"))) }),
    );
    expect(verifierFailure).toMatchObject({
      status: 502,
      body: { ok: false, error: { code: "verification_failed" } },
    });

    const unavailableIssuer = await verifyPlatformProof(
      "github",
      request,
      dependencies({
        issueClaim: async () => {
          throw new IssuerConfigurationError("internal configuration detail");
        },
      }),
    );
    expect(unavailableIssuer).toMatchObject({
      status: 503,
      body: { ok: false, error: { code: "issuer_unavailable" } },
    });
    expect(JSON.stringify(unavailableIssuer)).not.toContain("internal configuration detail");

    const issuanceFailure = await verifyPlatformProof(
      "github",
      request,
      dependencies({
        issueClaim: async () => {
          throw new Error("RPC detail");
        },
      }),
    );
    expect(issuanceFailure).toMatchObject({
      status: 502,
      body: { ok: false, error: { code: "issuance_failed" } },
    });
    expect(JSON.stringify(issuanceFailure)).not.toContain("RPC detail");
  });

  test("does not return an invalid issuance result", async () => {
    const result = await verifyPlatformProof(
      "github",
      request,
      dependencies({
        issueClaim: async () => ({
          ...issuance,
          transactionHash: "not-a-transaction-hash",
        }),
      }),
    );

    expect(result).toMatchObject({
      status: 502,
      body: { ok: false, error: { code: "issuance_failed" } },
    });
  });
});
