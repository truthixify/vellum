import { describe, expect, test } from "bun:test";
import { defaultParseSearch } from "@tanstack/react-router";

import type { ClaimIssuanceResult, VerifiedClaim } from "./contracts";
import {
  handleIssuerRequest,
  handleVerificationRequest,
  platformFromUrl,
  setRouterSearchParameters,
} from "./http";
import type { PlatformVerifierRegistry } from "./platforms";

const SUBJECT_DID = "did:ckb:fn7u37m7vwerr4ojysgdwwp4mescjtrp";
const HASH = `0x${"55".repeat(32)}`;

const requestBody = {
  version: "1",
  platform: "github",
  subject: { did: SUBJECT_DID },
  proof: {},
} as const;

function post(body: string, headers: HeadersInit = {}): Request {
  return new Request("https://dashboard.usevellum.xyz/api/verify/github", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
}

describe("verification HTTP boundary", () => {
  test("publishes issuer metadata without a private credential", async () => {
    const response = handleIssuerRequest(new Request("https://dashboard.usevellum.xyz/api/issuer"));
    const text = await response.text();
    const body = JSON.parse(text);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      version: "1",
      issuer: {
        network: "ckb_testnet",
        authorization: "did-controller-input",
        submission: "service",
        payer: "issuer",
      },
    });
    expect(text.toLowerCase()).not.toContain("private");
  });

  test("uses deterministic method and JSON errors", async () => {
    const issuerResponse = handleIssuerRequest(
      new Request("https://dashboard.usevellum.xyz/api/issuer", { method: "POST" }),
    );
    expect(issuerResponse.status).toBe(405);
    expect(issuerResponse.headers.get("allow")).toBe("GET");

    const verificationResponse = await handleVerificationRequest(
      new Request("https://dashboard.usevellum.xyz/api/verify/github"),
    );
    expect(verificationResponse.status).toBe(405);
    expect(verificationResponse.headers.get("allow")).toBe("POST");
    expect(await verificationResponse.json()).toMatchObject({
      ok: false,
      error: { code: "method_not_allowed" },
    });
  });

  test("rejects malformed, mislabeled, and oversized request bodies", async () => {
    const malformed = await handleVerificationRequest(post("{"));
    expect(malformed.status).toBe(400);

    const wrongType = await handleVerificationRequest(
      new Request("https://dashboard.usevellum.xyz/api/verify/github", {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: JSON.stringify(requestBody),
      }),
    );
    expect(wrongType.status).toBe(415);

    const oversized = await handleVerificationRequest(post(`"${"x".repeat(16_385)}"`));
    expect(oversized.status).toBe(413);
    expect(await oversized.json()).toMatchObject({
      ok: false,
      error: { code: "invalid_request" },
    });
  });

  test("rejects an unknown platform before reading its body", async () => {
    const response = await handleVerificationRequest(
      new Request("https://dashboard.usevellum.xyz/api/verify/unknown", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "not-json",
      }),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: "unsupported_platform" },
    });
  });

  test("dispatches a valid request and serializes a success response", async () => {
    const claim: VerifiedClaim = {
      schema: { id: "vellum.social.github.v1", hash: HASH },
      payload: { login: "builder" },
      issuedAt: 1_700_000_000,
    };
    const issuance: ClaimIssuanceResult = {
      status: "submitted",
      network: "ckb_testnet",
      payer: "issuer",
      transactionHash: `0x${"66".repeat(32)}`,
      claimId: `0x${"77".repeat(32)}`,
      outputIndex: 0,
    };
    const fallback = async () => claim;
    const verifiers: PlatformVerifierRegistry = {
      github: async () => claim,
      discord: fallback,
      telegram: fallback,
      bluesky: fallback,
    };

    const response = await handleVerificationRequest(post(JSON.stringify(requestBody)), {
      verifiers,
      issueClaim: async () => issuance,
    });

    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({
      ok: true,
      platform: "github",
      claim,
      issuance,
    });
  });

  test("extracts only a complete verification route", () => {
    expect(platformFromUrl(new Request("https://dashboard.usevellum.xyz/api/verify/github"))).toBe(
      "github",
    );
    expect(
      platformFromUrl(new Request("https://dashboard.usevellum.xyz/api/verify/github/extra")),
    ).toBeUndefined();
    expect(
      platformFromUrl(new Request("https://dashboard.usevellum.xyz/api/verify?platform=github")),
    ).toBe("github");
  });

  test("preserves JSON-like callback strings through the router parser", () => {
    const url = new URL("https://dashboard.usevellum.xyz/verify/telegram");
    setRouterSearchParameters(url, {
      account: "2468101214",
      name: "true",
      output: 0,
      status: "submitted",
      unused: undefined,
    });

    expect(defaultParseSearch(url.search)).toEqual({
      account: "2468101214",
      name: "true",
      output: 0,
      status: "submitted",
    });
  });
});
