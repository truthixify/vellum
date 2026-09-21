import { describe, expect, mock, test } from "bun:test";
import { discordSnowflakeTimestamp } from "@vellum/schemas";

import { fetchReputation, ReputationRequestError } from "./reputation";

const DID = "did:ckb:fn7u37m7vwerr4ojysgdwwp4mescjtrp";

function availableResponse() {
  return {
    ok: true,
    version: "1",
    network: "ckb_testnet",
    subject: DID,
    status: "available",
    policyVersion: "vellum.reputation.v2",
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
          { category: "tenure", points: 100, ruleId: "github-account-tenure.v2" },
          { category: "recency", points: 100, ruleId: "github-verification-recency.v2" },
        ],
      },
    ],
    excludedEvidence: [],
  };
}

function discordAvailableResponse() {
  const userId = "80351110224678912";
  const identityClaim = {
    claimId: `0x${"3".repeat(64)}`,
    transactionHash: `0x${"4".repeat(64)}`,
    outputIndex: 0,
  };
  return {
    ok: true,
    version: "1",
    network: "ckb_testnet",
    subject: DID,
    status: "available",
    policyVersion: "vellum.reputation.v2",
    evaluatedAt: 1_800_000_000,
    overall: { score: 360, maximum: 1_000 },
    categories: [
      { id: "technical", score: 0, maximum: 300 },
      { id: "contribution", score: 0, maximum: 300 },
      { id: "community", score: 160, maximum: 200 },
      { id: "tenure", score: 100, maximum: 100 },
      { id: "recency", score: 100, maximum: 100 },
    ],
    evidence: [
      {
        claim: identityClaim,
        issuerDid: "did:ckb:hlvxrdt3e7iwvuxdmbvejp6hc4yoo3no",
        schemaId: "vellum.social.discord.v1",
        schemaHash: "0x1d0169167b6c34b7818ba6932974679f8fd5284e4d5d79319da12f7d79df8b69",
        issuedAt: 1_799_500_000,
        account: {
          platform: "discord",
          id: userId,
          handle: "truthixify",
          profileUrl: `https://discord.com/users/${userId}`,
          createdAt: discordSnowflakeTimestamp(userId),
          verifiedAt: 1_799_500_000,
        },
        contributions: [
          { category: "tenure", points: 100, ruleId: "discord-account-tenure.v2" },
          { category: "recency", points: 100, ruleId: "discord-verification-recency.v2" },
        ],
      },
      {
        claim: {
          claimId: `0x${"5".repeat(64)}`,
          transactionHash: identityClaim.transactionHash,
          outputIndex: 1,
        },
        supportingClaims: [{ ...identityClaim }],
        issuerDid: "did:ckb:hlvxrdt3e7iwvuxdmbvejp6hc4yoo3no",
        schemaId: "vellum.community.discord.v1",
        schemaHash: "0x3cba5b1c2967fee27bbde52d5e609137aa0d2cccaf68e1d8722e9b943e78f550",
        issuedAt: 1_799_500_000,
        account: {
          platform: "discord",
          id: userId,
          handle: "truthixify",
          profileUrl: `https://discord.com/users/${userId}`,
          createdAt: discordSnowflakeTimestamp(userId),
          verifiedAt: 1_799_500_000,
        },
        community: {
          memberships: [
            {
              guild_id: "1048098513321902120",
              community_name: "Nervos Nation",
              joined_at: 1_700_000_000,
              recognized_roles: [{ role_id: "1048098513321902121", role_name: "Builder" }],
            },
          ],
        },
        contributions: [
          { category: "community", points: 160, ruleId: "discord-ckb-membership-tenure.v2" },
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
      cache: "no-store",
      headers: { accept: "application/json" },
    });
  });

  test("accepts linked Discord identity and CKB community evidence", async () => {
    const fetch = mock(async () => Response.json(discordAvailableResponse()));
    const result = await fetchReputation(DID, fetch);

    expect(result).toMatchObject({
      status: "available",
      overall: { score: 360 },
      evidence: [
        { schemaId: "vellum.social.discord.v1" },
        {
          schemaId: "vellum.community.discord.v1",
          community: { memberships: [{ community_name: "Nervos Nation" }] },
        },
      ],
    });
  });

  test("rejects community evidence without its matching identity claim", async () => {
    const body = discordAvailableResponse();
    body.evidence[1].supportingClaims![0].outputIndex = 9;

    await expect(
      fetchReputation(
        DID,
        mock(async () => Response.json(body)),
      ),
    ).rejects.toMatchObject({ code: "invalid_response" });
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
          policyVersion: "vellum.reputation.v2",
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
        policyVersion: "vellum.reputation.v2",
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
