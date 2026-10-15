import { describe, expect, test } from "bun:test";
import {
  BLUESKY_CLAIM_SCHEMA_HASH,
  BLUESKY_CLAIM_SCHEMA_ID,
  GITHUB_CLAIM_SCHEMA_HASH,
  GITHUB_CLAIM_SCHEMA_ID,
  TELEGRAM_CLAIM_SCHEMA_HASH,
  TELEGRAM_CLAIM_SCHEMA_ID,
} from "@vellum/schemas";

import {
  ReputationRequestError,
  fetchPublicReputation,
  parsePublicReputationResponse,
  type AvailablePublicReputation,
  verifiedAccounts,
} from "./reputation";

const DID = "did:ckb:fn7u37m7vwerr4ojysgdwwp4mescjtrp";
const ISSUER_DID = "did:ckb:hlvxrdt3e7iwvuxdmbvejp6hc4yoo3no";

function reference(digit: string, outputIndex = 0) {
  return {
    claimId: `0x${digit.repeat(64)}`,
    transactionHash: `0x${digit.repeat(64)}`,
    outputIndex,
  };
}

function availableResponse(): AvailablePublicReputation {
  return {
    ok: true,
    version: "1",
    network: "ckb_testnet",
    subject: DID,
    status: "available",
    policyVersion: "vellum.reputation.v5",
    evaluatedAt: 1_800_000_000,
    overall: { score: 200, maximum: 1_000 },
    categories: [
      { id: "technical", score: 0, maximum: 300 },
      { id: "contribution", score: 0, maximum: 300 },
      { id: "community", score: 0, maximum: 200 },
      { id: "tenure", score: 100, maximum: 100 },
      { id: "recency", score: 100, maximum: 100 },
    ],
    evidence: [
      {
        claim: reference("1"),
        issuerDid: ISSUER_DID,
        schemaId: GITHUB_CLAIM_SCHEMA_ID,
        schemaHash: GITHUB_CLAIM_SCHEMA_HASH,
        issuedAt: 1_799_500_000,
        account: {
          platform: "github",
          id: 42,
          handle: "builder",
          profileUrl: "https://github.com/builder",
          createdAt: 1_650_000_000,
          verifiedAt: 1_799_500_000,
        },
        contributions: [
          { category: "tenure", points: 100, ruleId: "github-account-tenure.v5" },
          { category: "recency", points: 100, ruleId: "github-verification-recency.v5" },
        ],
      },
    ],
    excludedEvidence: [],
  };
}

describe("public reputation client", () => {
  test("uses the canonical contract and formats verified account labels", () => {
    const response = availableResponse();
    const githubEvidence = response.evidence[0];
    if (githubEvidence.schemaId !== GITHUB_CLAIM_SCHEMA_ID) {
      throw new Error("Expected GitHub evidence");
    }
    response.evidence.push(
      {
        ...githubEvidence,
        claim: reference("2"),
        issuedAt: 1_799_500_100,
        account: {
          ...githubEvidence.account,
          verifiedAt: 1_799_500_100,
        },
        contributions: [],
      },
      {
        ...githubEvidence,
        claim: reference("3"),
        schemaId: BLUESKY_CLAIM_SCHEMA_ID,
        schemaHash: BLUESKY_CLAIM_SCHEMA_HASH,
        account: {
          platform: "bluesky",
          id: "did:plc:abcdefghijklmnopqrstuvwx",
          handle: "builder.bsky.social",
          profileUrl: "https://bsky.app/profile/did:plc:abcdefghijklmnopqrstuvwx",
          verifiedAt: 1_799_500_000,
        },
        contributions: [],
      },
      {
        ...githubEvidence,
        claim: reference("4"),
        schemaId: TELEGRAM_CLAIM_SCHEMA_ID,
        schemaHash: TELEGRAM_CLAIM_SCHEMA_HASH,
        account: {
          platform: "telegram",
          id: "123456789",
          displayName: "Vellum Builder",
          verifiedAt: 1_799_500_000,
        },
        contributions: [],
      },
    );

    const parsed = parsePublicReputationResponse(response, DID);
    expect(parsed.status).toBe("available");
    if (parsed.status !== "available") throw new Error("Expected an available score");
    expect(parsed.overall).toEqual({ score: 200, maximum: 1_000 });
    expect(verifiedAccounts(parsed)).toEqual([
      {
        platform: "github",
        id: "42",
        displayLabel: "@builder",
        profileUrl: "https://github.com/builder",
        verifiedAt: 1_799_500_100,
        issuerDid: ISSUER_DID,
      },
      {
        platform: "telegram",
        id: "123456789",
        displayLabel: "Vellum Builder",
        verifiedAt: 1_799_500_000,
        issuerDid: ISSUER_DID,
      },
      {
        platform: "bluesky",
        id: "did:plc:abcdefghijklmnopqrstuvwx",
        displayLabel: "@builder.bsky.social",
        profileUrl: "https://bsky.app/profile/did:plc:abcdefghijklmnopqrstuvwx",
        verifiedAt: 1_799_500_000,
        issuerDid: ISSUER_DID,
      },
    ]);
  });

  test("rejects responses that diverge from the active reputation policy", () => {
    expect(() => parsePublicReputationResponse(availableResponse(), `${DID}x`)).toThrow();

    const wrongPolicy = { ...availableResponse(), policyVersion: "vellum.reputation.v4" };
    expect(() => parsePublicReputationResponse(wrongPolicy, DID)).toThrow();

    const wrongMaximum = availableResponse();
    wrongMaximum.categories[0].maximum = 301;
    expect(() => parsePublicReputationResponse(wrongMaximum, DID)).toThrow();

    const wrongAccountUrl = availableResponse();
    const account = wrongAccountUrl.evidence[0].account;
    if (account.platform !== "github") throw new Error("Expected a GitHub account");
    account.profileUrl = "https://example.com/builder";
    expect(() => parsePublicReputationResponse(wrongAccountUrl, DID)).toThrow();
  });

  test("returns a canonical unavailable response from a non-success status", async () => {
    const body = {
      ok: false,
      version: "1",
      network: "ckb_testnet",
      subject: DID,
      status: "unavailable",
      policyVersion: "vellum.reputation.v5",
      evaluatedAt: 1_800_000_000,
      error: { code: "claim-read-unavailable", message: "Indexer unavailable." },
    };
    const result = await fetchPublicReputation(
      DID,
      async () => new Response(JSON.stringify(body), { status: 503 }),
      "https://dashboard.example",
    );
    expect(result).toMatchObject({
      status: "unavailable",
      subject: DID,
      error: { code: "claim-read-unavailable", message: "Indexer unavailable." },
    });
  });

  test("maps API failures without accepting malformed success data", async () => {
    const notFound = fetchPublicReputation(
      DID,
      async () =>
        new Response(
          JSON.stringify({
            ok: false,
            version: "1",
            error: { code: "subject_not_found", message: "Identity not found." },
          }),
          { status: 404 },
        ),
      "https://dashboard.example",
    );
    await expect(notFound).rejects.toBeInstanceOf(ReputationRequestError);
    await expect(notFound).rejects.toMatchObject({ code: "not_found" });

    const malformed = fetchPublicReputation(
      DID,
      async () => new Response(JSON.stringify({ ...availableResponse(), subject: "other" })),
      "https://dashboard.example",
    );
    await expect(malformed).rejects.toBeInstanceOf(ReputationRequestError);
    await expect(malformed).rejects.toMatchObject({ code: "invalid_response" });
  });
});
