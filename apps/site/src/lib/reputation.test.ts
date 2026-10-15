import { describe, expect, test } from "bun:test";

import {
  ReputationRequestError,
  fetchPublicReputation,
  parsePublicReputationResponse,
  verifiedAccounts,
} from "./reputation";

const DID = "did:ckb:fn7u37m7vwerr4ojysgdwwp4mescjtrp";

type RawAvailableResponse = {
  ok: boolean;
  version: string;
  network: string;
  subject: string;
  status: string;
  policyVersion: string;
  evaluatedAt: number;
  overall: { score: number; maximum: number };
  categories: Array<{ id: string; score: number; maximum: number }>;
  evidence: Array<{
    claim: { claimId: string; transactionHash: string; outputIndex: number };
    issuerDid: string;
    schemaId: string;
    schemaHash: string;
    issuedAt: number;
    account: {
      platform: string;
      id: string | number;
      handle: string;
      profileUrl: string;
      verifiedAt: number;
    };
    contributions: Array<{ category: string; points: number; ruleId: string }>;
  }>;
  excludedEvidence: unknown[];
};

function availableResponse(): RawAvailableResponse {
  return {
    ok: true,
    version: "1",
    network: "ckb_testnet",
    subject: DID,
    status: "available",
    policyVersion: "vellum.reputation.v5",
    evaluatedAt: 1_800_000_000,
    overall: { score: 100, maximum: 1_000 },
    categories: [
      { id: "technical", score: 0, maximum: 300 },
      { id: "contribution", score: 0, maximum: 300 },
      { id: "community", score: 0, maximum: 200 },
      { id: "tenure", score: 0, maximum: 100 },
      { id: "recency", score: 100, maximum: 100 },
    ],
    evidence: [
      {
        claim: { claimId: "0x01", transactionHash: "0x02", outputIndex: 1 },
        issuerDid: "did:ckb:hlvxrdt3e7iwvuxdmbvejp6hc4yoo3no",
        schemaId: "vellum.social.github.v1",
        schemaHash: "0x03",
        issuedAt: 1_799_999_900,
        account: {
          platform: "github",
          id: 42,
          handle: "builder",
          profileUrl: "https://github.com/builder",
          verifiedAt: 1_799_999_900,
        },
        contributions: [{ category: "recency", points: 100, ruleId: "recent.v1" }],
      },
    ],
    excludedEvidence: [],
  };
}

describe("public reputation client", () => {
  test("parses the score fields and deduplicates verified accounts", () => {
    const response = availableResponse();
    response.evidence.push({
      ...response.evidence[0],
      claim: { claimId: "0x04", transactionHash: "0x05", outputIndex: 2 },
      schemaId: "vellum.contribution.github.v1",
      account: { ...response.evidence[0].account, verifiedAt: 1_799_999_950 },
      contributions: [],
    });
    response.evidence.push({
      ...response.evidence[0],
      claim: { claimId: "0x06", transactionHash: "0x07", outputIndex: 3 },
      schemaId: "vellum.social.bluesky.v1",
      account: {
        platform: "bluesky",
        id: "did:plc:builder",
        handle: "builder.bsky.social",
        profileUrl: "https://bsky.app/profile/builder.bsky.social",
        verifiedAt: 1_799_999_925,
      },
      contributions: [],
    });
    response.evidence.push({
      ...response.evidence[0],
      claim: { claimId: "0x08", transactionHash: "0x09", outputIndex: 4 },
      schemaId: "vellum.social.discord.v1",
      account: {
        platform: "discord",
        id: "123456789",
        handle: "builder",
        profileUrl: "https://discord.com/users/123456789",
        verifiedAt: 1_799_999_930,
      },
      contributions: [],
    });

    const parsed = parsePublicReputationResponse(response, DID);
    expect(parsed.status).toBe("available");
    if (parsed.status !== "available") throw new Error("Expected an available score");
    expect(parsed.overall).toEqual({ score: 100, maximum: 1_000 });
    expect(parsed.evidence[0].contributionPoints).toBe(100);
    expect(verifiedAccounts(parsed)).toEqual([
      {
        platform: "github",
        id: "42",
        label: "builder",
        profileUrl: "https://github.com/builder",
        verifiedAt: 1_799_999_950,
        issuerDid: "did:ckb:hlvxrdt3e7iwvuxdmbvejp6hc4yoo3no",
      },
      {
        platform: "discord",
        id: "123456789",
        label: "builder",
        profileUrl: "https://discord.com/users/123456789",
        verifiedAt: 1_799_999_930,
        issuerDid: "did:ckb:hlvxrdt3e7iwvuxdmbvejp6hc4yoo3no",
      },
      {
        platform: "bluesky",
        id: "did:plc:builder",
        label: "builder.bsky.social",
        profileUrl: "https://bsky.app/profile/builder.bsky.social",
        verifiedAt: 1_799_999_925,
        issuerDid: "did:ckb:hlvxrdt3e7iwvuxdmbvejp6hc4yoo3no",
      },
    ]);
  });

  test("rejects a mismatched subject and inconsistent totals", () => {
    expect(() => parsePublicReputationResponse(availableResponse(), `${DID}x`)).toThrow();
    const inconsistent = availableResponse();
    inconsistent.overall.score = 101;
    expect(() => parsePublicReputationResponse(inconsistent, DID)).toThrow();
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

  test("maps API request failures without accepting malformed success data", async () => {
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
