import { describe, expect, mock, test } from "bun:test";
import { ccc } from "@ckb-ccc/core";

import {
  BlueskyVerificationRequestError,
  blueskySubmissionFromSearch,
  blueskySubmissionSearch,
  fetchBlueskyFormSpec,
  parseBlueskyVerificationSearch,
  submitBlueskyVerification,
} from "./bluesky-verification";

const SUBJECT_DID = "did:ckb:fn7u37m7vwerr4ojysgdwwp4mescjtrp";
const ACCOUNT_DID = "did:plc:ewvi7nxzyoun6zhxrhs64oiz";
const HANDLE = "builder.bsky.social";
const APP_PASSWORD = "abcd-efgh-ijkl-mnop";
const TX_HASH = `0x${"11".repeat(32)}` as ccc.Hex;
const CLAIM_ID = `0x${"22".repeat(32)}` as ccc.Hex;
const NOW = 1_800_000_000;
const SIGNATURE = new ccc.Signature(
  "signed-message",
  `0x${"33".repeat(33)}`,
  ccc.SignerSignType.CkbSecp256k1,
);

function successResponse() {
  return {
    ok: true,
    version: "1",
    platform: "bluesky",
    subject: { did: SUBJECT_DID },
    account: {
      did: ACCOUNT_DID,
      handle: HANDLE,
      profileUrl: `https://bsky.app/profile/${ACCOUNT_DID}`,
    },
    claim: {
      schema: {
        id: "vellum.social.bluesky.v1",
        hash: "0x60bfe9263501d3d17513463b9a3163793690dcf2b614ecc17d7dd52688a083f6",
      },
      payload: {
        did: ACCOUNT_DID,
        handle: HANDLE,
        profile_url: `https://bsky.app/profile/${ACCOUNT_DID}`,
        verified_at: NOW,
      },
      issuedAt: NOW,
    },
    issuance: {
      status: "submitted",
      network: "ckb_testnet",
      payer: "issuer",
      transactionHash: TX_HASH,
      claimId: CLAIM_ID,
      outputIndex: 1,
    },
  };
}

describe("Bluesky verification client", () => {
  test("parses only complete public submission state", () => {
    const parsed = parseBlueskyVerificationSearch({
      status: "submitted",
      subject: SUBJECT_DID,
      transaction: TX_HASH,
      claim: CLAIM_ID,
      output: "1",
      accountDid: ACCOUNT_DID,
      handle: HANDLE,
    });
    const submission = blueskySubmissionFromSearch(parsed);
    expect(submission).toEqual({
      subject: SUBJECT_DID,
      transactionHash: TX_HASH,
      claimId: CLAIM_ID,
      outputIndex: 1,
      accountDid: ACCOUNT_DID,
      handle: HANDLE,
    });
    expect(blueskySubmissionSearch(submission!)).toEqual({
      status: "submitted",
      subject: SUBJECT_DID,
      transaction: TX_HASH,
      claim: CLAIM_ID,
      output: 1,
      accountDid: ACCOUNT_DID,
      handle: HANDLE,
    });
    expect(
      blueskySubmissionFromSearch(
        parseBlueskyVerificationSearch({ ...parsed, accountDid: "did:key:invalid" }),
      ),
    ).toBeUndefined();
  });

  test("loads only the expected app-password form contract", async () => {
    const fetch = mock(async () =>
      Response.json({
        ok: true,
        version: "1",
        platform: "bluesky",
        fields: [
          {
            name: "handle",
            type: "text",
            label: "Bluesky handle",
            autoComplete: "username",
            required: true,
            maximumLength: 253,
          },
          {
            name: "appPassword",
            type: "password",
            label: "App password",
            autoComplete: "off",
            required: true,
            minimumLength: 19,
            maximumLength: 19,
          },
        ],
        appPasswordUrl: "https://bsky.app/settings/app-passwords",
      }),
    );
    await expect(fetchBlueskyFormSpec(fetch)).resolves.toEqual({
      appPasswordUrl: "https://bsky.app/settings/app-passwords",
    });

    const malformed = mock(async () =>
      Response.json({
        ok: true,
        version: "1",
        platform: "bluesky",
        fields: [{ name: "handle" }, { name: "appPassword" }],
        appPasswordUrl: "https://bsky.app/settings/app-passwords",
      }),
    );
    await expect(fetchBlueskyFormSpec(malformed)).rejects.toBeInstanceOf(
      BlueskyVerificationRequestError,
    );
  });

  test("signs the wallet challenge and accepts a strict public issuance result", async () => {
    const fetch = mock(async (input: string | URL | Request, _init?: RequestInit) =>
      Response.json(
        String(input).endsWith("/challenge")
          ? {
              ok: true,
              version: "1",
              platform: "bluesky",
              challenge: "signed-challenge",
              message: "Vellum account verification",
              expiresAt: NOW + 300,
            }
          : successResponse(),
        { status: String(input).endsWith("/challenge") ? 200 : 201 },
      ),
    );
    const signer = { signMessage: mock(async () => SIGNATURE) };
    await expect(
      submitBlueskyVerification(
        SUBJECT_DID,
        { handle: `@${HANDLE.toUpperCase()}`, appPassword: APP_PASSWORD },
        signer,
        fetch,
        () => NOW,
      ),
    ).resolves.toEqual({
      subject: SUBJECT_DID,
      transactionHash: TX_HASH,
      claimId: CLAIM_ID,
      outputIndex: 1,
      accountDid: ACCOUNT_DID,
      handle: HANDLE,
    });
    expect(signer.signMessage).toHaveBeenCalledWith("Vellum account verification");
    const submitted = JSON.parse(String(fetch.mock.calls[1][1]?.body));
    expect(submitted).toMatchObject({
      subject: { did: SUBJECT_DID },
      handle: HANDLE,
      appPassword: APP_PASSWORD,
      proof: { challenge: "signed-challenge", signature: SIGNATURE },
    });
  });

  test("preserves safe error codes and rejects malformed success data", async () => {
    let call = 0;
    const rejected = mock(async () => {
      call += 1;
      return call === 1
        ? Response.json({
            ok: true,
            version: "1",
            platform: "bluesky",
            challenge: "signed-challenge",
            message: "Vellum account verification",
            expiresAt: NOW + 300,
          })
        : Response.json(
            {
              ok: false,
              version: "1",
              error: { code: "provider_rate_limited", retryAt: NOW + 60 },
            },
            { status: 429 },
          );
    });
    await expect(
      submitBlueskyVerification(
        SUBJECT_DID,
        { handle: HANDLE, appPassword: APP_PASSWORD },
        { signMessage: async () => SIGNATURE },
        rejected,
        () => NOW,
      ),
    ).rejects.toMatchObject({ code: "provider_rate_limited", retryAt: NOW + 60 });

    let malformedCall = 0;
    const malformed = mock(async () => {
      malformedCall += 1;
      return Response.json(
        malformedCall === 1
          ? {
              ok: true,
              version: "1",
              platform: "bluesky",
              challenge: "signed-challenge",
              message: "Vellum account verification",
              expiresAt: NOW + 300,
            }
          : {
              ...successResponse(),
              account: { ...successResponse().account, did: "did:web:wrong" },
            },
        { status: malformedCall === 1 ? 200 : 201 },
      );
    });
    await expect(
      submitBlueskyVerification(
        SUBJECT_DID,
        { handle: HANDLE, appPassword: APP_PASSWORD },
        { signMessage: async () => SIGNATURE },
        malformed,
        () => NOW,
      ),
    ).rejects.toBeInstanceOf(BlueskyVerificationRequestError);
  });
});
