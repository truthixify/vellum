import { describe, expect, mock, test } from "bun:test";
import type { GithubContributionClaimPayload } from "@vellum/schemas";

import type { ClaimIssuanceResult, VerificationSubject, VerifiedClaim } from "./contracts";
import { VerificationCoordinationError, VerificationServiceError } from "./errors";
import { handleGithubOAuthRequest, githubActionFromUrl } from "./github-http";
import type { GithubOAuthEnvironment } from "./github";
import type { VerificationFailureLogger } from "./logging";
import { MemoryVerificationCoordinator } from "./coordination";

const SUBJECT_DID = "did:ckb:fn7u37m7vwerr4ojysgdwwp4mescjtrp";
const NOW = 1_800_000_000;
const CONTROLLER_LOCK_HASH = `0x${"44".repeat(32)}` as const;
const ENVIRONMENT = {
  GITHUB_CLIENT_ID: "client-id-for-tests",
  GITHUB_CLIENT_SECRET: "client-secret-for-tests-only",
  GITHUB_OAUTH_CALLBACK_URL: "https://dashboard.usevellum.xyz/api/verify/github/callback",
  VELLUM_OAUTH_STATE_SECRET: "state-secret-for-tests-only".repeat(2),
} satisfies GithubOAuthEnvironment;
const ISSUANCE: ClaimIssuanceResult = {
  status: "submitted",
  network: "ckb_testnet",
  payer: "issuer",
  transactionHash: `0x${"11".repeat(32)}`,
  claimId: `0x${"22".repeat(32)}`,
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

function contributionPayload(): GithubContributionClaimPayload {
  return {
    user_id: 5_830_913,
    login: "truthixify",
    verified_at: NOW,
    window_started_at: NOW - 365 * 86_400,
    repository_registry: "ckb.public-contributions.v1",
    eligible_artifact_count: 1,
    artifacts: [
      {
        artifact_id: "PR_kwDOLw3gss7mJq5X",
        changed_files: 17,
        classification: "technical",
        kind: "merged_pull_request",
        merge_commit_sha: "f727991ef727991ef727991ef727991ef727991e",
        merged_at: NOW - 100,
        number: 376,
        occurred_at: NOW - 100,
        pull_request_id: "PR_kwDOLw3gss7mJq5X",
        repository: "ckb-devrel/ccc",
        repository_id: "R_kgDOLw3gsg",
        title: "Add did:ckb support",
        url: "https://github.com/ckb-devrel/ccc/pull/376",
      },
    ],
  };
}

function providerFetch() {
  const responses = [
    Response.json({
      access_token: "provider-token-for-tests-only",
      scope: "",
      token_type: "bearer",
    }),
    Response.json({
      login: "truthixify",
      id: 5_830_913,
      type: "User",
      created_at: "2022-04-15T05:20:00Z",
    }),
    new Response(null, { status: 204 }),
  ];
  return mock(async (_input: string | URL | Request, _init?: RequestInit) => {
    const response = responses.shift();
    if (!response) throw new Error("Unexpected provider request");
    return response;
  });
}

function dependencies(fetch = providerFetch()) {
  const coordinator = new MemoryVerificationCoordinator();
  return {
    collectContributions: mock(
      async (): Promise<GithubContributionClaimPayload | undefined> => undefined,
    ),
    environment: ENVIRONMENT,
    fetch,
    issueClaims: mock(async (_subject: VerificationSubject, _claims: readonly VerifiedClaim[]) => [
      ISSUANCE,
    ]),
    createCoordinator: () => coordinator,
    assertSubjectController: mock(async () => undefined),
    createSubjectChallenge: mock(async () => ({
      challenge: SUBJECT_PROOF.challenge,
      expiresAt: NOW + 300,
      message: "Vellum account verification",
    })),
    verifySubjectProof: mock(async () => CONTROLLER_LOCK_HASH),
    logFailure: mock((_failure: Parameters<VerificationFailureLogger>[0]) => undefined),
    nonceBytes: () => Uint8Array.from({ length: 32 }, (_, index) => index),
    now: () => NOW,
  };
}

async function start(deps = dependencies()) {
  const response = await handleGithubOAuthRequest(
    new Request("https://dashboard.usevellum.xyz/api/verify/github/start", {
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

describe("GitHub OAuth HTTP boundary", () => {
  test("returns a wallet challenge before OAuth starts", async () => {
    const deps = dependencies();
    const response = await handleGithubOAuthRequest(
      new Request("https://dashboard.usevellum.xyz/api/verify/github/challenge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ version: "1", subject: { did: SUBJECT_DID } }),
      }),
      deps,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      challenge: SUBJECT_PROOF.challenge,
      platform: "github",
    });
    expect(deps.createSubjectChallenge).toHaveBeenCalledTimes(1);
  });

  test("starts a short-lived, cookie-bound authorization request", async () => {
    const { response, body } = await start();
    const authorization = new URL(body.authorizationUrl);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=300");
    expect(authorization.searchParams.has("scope")).toBe(false);
    expect(authorization.searchParams.get("state")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(authorization.searchParams.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(authorization.searchParams.get("code_challenge_method")).toBe("S256");
  });

  test("requires a valid wallet proof before creating OAuth state", async () => {
    const deps = dependencies();
    deps.verifySubjectProof = mock(async () => {
      throw new VerificationServiceError(
        "subject_control_invalid",
        400,
        "The wallet does not control the selected identity.",
      );
    });

    const response = await handleGithubOAuthRequest(
      new Request("https://dashboard.usevellum.xyz/api/verify/github/start", {
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

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: "subject_control_invalid" },
    });
    expect(deps.verifySubjectProof).toHaveBeenCalledTimes(1);
  });

  test("completes OAuth, revokes credentials, and redirects with public issuance references", async () => {
    const deps = dependencies();
    const started = await start(deps);
    const authorization = new URL(started.body.authorizationUrl);
    const state = authorization.searchParams.get("state");
    const cookie = started.response.headers.get("set-cookie")?.split(";", 1)[0];
    const callback = new URL(ENVIRONMENT.GITHUB_OAUTH_CALLBACK_URL);
    callback.searchParams.set("code", "one-time-code");
    callback.searchParams.set("state", state ?? "");

    const response = await handleGithubOAuthRequest(
      new Request(callback, { headers: { cookie: cookie ?? "" } }),
      deps,
    );
    const location = new URL(response.headers.get("location") ?? "");

    expect(response.status).toBe(303);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(location.pathname).toBe("/verify/github");
    expect(location.searchParams.get("status")).toBe("submitted");
    expect(location.searchParams.get("subject")).toBe(SUBJECT_DID);
    expect(location.searchParams.get("transaction")).toBe(ISSUANCE.transactionHash);
    expect(location.searchParams.get("claim")).toBe(ISSUANCE.claimId);
    expect(location.searchParams.get("login")).toBe("truthixify");
    expect(deps.issueClaims).toHaveBeenCalledTimes(1);
    expect(deps.issueClaims.mock.calls[0][0]).toEqual({ did: SUBJECT_DID });
    expect(deps.assertSubjectController).toHaveBeenCalledWith(
      { did: SUBJECT_DID },
      CONTROLLER_LOCK_HASH,
      ENVIRONMENT,
    );
  });

  test("issues GitHub identity and contribution evidence in one transaction", async () => {
    const deps = dependencies();
    deps.collectContributions = mock(async () => contributionPayload());
    const contributionIssuance: ClaimIssuanceResult = {
      ...ISSUANCE,
      claimId: `0x${"55".repeat(32)}`,
      outputIndex: 2,
    };
    deps.issueClaims = mock(async () => [ISSUANCE, contributionIssuance]);
    const started = await start(deps);
    const state = new URL(started.body.authorizationUrl).searchParams.get("state");
    const cookie = started.response.headers.get("set-cookie")?.split(";", 1)[0];
    const callback = new URL(ENVIRONMENT.GITHUB_OAUTH_CALLBACK_URL);
    callback.searchParams.set("code", "one-time-code");
    callback.searchParams.set("state", state ?? "");

    const response = await handleGithubOAuthRequest(
      new Request(callback, { headers: { cookie: cookie ?? "" } }),
      deps,
    );
    const location = new URL(response.headers.get("location") ?? "");

    expect(location.searchParams.get("status")).toBe("submitted");
    expect(location.searchParams.get("claim")).toBe(ISSUANCE.claimId);
    expect(deps.issueClaims.mock.calls[0][1]).toHaveLength(2);
    expect(deps.issueClaims.mock.calls[0][1][1]).toMatchObject({
      schema: { id: "vellum.contribution.github.v1" },
      expiresAt: NOW + 30 * 86_400,
    });
  });

  test("rejects contribution evidence for a different GitHub account before issuance", async () => {
    const deps = dependencies();
    deps.collectContributions = mock(async () => ({
      ...contributionPayload(),
      user_id: 99,
    }));
    const started = await start(deps);
    const state = new URL(started.body.authorizationUrl).searchParams.get("state");
    const cookie = started.response.headers.get("set-cookie")?.split(";", 1)[0];
    const callback = new URL(ENVIRONMENT.GITHUB_OAUTH_CALLBACK_URL);
    callback.searchParams.set("code", "one-time-code");
    callback.searchParams.set("state", state ?? "");

    const response = await handleGithubOAuthRequest(
      new Request(callback, { headers: { cookie: cookie ?? "" } }),
      deps,
    );

    expect(new URL(response.headers.get("location") ?? "").searchParams.get("code")).toBe(
      "provider_unavailable",
    );
    expect(deps.issueClaims).not.toHaveBeenCalled();
  });

  test("logs the issuer failure and returns a safe issuance error", async () => {
    const deps = dependencies();
    const issuerFailure = new Error("CKB RPC rejected the transaction");
    deps.issueClaims = mock(async () => Promise.reject(issuerFailure));
    const started = await start(deps);
    const state = new URL(started.body.authorizationUrl).searchParams.get("state");
    const cookie = started.response.headers.get("set-cookie")?.split(";", 1)[0];
    const callback = new URL(ENVIRONMENT.GITHUB_OAUTH_CALLBACK_URL);
    callback.searchParams.set("code", "one-time-code");
    callback.searchParams.set("state", state ?? "");

    const response = await handleGithubOAuthRequest(
      new Request(callback, { headers: { cookie: cookie ?? "" } }),
      deps,
    );
    const location = new URL(response.headers.get("location") ?? "");

    expect(location.searchParams.get("code")).toBe("issuance_failed");
    expect(deps.logFailure).toHaveBeenCalledTimes(1);
    expect(deps.logFailure.mock.calls[0][0]).toMatchObject({
      error: issuerFailure,
      platform: "github",
      stage: "issuance",
    });
  });

  test("rejects a callback without its bound state cookie before provider access", async () => {
    const fetch = providerFetch();
    const deps = dependencies(fetch);
    const started = await start(deps);
    const state = new URL(started.body.authorizationUrl).searchParams.get("state");
    const callback = new URL(ENVIRONMENT.GITHUB_OAUTH_CALLBACK_URL);
    callback.searchParams.set("code", "one-time-code");
    callback.searchParams.set("state", state ?? "");

    const response = await handleGithubOAuthRequest(new Request(callback), deps);
    const location = new URL(response.headers.get("location") ?? "");

    expect(location.searchParams.get("code")).toBe("oauth_state_invalid");
    expect(fetch).not.toHaveBeenCalled();
    expect(deps.issueClaims).not.toHaveBeenCalled();
  });

  test("rejects a controller rotation before provider access", async () => {
    const fetch = providerFetch();
    const deps = dependencies(fetch);
    const started = await start(deps);
    const state = new URL(started.body.authorizationUrl).searchParams.get("state");
    const cookie = started.response.headers.get("set-cookie")?.split(";", 1)[0];
    const callback = new URL(ENVIRONMENT.GITHUB_OAUTH_CALLBACK_URL);
    callback.searchParams.set("code", "one-time-code");
    callback.searchParams.set("state", state ?? "");
    deps.assertSubjectController = mock(async () => {
      throw new VerificationServiceError(
        "subject_control_invalid",
        400,
        "The identity controller changed.",
      );
    });

    const response = await handleGithubOAuthRequest(
      new Request(callback, { headers: { cookie: cookie ?? "" } }),
      deps,
    );
    const location = new URL(response.headers.get("location") ?? "");

    expect(location.searchParams.get("code")).toBe("subject_control_invalid");
    expect(fetch).not.toHaveBeenCalled();
    expect(deps.issueClaims).not.toHaveBeenCalled();
  });

  test("does not issue twice when the same callback is replayed", async () => {
    const responses = [
      Response.json({
        access_token: "provider-token-for-tests-only",
        scope: "",
        token_type: "bearer",
      }),
      Response.json({
        login: "truthixify",
        id: 5_830_913,
        type: "User",
        created_at: "2022-04-15T05:20:00Z",
      }),
      new Response(null, { status: 204 }),
      Response.json({ error: "bad_verification_code" }),
    ];
    const fetch = mock(async () => {
      const response = responses.shift();
      if (!response) throw new Error("Unexpected provider request");
      return response;
    });
    const deps = dependencies(fetch);
    const started = await start(deps);
    const state = new URL(started.body.authorizationUrl).searchParams.get("state");
    const cookie = started.response.headers.get("set-cookie")?.split(";", 1)[0];
    const callback = new URL(ENVIRONMENT.GITHUB_OAUTH_CALLBACK_URL);
    callback.searchParams.set("code", "one-time-code");
    callback.searchParams.set("state", state ?? "");

    const first = await handleGithubOAuthRequest(
      new Request(callback, { headers: { cookie: cookie ?? "" } }),
      deps,
    );
    const replay = await handleGithubOAuthRequest(
      new Request(callback, { headers: { cookie: cookie ?? "" } }),
      deps,
    );

    expect(new URL(first.headers.get("location") ?? "").searchParams.get("status")).toBe(
      "submitted",
    );
    expect(new URL(replay.headers.get("location") ?? "").searchParams.get("code")).toBe(
      "provider_unavailable",
    );
    expect(deps.issueClaims).toHaveBeenCalledTimes(1);
  });

  test("fails closed when durable issuance coordination is unavailable", async () => {
    const deps = dependencies();
    const started = await start(deps);
    const state = new URL(started.body.authorizationUrl).searchParams.get("state");
    const cookie = started.response.headers.get("set-cookie")?.split(";", 1)[0];
    const callback = new URL(ENVIRONMENT.GITHUB_OAUTH_CALLBACK_URL);
    callback.searchParams.set("code", "one-time-code");
    callback.searchParams.set("state", state ?? "");
    deps.createCoordinator = () => {
      throw new VerificationCoordinationError("Verification coordination is unavailable.");
    };

    const response = await handleGithubOAuthRequest(
      new Request(callback, { headers: { cookie: cookie ?? "" } }),
      deps,
    );
    const location = new URL(response.headers.get("location") ?? "");

    expect(location.searchParams.get("code")).toBe("issuer_unavailable");
    expect(deps.issueClaims).not.toHaveBeenCalled();
    expect(deps.logFailure).toHaveBeenCalledTimes(1);
  });

  test("validates state before handling a denied authorization", async () => {
    const fetch = providerFetch();
    const deps = dependencies(fetch);
    const started = await start(deps);
    const state = new URL(started.body.authorizationUrl).searchParams.get("state");
    const cookie = started.response.headers.get("set-cookie")?.split(";", 1)[0];
    const callback = new URL(ENVIRONMENT.GITHUB_OAUTH_CALLBACK_URL);
    callback.searchParams.set("error", "access_denied");
    callback.searchParams.set("state", state ?? "");

    const response = await handleGithubOAuthRequest(
      new Request(callback, { headers: { cookie: cookie ?? "" } }),
      deps,
    );
    const location = new URL(response.headers.get("location") ?? "");

    expect(location.searchParams.get("code")).toBe("oauth_denied");
    expect(fetch).not.toHaveBeenCalled();
    expect(deps.issueClaims).not.toHaveBeenCalled();
  });

  test("returns deterministic method, input, configuration, and route errors", async () => {
    const deps = dependencies();
    const wrongMethod = await handleGithubOAuthRequest(
      new Request("https://dashboard.usevellum.xyz/api/verify/github/start"),
      deps,
    );
    expect(wrongMethod.status).toBe(405);
    expect(wrongMethod.headers.get("allow")).toBe("POST");

    const invalid = await handleGithubOAuthRequest(
      new Request("https://dashboard.usevellum.xyz/api/verify/github/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ version: "1", subject: { did: "not-a-did" } }),
      }),
      deps,
    );
    expect(invalid.status).toBe(400);

    const unavailable = await handleGithubOAuthRequest(
      new Request("https://dashboard.usevellum.xyz/api/verify/github/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          version: "1",
          subject: { did: SUBJECT_DID },
          proof: SUBJECT_PROOF,
        }),
      }),
      { ...deps, environment: {} },
    );
    expect(unavailable.status).toBe(503);
    expect(await unavailable.json()).toMatchObject({
      error: { code: "oauth_configuration_error" },
    });

    expect(
      githubActionFromUrl(
        new Request("https://dashboard.usevellum.xyz/api/verify/github/start/extra"),
      ),
    ).toBeUndefined();
    expect(
      githubActionFromUrl(
        new Request("https://dashboard.usevellum.xyz/api/github?action=start&action=callback"),
      ),
    ).toBeUndefined();
  });
});
