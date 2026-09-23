import { describe, expect, mock, test } from "bun:test";
import { ccc } from "@ckb-ccc/core";

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
const CONTRIBUTION_CLAIM_ID = `0x${"44".repeat(32)}` as `0x${string}`;
const STATE = "A".repeat(43);
const CODE_CHALLENGE = "C".repeat(43);
const NOW = 1_800_000_000;
const SIGNATURE = new ccc.Signature(
  "signed-message",
  `0x${"33".repeat(33)}`,
  ccc.SignerSignType.CkbSecp256k1,
);
const SIGNER = { signMessage: mock(async () => SIGNATURE) };

describe("GitHub verification client contract", () => {
  test("accepts a complete public callback result and rejects untrusted values", () => {
    const valid = parseGithubVerificationSearch({
      status: "submitted",
      subject: DID,
      transaction: TX_HASH,
      claim: CLAIM_ID,
      output: "1",
      contributionClaim: CONTRIBUTION_CLAIM_ID,
      contributionOutput: "2",
      login: "truthixify",
    });
    expect(githubSubmissionFromSearch(valid)).toEqual({
      subject: DID,
      transactionHash: TX_HASH,
      claimId: CLAIM_ID,
      outputIndex: 1,
      login: "truthixify",
      contribution: {
        claimId: CONTRIBUTION_CLAIM_ID,
        outputIndex: 2,
      },
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
      contributionClaim: undefined,
      contributionOutput: undefined,
      login: undefined,
      code: undefined,
      retryAt: undefined,
    });
  });

  test("keeps identity-only results valid and rejects partial contribution references", () => {
    const identityOnly = parseGithubVerificationSearch({
      status: "submitted",
      subject: DID,
      transaction: TX_HASH,
      claim: CLAIM_ID,
      output: "1",
      login: "truthixify",
    });
    expect(githubSubmissionFromSearch(identityOnly)).toEqual({
      subject: DID,
      transactionHash: TX_HASH,
      claimId: CLAIM_ID,
      outputIndex: 1,
      login: "truthixify",
    });

    expect(
      githubSubmissionFromSearch({
        ...identityOnly,
        contributionClaim: CONTRIBUTION_CLAIM_ID,
      }),
    ).toBeUndefined();
    expect(
      githubSubmissionFromSearch({
        ...identityOnly,
        contributionOutput: 2,
      }),
    ).toBeUndefined();
    expect(
      githubSubmissionFromSearch({
        ...identityOnly,
        contributionClaim: CLAIM_ID,
        contributionOutput: 2,
      }),
    ).toBeUndefined();
    expect(
      githubSubmissionFromSearch({
        ...identityOnly,
        contributionClaim: CONTRIBUTION_CLAIM_ID,
        contributionOutput: 1,
      }),
    ).toBeUndefined();
  });

  test("starts OAuth with the exact subject and accepts only GitHub authorization URLs", async () => {
    const fetch = mock(async (input: string | URL | Request, _init?: RequestInit) =>
      Response.json(
        String(input).endsWith("/challenge")
          ? {
              ok: true,
              version: "1",
              platform: "github",
              challenge: "signed-challenge",
              message: "Vellum account verification",
              expiresAt: NOW + 300,
            }
          : {
              ok: true,
              version: "1",
              platform: "github",
              authorizationUrl: `https://github.com/login/oauth/authorize?state=${STATE}&code_challenge=${CODE_CHALLENGE}&code_challenge_method=S256`,
              expiresAt: NOW + 300,
            },
      ),
    );

    await expect(requestGithubAuthorization(DID, SIGNER, fetch, () => NOW)).resolves.toContain(
      "https://github.com/login/oauth/authorize",
    );
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetch.mock.calls[1][1]?.body))).toEqual({
      version: "1",
      subject: { did: DID },
      proof: { challenge: "signed-challenge", signature: SIGNATURE },
    });

    let redirectCall = 0;
    const redirectingFetch = mock(async () =>
      Response.json(
        redirectCall++ === 0
          ? {
              ok: true,
              version: "1",
              platform: "github",
              challenge: "signed-challenge",
              message: "Vellum account verification",
              expiresAt: NOW + 300,
            }
          : {
              ok: true,
              version: "1",
              platform: "github",
              authorizationUrl: `https://example.com/login/oauth/authorize?state=${STATE}&code_challenge=${CODE_CHALLENGE}&code_challenge_method=S256`,
              expiresAt: NOW + 300,
            },
      ),
    );
    await expect(
      requestGithubAuthorization(DID, SIGNER, redirectingFetch, () => NOW),
    ).rejects.toBeInstanceOf(GithubVerificationRequestError);

    let ambiguousCall = 0;
    const ambiguousFetch = mock(async () =>
      Response.json(
        ambiguousCall++ === 0
          ? {
              ok: true,
              version: "1",
              platform: "github",
              challenge: "signed-challenge",
              message: "Vellum account verification",
              expiresAt: NOW + 300,
            }
          : {
              ok: true,
              version: "1",
              platform: "github",
              authorizationUrl: `https://github.com/login/oauth/authorize?state=${STATE}&state=${STATE}&code_challenge=${CODE_CHALLENGE}&code_challenge_method=S256`,
              expiresAt: NOW + 300,
            },
      ),
    );
    await expect(
      requestGithubAuthorization(DID, SIGNER, ambiguousFetch, () => NOW),
    ).rejects.toBeInstanceOf(GithubVerificationRequestError);
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
