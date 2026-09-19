import { describe, expect, mock, test } from "bun:test";

import {
  GithubVerificationRequestError,
  fetchPublicIssuerMetadata,
  githubSubmissionFromSearch,
  parseGithubVerificationSearch,
  requestGithubAuthorization,
} from "./github-verification";

const DID = "did:ckb:fn7u37m7vwerr4ojysgdwwp4mescjtrp";
const TX_HASH = `0x${"11".repeat(32)}` as `0x${string}`;
const CLAIM_ID = `0x${"22".repeat(32)}` as `0x${string}`;
const STATE = "A".repeat(43);
const CODE_CHALLENGE = "C".repeat(43);
const NOW = 1_800_000_000;

describe("GitHub verification client contract", () => {
  test("accepts a complete public callback result and rejects untrusted values", () => {
    const valid = parseGithubVerificationSearch({
      status: "submitted",
      subject: DID,
      transaction: TX_HASH,
      claim: CLAIM_ID,
      output: "1",
      login: "truthixify",
    });
    expect(githubSubmissionFromSearch(valid)).toEqual({
      subject: DID,
      transactionHash: TX_HASH,
      claimId: CLAIM_ID,
      outputIndex: 1,
      login: "truthixify",
    });

    expect(
      parseGithubVerificationSearch({
        status: ["submitted"],
        subject: "not-a-did",
        transaction: "javascript:alert(1)",
        code: "made_up",
        retryAt: "-1",
      }),
    ).toEqual({
      status: undefined,
      subject: undefined,
      transaction: undefined,
      claim: undefined,
      output: undefined,
      login: undefined,
      code: undefined,
      retryAt: undefined,
    });
  });

  test("starts OAuth with the exact subject and accepts only GitHub authorization URLs", async () => {
    const fetch = mock(async (_input: string | URL | Request, _init?: RequestInit) =>
      Response.json({
        ok: true,
        version: "1",
        platform: "github",
        authorizationUrl: `https://github.com/login/oauth/authorize?state=${STATE}&code_challenge=${CODE_CHALLENGE}&code_challenge_method=S256`,
        expiresAt: NOW + 300,
      }),
    );

    await expect(requestGithubAuthorization(DID, fetch, () => NOW)).resolves.toContain(
      "https://github.com/login/oauth/authorize",
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toEqual({
      version: "1",
      subject: { did: DID },
    });

    const redirectingFetch = mock(async () =>
      Response.json({
        ok: true,
        version: "1",
        platform: "github",
        authorizationUrl: `https://example.com/login/oauth/authorize?state=${STATE}&code_challenge=${CODE_CHALLENGE}&code_challenge_method=S256`,
        expiresAt: NOW + 300,
      }),
    );
    await expect(
      requestGithubAuthorization(DID, redirectingFetch, () => NOW),
    ).rejects.toBeInstanceOf(GithubVerificationRequestError);

    const ambiguousFetch = mock(async () =>
      Response.json({
        ok: true,
        version: "1",
        platform: "github",
        authorizationUrl: `https://github.com/login/oauth/authorize?state=${STATE}&state=${STATE}&code_challenge=${CODE_CHALLENGE}&code_challenge_method=S256`,
        expiresAt: NOW + 300,
      }),
    );
    await expect(requestGithubAuthorization(DID, ambiguousFetch, () => NOW)).rejects.toBeInstanceOf(
      GithubVerificationRequestError,
    );
  });

  test("validates public issuer role metadata", async () => {
    const fetch = mock(async () =>
      Response.json({
        ok: true,
        version: "1",
        issuer: {
          did: DID,
          network: "ckb_testnet",
          payer: "issuer",
          submission: "service",
        },
      }),
    );

    await expect(fetchPublicIssuerMetadata(fetch)).resolves.toEqual({
      did: DID,
      network: "ckb_testnet",
      payer: "issuer",
      submission: "service",
    });
  });
});
