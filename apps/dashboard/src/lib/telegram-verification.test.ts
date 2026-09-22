import { describe, expect, mock, test } from "bun:test";
import { ccc } from "@ckb-ccc/core";

import {
  TelegramVerificationRequestError,
  parseTelegramVerificationSearch,
  requestTelegramAuthorization,
  telegramSubmissionFromSearch,
} from "./telegram-verification";

const DID = "did:ckb:fn7u37m7vwerr4ojysgdwwp4mescjtrp";
const TX_HASH = `0x${"11".repeat(32)}` as `0x${string}`;
const CLAIM_ID = `0x${"22".repeat(32)}` as `0x${string}`;
const COMMUNITY_CLAIM_ID = `0x${"33".repeat(32)}` as `0x${string}`;
const STATE = "A".repeat(43);
const CHALLENGE = "B".repeat(43);
const NOW = 1_800_000_000;
const SIGNATURE = new ccc.Signature(
  "signed-message",
  `0x${"33".repeat(33)}`,
  ccc.SignerSignType.CkbSecp256k1,
);
const SIGNER = { signMessage: mock(async () => SIGNATURE) };

describe("Telegram verification client contract", () => {
  test("accepts a complete callback and binds community references to the count", () => {
    const valid = parseTelegramVerificationSearch({
      status: "submitted",
      subject: DID,
      transaction: TX_HASH,
      claim: CLAIM_ID,
      output: "1",
      communityClaim: COMMUNITY_CLAIM_ID,
      communityOutput: "2",
      communities: "1",
      account: "1234123412341234123",
      name: "Vellum Builder",
      username: "vellum_builder",
    });
    expect(telegramSubmissionFromSearch(valid)).toEqual({
      subject: DID,
      transactionHash: TX_HASH,
      claimId: CLAIM_ID,
      outputIndex: 1,
      communityClaimId: COMMUNITY_CLAIM_ID,
      communityOutputIndex: 2,
      communityCount: 1,
      accountId: "1234123412341234123",
      displayName: "Vellum Builder",
      username: "vellum_builder",
    });

    expect(telegramSubmissionFromSearch({ ...valid, communityClaim: undefined })).toBeUndefined();
    expect(telegramSubmissionFromSearch({ ...valid, communities: 0 })).toBeUndefined();
  });

  test("accepts a private account callback without community evidence", () => {
    const valid = parseTelegramVerificationSearch({
      status: "submitted",
      subject: DID,
      transaction: TX_HASH,
      claim: CLAIM_ID,
      output: "1",
      communities: "0",
      account: "1234123412341234123",
      name: "Private Builder",
    });

    expect(telegramSubmissionFromSearch(valid)).toMatchObject({
      displayName: "Private Builder",
      username: undefined,
      communityCount: 0,
    });
  });

  test("rejects untrusted callback values", () => {
    expect(
      parseTelegramVerificationSearch({
        status: ["submitted"],
        subject: "not-a-did",
        transaction: "javascript:alert(1)",
        account: "0",
        name: " Builder ",
        username: "bad name",
        communities: "17",
        code: "made_up",
        retryAt: "-1",
      }),
    ).toEqual({
      status: undefined,
      subject: undefined,
      transaction: undefined,
      claim: undefined,
      output: undefined,
      communityClaim: undefined,
      communityOutput: undefined,
      communities: undefined,
      account: undefined,
      name: undefined,
      username: undefined,
      code: undefined,
      retryAt: undefined,
    });
  });

  test("starts OAuth for the exact DID and accepts only Telegram OIDC with PKCE", async () => {
    const authorizationUrl = new URL("https://oauth.telegram.org/auth");
    authorizationUrl.searchParams.set("response_type", "code");
    authorizationUrl.searchParams.set("client_id", "123456789012345678");
    authorizationUrl.searchParams.set(
      "redirect_uri",
      "https://dashboard.usevellum.xyz/api/verify/telegram/callback",
    );
    authorizationUrl.searchParams.set("scope", "openid profile");
    authorizationUrl.searchParams.set("state", STATE);
    authorizationUrl.searchParams.set("code_challenge", CHALLENGE);
    authorizationUrl.searchParams.set("code_challenge_method", "S256");
    const fetch = mock(async (input: string | URL | Request, _init?: RequestInit) =>
      Response.json(
        String(input).endsWith("/challenge")
          ? {
              ok: true,
              version: "1",
              platform: "telegram",
              challenge: "signed-challenge",
              message: "Vellum account verification",
              expiresAt: NOW + 300,
            }
          : {
              ok: true,
              version: "1",
              platform: "telegram",
              authorizationUrl: authorizationUrl.toString(),
              expiresAt: NOW + 300,
            },
      ),
    );

    await expect(requestTelegramAuthorization(DID, SIGNER, fetch, () => NOW)).resolves.toContain(
      "https://oauth.telegram.org/auth",
    );
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetch.mock.calls[1][1]?.body))).toEqual({
      version: "1",
      subject: { did: DID },
      proof: { challenge: "signed-challenge", signature: SIGNATURE },
    });

    authorizationUrl.hostname = "example.com";
    let call = 0;
    const redirectingFetch = mock(async () =>
      Response.json(
        call++ === 0
          ? {
              ok: true,
              version: "1",
              platform: "telegram",
              challenge: "signed-challenge",
              message: "Vellum account verification",
              expiresAt: NOW + 300,
            }
          : {
              ok: true,
              version: "1",
              platform: "telegram",
              authorizationUrl: authorizationUrl.toString(),
              expiresAt: NOW + 300,
            },
      ),
    );
    await expect(
      requestTelegramAuthorization(DID, SIGNER, redirectingFetch, () => NOW),
    ).rejects.toBeInstanceOf(TelegramVerificationRequestError);
  });
});
