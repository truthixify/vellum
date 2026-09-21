import { describe, expect, mock, test } from "bun:test";

import {
  DiscordVerificationRequestError,
  discordSubmissionFromSearch,
  parseDiscordVerificationSearch,
  requestDiscordAuthorization,
} from "./discord-verification";

const DID = "did:ckb:fn7u37m7vwerr4ojysgdwwp4mescjtrp";
const TX_HASH = `0x${"11".repeat(32)}` as `0x${string}`;
const CLAIM_ID = `0x${"22".repeat(32)}` as `0x${string}`;
const COMMUNITY_CLAIM_ID = `0x${"33".repeat(32)}` as `0x${string}`;
const STATE = "A".repeat(43);
const NOW = 1_800_000_000;

describe("Discord verification client contract", () => {
  test("accepts a complete public callback and binds community references to the count", () => {
    const valid = parseDiscordVerificationSearch({
      status: "submitted",
      subject: DID,
      transaction: TX_HASH,
      claim: CLAIM_ID,
      output: "1",
      communityClaim: COMMUNITY_CLAIM_ID,
      communityOutput: "2",
      username: "truthixify",
      communities: "1",
    });
    expect(discordSubmissionFromSearch(valid)).toEqual({
      subject: DID,
      transactionHash: TX_HASH,
      claimId: CLAIM_ID,
      outputIndex: 1,
      communityClaimId: COMMUNITY_CLAIM_ID,
      communityOutputIndex: 2,
      username: "truthixify",
      communityCount: 1,
    });

    expect(discordSubmissionFromSearch({ ...valid, communityClaim: undefined })).toBeUndefined();
    expect(discordSubmissionFromSearch({ ...valid, communities: 0 })).toBeUndefined();
  });

  test("rejects untrusted callback values", () => {
    expect(
      parseDiscordVerificationSearch({
        status: ["submitted"],
        subject: "not-a-did",
        transaction: "javascript:alert(1)",
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
      username: undefined,
      communities: undefined,
      code: undefined,
      retryAt: undefined,
    });
  });

  test("starts OAuth for the exact DID and accepts only Discord's scoped authorization URL", async () => {
    const authorizationUrl = new URL("https://discord.com/oauth2/authorize");
    authorizationUrl.searchParams.set("response_type", "code");
    authorizationUrl.searchParams.set("client_id", "123456789012345678");
    authorizationUrl.searchParams.set(
      "redirect_uri",
      "https://dashboard.usevellum.xyz/api/verify/discord/callback",
    );
    authorizationUrl.searchParams.set("scope", "guilds.members.read identify");
    authorizationUrl.searchParams.set("state", STATE);
    const fetch = mock(async (_input: string | URL | Request, _init?: RequestInit) =>
      Response.json({
        ok: true,
        version: "1",
        platform: "discord",
        authorizationUrl: authorizationUrl.toString(),
        expiresAt: NOW + 300,
      }),
    );

    await expect(requestDiscordAuthorization(DID, fetch, () => NOW)).resolves.toContain(
      "https://discord.com/oauth2/authorize",
    );
    expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toEqual({
      version: "1",
      subject: { did: DID },
    });

    authorizationUrl.hostname = "example.com";
    const redirectingFetch = mock(async (_input: string | URL | Request, _init?: RequestInit) =>
      Response.json({
        ok: true,
        version: "1",
        platform: "discord",
        authorizationUrl: authorizationUrl.toString(),
        expiresAt: NOW + 300,
      }),
    );
    await expect(
      requestDiscordAuthorization(DID, redirectingFetch, () => NOW),
    ).rejects.toBeInstanceOf(DiscordVerificationRequestError);
  });
});
