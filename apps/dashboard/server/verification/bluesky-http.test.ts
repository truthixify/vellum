import { describe, expect, mock, test } from "bun:test";

import type { ClaimIssuanceResult, VerifiedClaim } from "./contracts";
import { MemoryVerificationCoordinator } from "./coordination";
import { BlueskyVerificationError, VerificationServiceError } from "./errors";
import type { VerificationFailureLogger } from "./logging";
import {
  blueskyActionFromUrl,
  handleBlueskyRequest,
  type BlueskyClaimIssuer,
} from "./bluesky-http";
import type { BlueskyEnvironment, BlueskyVerification } from "./bluesky";

const SUBJECT_DID = "did:ckb:fn7u37m7vwerr4ojysgdwwp4mescjtrp";
const ACCOUNT_DID = "did:plc:ewvi7nxzyoun6zhxrhs64oiz";
const HANDLE = "builder.bsky.social";
const APP_PASSWORD = "abcd-efgh-ijkl-mnop";
const NOW = 1_800_000_000;
const CONTROLLER_LOCK_HASH = `0x${"44".repeat(32)}` as `0x${string}`;
const TRANSACTION_HASH = `0x${"11".repeat(32)}`;
const SUBJECT_PROOF = {
  challenge: "signed-challenge",
  signature: {
    signature: "signed-message",
    identity: `0x${"33".repeat(33)}`,
    signType: "CkbSecp256k1" as const,
  },
};
const ENVIRONMENT = {
  VELLUM_OAUTH_STATE_SECRET: "state-secret-for-tests-only".repeat(2),
} satisfies BlueskyEnvironment;
const CLAIM: VerifiedClaim = {
  schema: {
    id: "vellum.social.bluesky.v1",
    hash: "0x60bfe9263501d3d17513463b9a3163793690dcf2b614ecc17d7dd52688a083f6",
  },
  payload: {
    did: ACCOUNT_DID,
    handle: HANDLE,
    profile_url: `https://bsky.app/profile/${ACCOUNT_DID}`,
    verified_at: NOW,
  },
  issuedAt: NOW,
};
const VERIFIED: BlueskyVerification = {
  account: {
    did: ACCOUNT_DID,
    handle: HANDLE,
    profileUrl: `https://bsky.app/profile/${ACCOUNT_DID}`,
  },
  claim: CLAIM,
};
const ISSUANCE: ClaimIssuanceResult = {
  status: "submitted",
  network: "ckb_testnet",
  payer: "issuer",
  transactionHash: TRANSACTION_HASH,
  claimId: `0x${"22".repeat(32)}`,
  outputIndex: 0,
};

function dependencies() {
  const coordinator = new MemoryVerificationCoordinator();
  return {
    environment: ENVIRONMENT,
    fetch: mock(async () => Response.json({})),
    issueClaim: mock(
      async (
        _subject: Parameters<BlueskyClaimIssuer>[0],
        _claim: Parameters<BlueskyClaimIssuer>[1],
      ) => ISSUANCE,
    ),
    createCoordinator: () => coordinator,
    assertSubjectController: mock(async () => undefined),
    createSubjectChallenge: mock(async () => ({
      challenge: SUBJECT_PROOF.challenge,
      expiresAt: NOW + 300,
      message: "Vellum account verification",
    })),
    verifySubjectProof: mock(async () => CONTROLLER_LOCK_HASH),
    verifyCredentials: mock(async () => VERIFIED),
    logFailure: mock((_failure: Parameters<VerificationFailureLogger>[0]) => undefined),
    now: () => NOW,
  };
}

function submitRequest(overrides: Record<string, unknown> = {}): Request {
  return new Request("https://dashboard.usevellum.xyz/api/verify/bluesky/submit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      version: "1",
      subject: { did: SUBJECT_DID },
      proof: SUBJECT_PROOF,
      handle: HANDLE,
      appPassword: APP_PASSWORD,
      ...overrides,
    }),
  });
}

describe("Bluesky HTTP boundary", () => {
  test("publishes the protected form contract and wallet challenge", async () => {
    const deps = dependencies();
    const start = await handleBlueskyRequest(
      new Request("https://dashboard.usevellum.xyz/api/verify/bluesky/start"),
      deps,
    );
    expect(start.status).toBe(200);
    expect(await start.json()).toEqual({
      ok: true,
      version: "1",
      platform: "bluesky",
      fields: [
        {
          name: "handle",
          type: "text",
          label: "Bluesky handle",
          autoComplete: "username",
          required: true,
          maximumLength: 253,
        },
        {
          name: "appPassword",
          type: "password",
          label: "App password",
          autoComplete: "off",
          required: true,
          minimumLength: 19,
          maximumLength: 19,
        },
      ],
      appPasswordUrl: "https://bsky.app/settings/app-passwords",
    });

    const challenge = await handleBlueskyRequest(
      new Request("https://dashboard.usevellum.xyz/api/verify/bluesky/challenge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ version: "1", subject: { did: SUBJECT_DID } }),
      }),
      deps,
    );
    expect(challenge.status).toBe(200);
    expect(await challenge.json()).toMatchObject({
      ok: true,
      platform: "bluesky",
      challenge: SUBJECT_PROOF.challenge,
    });
  });

  test("verifies wallet and Bluesky control before issuing a subject-bound claim", async () => {
    const deps = dependencies();
    const response = await handleBlueskyRequest(submitRequest(), deps);
    const responseText = await response.text();

    expect(response.status).toBe(201);
    expect(JSON.parse(responseText)).toEqual({
      ok: true,
      version: "1",
      platform: "bluesky",
      subject: { did: SUBJECT_DID },
      account: VERIFIED.account,
      claim: CLAIM,
      issuance: ISSUANCE,
    });
    expect(responseText).not.toContain(APP_PASSWORD);
    expect(deps.verifySubjectProof).toHaveBeenCalledWith(
      "bluesky",
      { did: SUBJECT_DID },
      SUBJECT_PROOF,
      ENVIRONMENT.VELLUM_OAUTH_STATE_SECRET,
      NOW,
      expect.any(MemoryVerificationCoordinator),
      ENVIRONMENT,
    );
    expect(deps.verifyCredentials).toHaveBeenCalledWith(
      { handle: HANDLE, appPassword: APP_PASSWORD },
      { fetch: deps.fetch, now: deps.now },
    );
    expect(deps.assertSubjectController).toHaveBeenCalledWith(
      { did: SUBJECT_DID },
      CONTROLLER_LOCK_HASH,
      ENVIRONMENT,
    );
    expect(deps.issueClaim).toHaveBeenCalledWith({ did: SUBJECT_DID }, CLAIM);
    expect(JSON.stringify(deps.issueClaim.mock.calls)).not.toContain(APP_PASSWORD);
  });

  test("returns clear credential errors without issuing or logging the password", async () => {
    const deps = dependencies();
    deps.verifyCredentials = mock(async () => {
      throw new BlueskyVerificationError(
        "verification_failed",
        401,
        "The Bluesky handle or app password was not accepted.",
      );
    });
    const response = await handleBlueskyRequest(submitRequest(), deps);
    const text = await response.text();

    expect(response.status).toBe(401);
    expect(JSON.parse(text)).toMatchObject({
      error: { code: "verification_failed" },
    });
    expect(text).not.toContain(APP_PASSWORD);
    expect(deps.issueClaim).not.toHaveBeenCalled();
    expect(deps.logFailure).not.toHaveBeenCalled();
  });

  test("fails closed on malformed claims and controller rotation", async () => {
    const malformed = dependencies();
    malformed.verifyCredentials = mock(async () => ({
      ...VERIFIED,
      claim: { ...CLAIM, schema: { ...CLAIM.schema, hash: `0x${"99".repeat(32)}` } },
    }));
    const malformedResponse = await handleBlueskyRequest(submitRequest(), malformed);
    expect(malformedResponse.status).toBe(502);
    expect(await malformedResponse.json()).toMatchObject({
      error: { code: "provider_unavailable" },
    });
    expect(malformed.issueClaim).not.toHaveBeenCalled();

    const rotated = dependencies();
    rotated.assertSubjectController = mock(async () => {
      throw new VerificationServiceError(
        "subject_control_invalid",
        400,
        "The identity controller changed.",
      );
    });
    const rotatedResponse = await handleBlueskyRequest(submitRequest(), rotated);
    expect(rotatedResponse.status).toBe(400);
    expect(await rotatedResponse.json()).toMatchObject({
      error: { code: "subject_control_invalid" },
    });
    expect(rotated.issueClaim).not.toHaveBeenCalled();
  });

  test("enforces account and identity cooldowns after successful issuance", async () => {
    const deps = dependencies();
    const first = await handleBlueskyRequest(submitRequest(), deps);
    const second = await handleBlueskyRequest(submitRequest(), deps);

    expect(first.status).toBe(201);
    expect(second.status).toBe(429);
    expect(await second.json()).toMatchObject({
      error: { code: "verification_rate_limited", retryAt: NOW + 7 * 24 * 60 * 60 },
    });
    expect(deps.issueClaim).toHaveBeenCalledTimes(1);
  });

  test("rejects invalid requests and ambiguous action routing", async () => {
    const deps = dependencies();
    const invalid = await handleBlueskyRequest(submitRequest({ appPassword: "short" }), deps);
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({ error: { code: "invalid_request" } });
    expect(deps.verifySubjectProof).not.toHaveBeenCalled();

    const primaryPassword = await handleBlueskyRequest(
      submitRequest({ appPassword: "primary-password-example" }),
      deps,
    );
    expect(primaryPassword.status).toBe(400);
    expect(deps.verifySubjectProof).not.toHaveBeenCalled();

    const wrongMethod = await handleBlueskyRequest(
      new Request("https://dashboard.usevellum.xyz/api/verify/bluesky/submit"),
      deps,
    );
    expect(wrongMethod.status).toBe(405);
    expect(
      blueskyActionFromUrl(
        new Request("https://dashboard.usevellum.xyz/api/bluesky?action=start&action=submit"),
      ),
    ).toBeUndefined();
  });
});
