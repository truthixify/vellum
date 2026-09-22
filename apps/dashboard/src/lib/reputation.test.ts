import { describe, expect, mock, test } from "bun:test";
import { discordSnowflakeTimestamp } from "@vellum/schemas";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { fetchReputation, ReputationRequestError } from "./reputation";
import { GithubContributionArtifacts } from "../routes/reputation";

const DID = "did:ckb:fn7u37m7vwerr4ojysgdwwp4mescjtrp";

function availableResponse() {
  return {
    ok: true,
    version: "1",
    network: "ckb_testnet",
    subject: DID,
    status: "available",
    policyVersion: "vellum.reputation.v3",
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
          { category: "tenure", points: 100, ruleId: "github-account-tenure.v3" },
          { category: "recency", points: 100, ruleId: "github-verification-recency.v3" },
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
    policyVersion: "vellum.reputation.v3",
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
          { category: "tenure", points: 100, ruleId: "discord-account-tenure.v3" },
          { category: "recency", points: 100, ruleId: "discord-verification-recency.v3" },
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
          { category: "community", points: 160, ruleId: "discord-ckb-membership-tenure.v3" },
        ],
      },
    ],
    excludedEvidence: [],
  };
}

function githubContributionResponse() {
  const body = availableResponse();
  const identity = body.evidence[0];
  body.overall.score = 290;
  body.categories[0].score = 60;
  body.categories[1].score = 30;
  const contributionEvidence = {
    claim: {
      claimId: `0x${"6".repeat(64)}`,
      transactionHash: identity.claim.transactionHash,
      outputIndex: 1,
    },
    supportingClaims: [{ ...identity.claim }],
    issuerDid: identity.issuerDid,
    schemaId: "vellum.contribution.github.v1",
    schemaHash: "0xa08a1f034af0f1ebc75a6847dde6a90ee0c3dde63f3ffe4eaed248ea9e7730a1",
    issuedAt: identity.issuedAt,
    account: { ...identity.account },
    githubContributions: {
      registryVersion: "ckb.public-contributions.v1",
      windowStartedAt: identity.issuedAt - 365 * 86_400,
      eligibleArtifactCount: 1,
      artifacts: [
        {
          artifact_id: "PR_kwDOLw3gss7mJq5X",
          changed_files: 17,
          classification: "technical",
          kind: "merged_pull_request",
          merge_commit_sha: "f727991ef727991ef727991ef727991ef727991e",
          merged_at: identity.issuedAt - 100,
          number: 376,
          occurred_at: identity.issuedAt - 100,
          pull_request_id: "PR_kwDOLw3gss7mJq5X",
          repository: "ckb-devrel/ccc",
          repository_id: "R_kgDOLw3gsg",
          title: "Add did:ckb support",
          url: "https://github.com/ckb-devrel/ccc/pull/376",
          contributions: [
            { category: "technical", points: 60, ruleId: "github-merged-technical-pr.v3" },
            { category: "contribution", points: 30, ruleId: "github-merged-pr.v3" },
          ],
        },
      ],
    },
    contributions: [
      { category: "technical", points: 60, ruleId: "github-merged-technical-pr.v3" },
      { category: "contribution", points: 30, ruleId: "github-merged-pr.v3" },
    ],
  };
  return { ...body, evidence: [...body.evidence, contributionEvidence] };
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

  test("accepts traceable GitHub contribution artifacts", async () => {
    const result = await fetchReputation(
      DID,
      mock(async () => Response.json(githubContributionResponse())),
    );

    expect(result).toMatchObject({
      status: "available",
      overall: { score: 290 },
      evidence: [
        { schemaId: "vellum.social.github.v1" },
        {
          schemaId: "vellum.contribution.github.v1",
          githubContributions: {
            artifacts: [
              {
                repository: "ckb-devrel/ccc",
                number: 376,
                contributions: [
                  { category: "technical", points: 60 },
                  { category: "contribution", points: 30 },
                ],
              },
            ],
          },
        },
      ],
    });
  });

  test("accepts active contribution evidence linked to a newer GitHub identity claim", async () => {
    const body = githubContributionResponse();
    const identity = body.evidence[0];
    identity.issuedAt += 100;
    identity.account.verifiedAt += 100;

    const result = await fetchReputation(
      DID,
      mock(async () => Response.json(body)),
    );

    expect(result).toMatchObject({
      status: "available",
      evidence: [
        { schemaId: "vellum.social.github.v1", issuedAt: identity.issuedAt },
        { schemaId: "vellum.contribution.github.v1" },
      ],
    });
  });

  test("renders the repository, artifact, date, and awarded category points", async () => {
    const result = await fetchReputation(
      DID,
      mock(async () => Response.json(githubContributionResponse())),
    );
    if (result.status !== "available") throw new Error("Expected an available score");
    const evidence = result.evidence.find(
      (item) => item.schemaId === "vellum.contribution.github.v1",
    );
    if (!evidence || !("githubContributions" in evidence)) {
      throw new Error("Expected GitHub contribution evidence");
    }

    const markup = renderToStaticMarkup(createElement(GithubContributionArtifacts, { evidence }));

    expect(markup).toContain("ckb-devrel/ccc");
    expect(markup).toContain("PR #376");
    expect(markup).toContain("Add did:ckb support");
    expect(markup).toContain("+60 technical");
    expect(markup).toContain("+30 contribution");
    expect(markup).toContain("Accepted activity");
  });

  test("rejects GitHub contribution evidence with a broken account link or artifact total", async () => {
    const brokenLink = githubContributionResponse();
    const linkedEvidence = brokenLink.evidence[1];
    const supportingClaims = Reflect.get(linkedEvidence, "supportingClaims");
    if (!Array.isArray(supportingClaims)) throw new Error("Expected contribution evidence");
    (supportingClaims[0] as { outputIndex: number }).outputIndex = 9;
    const brokenTotal = githubContributionResponse();
    brokenTotal.evidence[1].contributions[0].points = 59;

    await expect(
      fetchReputation(
        DID,
        mock(async () => Response.json(brokenLink)),
      ),
    ).rejects.toMatchObject({ code: "invalid_response" });
    await expect(
      fetchReputation(
        DID,
        mock(async () => Response.json(brokenTotal)),
      ),
    ).rejects.toMatchObject({ code: "invalid_response" });
  });

  test("rejects GitHub artifact points assigned to the wrong policy rule", async () => {
    const body = githubContributionResponse();
    const evidence = body.evidence[1];
    const artifacts = Reflect.get(Reflect.get(evidence, "githubContributions"), "artifacts");
    if (!Array.isArray(artifacts)) throw new Error("Expected GitHub contribution artifacts");
    const contributions = Reflect.get(artifacts[0], "contributions");
    if (!Array.isArray(contributions)) throw new Error("Expected artifact contributions");
    contributions[0].ruleId = "github-technical-review.v3";
    evidence.contributions[0].ruleId = "github-technical-review.v3";

    await expect(
      fetchReputation(
        DID,
        mock(async () => Response.json(body)),
      ),
    ).rejects.toMatchObject({ code: "invalid_response" });
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
          policyVersion: "vellum.reputation.v3",
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
        policyVersion: "vellum.reputation.v3",
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
