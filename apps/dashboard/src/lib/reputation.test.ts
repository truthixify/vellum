import { describe, expect, mock, test } from "bun:test";

import { fetchReputation, ReputationRequestError } from "./reputation";

const DID = "did:ckb:fn7u37m7vwerr4ojysgdwwp4mescjtrp";

function availableResponse() {
  return {
    ok: true,
    version: "1",
    network: "ckb_testnet",
    subject: DID,
    status: "available",
    policyVersion: "vellum.reputation.v1",
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
        claim: {
          claimId: `0x${"1".repeat(64)}`,
          transactionHash: `0x${"2".repeat(64)}`,
          outputIndex: 0,
        },
        issuerDid: "did:ckb:hlvxrdt3e7iwvuxdmbvejp6hc4yoo3no",
        schemaId: "vellum.social.github.v1",
        schemaHash: "0x25980dec7f198c7b228a621c61b911b8a20c55b340f398e495c4be65aa399f3c",
        issuedAt: 1_799_500_000,
        account: {
          platform: "github",
          id: 5_830_913,
          handle: "truthixify",
          profileUrl: "https://github.com/truthixify",
          createdAt: 1_650_000_000,
          verifiedAt: 1_799_500_000,
        },
        contributions: [
          { category: "tenure", points: 100, ruleId: "github-account-tenure.v1" },
          { category: "recency", points: 100, ruleId: "github-verification-recency.v1" },
        ],
      },
    ],
    excludedEvidence: [],
  };
}

describe("reputation API client", () => {
  test("accepts an available score for the requested subject", async () => {
    const fetch = mock(async () => Response.json(availableResponse()));
    const result = await fetchReputation(DID, fetch);

    expect(result.status).toBe("available");
    if (result.status === "available") expect(result.overall.score).toBe(200);
    expect(fetch).toHaveBeenCalledWith(`/api/reputation/${encodeURIComponent(DID)}`, {
      headers: { accept: "application/json" },
    });
  });

  test("preserves an explicit unavailable state", async () => {
    const fetch = mock(async () =>
      Response.json(
        {
          ok: false,
          version: "1",
          network: "ckb_testnet",
          subject: DID,
          status: "unavailable",
          policyVersion: "vellum.reputation.v1",
          evaluatedAt: 1_800_000_000,
          error: { code: "claim-read-unavailable", message: "Indexer unavailable." },
        },
        { status: 503 },
      ),
    );

    await expect(fetchReputation(DID, fetch)).resolves.toMatchObject({ status: "unavailable" });
  });

  test("rejects a response for another subject", async () => {
    const body = availableResponse();
    body.subject = "did:ckb:hlvxrdt3e7iwvuxdmbvejp6hc4yoo3no";
    const fetch = mock(async () => Response.json(body));

    await expect(fetchReputation(DID, fetch)).rejects.toMatchObject({
      name: "ReputationRequestError",
      code: "invalid_response",
    });
  });

  test("rejects internally inconsistent scores", async () => {
    const body = availableResponse();
    body.overall.score = 201;
    const fetch = mock(async () => Response.json(body));

    await expect(fetchReputation(DID, fetch)).rejects.toMatchObject({
      code: "invalid_response",
    });
  });

  test("rejects incomplete categories and account links outside GitHub", async () => {
    const incomplete = availableResponse();
    incomplete.categories.pop();
    const unsafeLink = availableResponse();
    unsafeLink.evidence[0].account.profileUrl = "https://example.com/truthixify";

    await expect(
      fetchReputation(
        DID,
        mock(async () => Response.json(incomplete)),
      ),
    ).rejects.toMatchObject({ code: "invalid_response" });
    await expect(
      fetchReputation(
        DID,
        mock(async () => Response.json(unsafeLink)),
      ),
    ).rejects.toMatchObject({ code: "invalid_response" });
  });

  test("rejects an unavailable result sent as a successful response", async () => {
    const fetch = mock(async () =>
      Response.json({
        ok: false,
        version: "1",
        network: "ckb_testnet",
        subject: DID,
        status: "unavailable",
        policyVersion: "vellum.reputation.v1",
        evaluatedAt: 1_800_000_000,
        error: { code: "claim-read-unavailable", message: "Indexer unavailable." },
      }),
    );

    await expect(fetchReputation(DID, fetch)).rejects.toMatchObject({
      code: "invalid_response",
    });
  });

  test("rejects invalid subjects before making a request", async () => {
    const fetch = mock(async () => Response.json(availableResponse()));

    await expect(fetchReputation("not-a-did", fetch)).rejects.toBeInstanceOf(
      ReputationRequestError,
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});
