import { describe, expect, mock, test } from "bun:test";
import { defaultParseSearch } from "@tanstack/react-router";

import type { ClaimIssuanceResult } from "./contracts";
import { MemoryVerificationCoordinator } from "./coordination";
import { VerificationServiceError } from "./errors";
import type { VerificationFailureLogger } from "./logging";
import {
  handleTelegramOAuthRequest,
  telegramActionFromUrl,
  type TelegramClaimIssuer,
} from "./telegram-http";
import type { TelegramOAuthEnvironment } from "./telegram";

const SUBJECT_DID = "did:ckb:fn7u37m7vwerr4ojysgdwwp4mescjtrp";
const NOW = 1_800_000_000;
const CONTROLLER_LOCK_HASH = `0x${"44".repeat(32)}` as const;
const OIDC_SUBJECT = "1234123412341234123";
const ACCOUNT_ID = "2468101214";
const BOT_USER_ID = "987654321";
const CHAT_ID = "-1006577996900705";
const TRANSACTION_HASH = `0x${"11".repeat(32)}`;
const ENVIRONMENT = {
  TELEGRAM_CLIENT_ID: "123456789012345678",
  TELEGRAM_CLIENT_SECRET: "telegram-client-secret-for-tests-only",
  TELEGRAM_BOT_TOKEN: `${BOT_USER_ID}:telegram-bot-token-for-tests-only`,
  TELEGRAM_OAUTH_CALLBACK_URL: "https://dashboard.usevellum.xyz/api/verify/telegram/callback",
  TELEGRAM_TRUSTED_COMMUNITIES: JSON.stringify([
    { chatId: CHAT_ID, name: "Nervos Network", type: "supergroup" },
  ]),
  VELLUM_OAUTH_STATE_SECRET: "state-secret-for-tests-only".repeat(2),
} satisfies TelegramOAuthEnvironment;

const ISSUANCE: ClaimIssuanceResult = {
  status: "submitted",
  network: "ckb_testnet",
  payer: "issuer",
  transactionHash: TRANSACTION_HASH,
  claimId: `0x${"22".repeat(32)}`,
  outputIndex: 0,
};
const COMMUNITY_ISSUANCE: ClaimIssuanceResult = {
  ...ISSUANCE,
  claimId: `0x${"23".repeat(32)}`,
  outputIndex: 1,
};
const SUBJECT_PROOF = {
  challenge: "signed-challenge",
  signature: {
    signature: "signed-message",
    identity: `0x${"33".repeat(33)}`,
    signType: "CkbSecp256k1" as const,
  },
};

function dependencies() {
  const coordinator = new MemoryVerificationCoordinator();
  let currentTime = NOW;
  return {
    environment: ENVIRONMENT,
    fetch: mock(async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input) === "https://oauth.telegram.org/token") {
        return Response.json({
          access_token: "telegram-access-token-for-tests-only",
          token_type: "Bearer",
          expires_in: 3_600,
          id_token: "signed-telegram-id-token",
        });
      }
      const body = new URLSearchParams(String(init?.body));
      const userId = body.get("user_id");
      return Response.json({
        ok: true,
        result: {
          status: userId === BOT_USER_ID ? "administrator" : "member",
          user: { id: Number(userId) },
        },
      });
    }),
    issueClaims: mock(
      async (
        _subject: Parameters<TelegramClaimIssuer>[0],
        _claims: Parameters<TelegramClaimIssuer>[1],
      ) => [ISSUANCE, COMMUNITY_ISSUANCE],
    ),
    createCoordinator: () => coordinator,
    assertSubjectController: mock(async () => undefined),
    createSubjectChallenge: mock(async () => ({
      challenge: SUBJECT_PROOF.challenge,
      expiresAt: currentTime + 300,
      message: "Vellum account verification",
    })),
    verifySubjectProof: mock(async () => CONTROLLER_LOCK_HASH),
    verifyIdToken: mock(async () => ({
      sub: OIDC_SUBJECT,
      id: Number(ACCOUNT_ID),
      name: "Vellum Builder",
      preferred_username: "vellum_builder",
    })),
    logFailure: mock((_failure: Parameters<VerificationFailureLogger>[0]) => undefined),
    nonceBytes: () => Uint8Array.from({ length: 32 }, (_, index) => index),
    now: () => currentTime,
    sleep: mock(async () => undefined),
    setNow: (value: number) => {
      currentTime = value;
    },
  };
}

async function start(deps = dependencies()) {
  const response = await handleTelegramOAuthRequest(
    new Request("https://dashboard.usevellum.xyz/api/verify/telegram/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        version: "1",
        subject: { did: SUBJECT_DID },
        proof: SUBJECT_PROOF,
      }),
    }),
    deps,
  );
  const body = (await response.json()) as { authorizationUrl: string };
  return { response, body, deps };
}

function callbackRequest(
  authorizationUrl: string,
  cookie: string,
  parameters: Record<string, string> = { code: "one-time-code" },
): Request {
  const callback = new URL(ENVIRONMENT.TELEGRAM_OAUTH_CALLBACK_URL);
  const state = new URL(authorizationUrl).searchParams.get("state") ?? "";
  callback.searchParams.set("state", state);
  for (const [name, value] of Object.entries(parameters)) callback.searchParams.set(name, value);
  return new Request(callback, { headers: { cookie } });
}

describe("Telegram OAuth HTTP boundary", () => {
  test("returns a wallet challenge and starts a short-lived PKCE request", async () => {
    const deps = dependencies();
    const challenge = await handleTelegramOAuthRequest(
      new Request("https://dashboard.usevellum.xyz/api/verify/telegram/challenge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ version: "1", subject: { did: SUBJECT_DID } }),
      }),
      deps,
    );
    expect(challenge.status).toBe(200);
    expect(await challenge.json()).toMatchObject({ platform: "telegram" });

    const started = await start(deps);
    const authorization = new URL(started.body.authorizationUrl);
    expect(started.response.status).toBe(200);
    expect(started.response.headers.get("set-cookie")).toContain("vellum_telegram_oauth=");
    expect(started.response.headers.get("set-cookie")).toContain("Max-Age=300");
    expect(authorization.origin + authorization.pathname).toBe("https://oauth.telegram.org/auth");
    expect(authorization.searchParams.get("scope")).toBe("openid profile");
    expect(authorization.searchParams.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(authorization.searchParams.get("code_challenge_method")).toBe("S256");
  });

  test("verifies Telegram and submits subject-bound identity and community Claim Cells", async () => {
    const deps = dependencies();
    const started = await start(deps);
    const cookie = started.response.headers.get("set-cookie")?.split(";", 1)[0] ?? "";
    const response = await handleTelegramOAuthRequest(
      callbackRequest(started.body.authorizationUrl, cookie),
      deps,
    );
    const location = new URL(response.headers.get("location") ?? "");
    const search = defaultParseSearch(location.search);

    expect(response.status).toBe(303);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(location.pathname).toBe("/verify/telegram");
    expect(search).toMatchObject({
      status: "submitted",
      subject: SUBJECT_DID,
      transaction: TRANSACTION_HASH,
      claim: ISSUANCE.claimId,
      output: 0,
      communityClaim: COMMUNITY_ISSUANCE.claimId,
      communityOutput: 1,
      communities: 1,
      account: ACCOUNT_ID,
      name: "Vellum Builder",
      username: "vellum_builder",
    });
    expect(deps.assertSubjectController).toHaveBeenCalledWith(
      { did: SUBJECT_DID },
      CONTROLLER_LOCK_HASH,
      ENVIRONMENT,
    );
    expect(deps.issueClaims).toHaveBeenCalledTimes(1);
    expect(deps.issueClaims.mock.calls[0][1]).toHaveLength(2);
    expect(deps.issueClaims.mock.calls[0][1][0]).toMatchObject({
      schema: { id: "vellum.social.telegram.v1" },
      payload: { user_id: ACCOUNT_ID, verified_at: NOW },
    });
    expect(deps.issueClaims.mock.calls[0][1][1]).toMatchObject({
      schema: { id: "vellum.community.telegram.v1" },
      payload: {
        user_id: ACCOUNT_ID,
        memberships: [{ chat_id: CHAT_ID, community_name: "Nervos Network" }],
      },
      expiresAt: NOW + 30 * 86_400,
    });
  });

  test("consumes OAuth state once before provider access", async () => {
    const deps = dependencies();
    const started = await start(deps);
    const cookie = started.response.headers.get("set-cookie")?.split(";", 1)[0] ?? "";
    const request = callbackRequest(started.body.authorizationUrl, cookie);

    const first = await handleTelegramOAuthRequest(request, deps);
    expect(new URL(first.headers.get("location") ?? "").searchParams.get("status")).toBe(
      "submitted",
    );
    const second = await handleTelegramOAuthRequest(
      callbackRequest(started.body.authorizationUrl, cookie, { code: "another-code" }),
      deps,
    );
    expect(new URL(second.headers.get("location") ?? "").searchParams.get("code")).toBe(
      "oauth_state_invalid",
    );
    expect(deps.fetch).toHaveBeenCalledTimes(3);
    expect(deps.issueClaims).toHaveBeenCalledTimes(1);
  });

  test("rejects expired state, provider denial, and controller rotation", async () => {
    const expiredDeps = dependencies();
    const expired = await start(expiredDeps);
    const expiredCookie = expired.response.headers.get("set-cookie")?.split(";", 1)[0] ?? "";
    expiredDeps.setNow(NOW + 300);
    const expiredResponse = await handleTelegramOAuthRequest(
      callbackRequest(expired.body.authorizationUrl, expiredCookie),
      expiredDeps,
    );
    expect(new URL(expiredResponse.headers.get("location") ?? "").searchParams.get("code")).toBe(
      "oauth_state_invalid",
    );

    const deniedDeps = dependencies();
    const denied = await start(deniedDeps);
    const deniedCookie = denied.response.headers.get("set-cookie")?.split(";", 1)[0] ?? "";
    const deniedResponse = await handleTelegramOAuthRequest(
      callbackRequest(denied.body.authorizationUrl, deniedCookie, { error: "access_denied" }),
      deniedDeps,
    );
    expect(new URL(deniedResponse.headers.get("location") ?? "").searchParams.get("code")).toBe(
      "oauth_denied",
    );

    const rotatedDeps = dependencies();
    const rotated = await start(rotatedDeps);
    const rotatedCookie = rotated.response.headers.get("set-cookie")?.split(";", 1)[0] ?? "";
    rotatedDeps.assertSubjectController = mock(async () => {
      throw new VerificationServiceError(
        "subject_control_invalid",
        400,
        "The identity controller changed.",
      );
    });
    const rotatedResponse = await handleTelegramOAuthRequest(
      callbackRequest(rotated.body.authorizationUrl, rotatedCookie),
      rotatedDeps,
    );
    expect(new URL(rotatedResponse.headers.get("location") ?? "").searchParams.get("code")).toBe(
      "subject_control_invalid",
    );
    expect(rotatedDeps.fetch).not.toHaveBeenCalled();
  });

  test("fails closed on invalid proofs, issuance failures, and route errors", async () => {
    const proofDeps = dependencies();
    proofDeps.verifySubjectProof = mock(async () => {
      throw new VerificationServiceError(
        "subject_control_invalid",
        400,
        "The wallet does not control the selected identity.",
      );
    });
    const proof = await start(proofDeps);
    expect(proof.response.status).toBe(400);

    const issuanceDeps = dependencies();
    issuanceDeps.issueClaims = mock(async () => {
      throw new Error("submission failed");
    });
    const issuance = await start(issuanceDeps);
    const cookie = issuance.response.headers.get("set-cookie")?.split(";", 1)[0] ?? "";
    const issuanceResponse = await handleTelegramOAuthRequest(
      callbackRequest(issuance.body.authorizationUrl, cookie),
      issuanceDeps,
    );
    expect(new URL(issuanceResponse.headers.get("location") ?? "").searchParams.get("code")).toBe(
      "issuance_failed",
    );
    expect(issuanceDeps.logFailure).toHaveBeenCalledWith(
      expect.objectContaining({ platform: "telegram", stage: "issuance" }),
    );

    const providerDeps = dependencies();
    const provider = await start(providerDeps);
    const providerCookie = provider.response.headers.get("set-cookie")?.split(";", 1)[0] ?? "";
    providerDeps.fetch = mock(async () =>
      Response.json({ ok: false, error: "temporarily_unavailable" }, { status: 502 }),
    );
    const providerResponse = await handleTelegramOAuthRequest(
      callbackRequest(provider.body.authorizationUrl, providerCookie),
      providerDeps,
    );
    expect(new URL(providerResponse.headers.get("location") ?? "").searchParams.get("code")).toBe(
      "provider_unavailable",
    );
    expect(providerDeps.logFailure).toHaveBeenCalledWith(
      expect.objectContaining({ platform: "telegram", stage: "provider" }),
    );

    const wrongMethod = await handleTelegramOAuthRequest(
      new Request("https://dashboard.usevellum.xyz/api/verify/telegram/start"),
      dependencies(),
    );
    expect(wrongMethod.status).toBe(405);
    expect(
      telegramActionFromUrl(
        new Request("https://dashboard.usevellum.xyz/api/telegram?action=start&action=callback"),
      ),
    ).toBeUndefined();
  });
});
