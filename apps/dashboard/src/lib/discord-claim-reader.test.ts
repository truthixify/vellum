import { describe, expect, test } from "bun:test";
import { DISCORD_CLAIM_SCHEMA_HASH, DISCORD_COMMUNITY_CLAIM_SCHEMA_HASH } from "@vellum/schemas";
import type { Claim, ReadClaimsResult } from "@vellum/sdk";

import {
  discordAccountClaimsFromRead,
  discordClaimConfirmationFromRead,
} from "./discord-claim-reader";
import type { DiscordSubmission } from "./discord-verification";

const NOW = 1_800_000_000;
const TRANSACTION_HASH = `0x${"11".repeat(32)}` as `0x${string}`;
const submission: DiscordSubmission = {
  subject: "did:ckb:fn7u37m7vwerr4ojysgdwwp4mescjtrp",
  transactionHash: TRANSACTION_HASH,
  claimId: `0x${"22".repeat(32)}`,
  outputIndex: 1,
  communityClaimId: `0x${"33".repeat(32)}`,
  communityOutputIndex: 2,
  username: "truthixify",
  communityCount: 1,
};
const account = {
  user_id: "80351110224678912",
  username: "truthixify",
  profile_url: "https://discord.com/users/80351110224678912",
  account_created_at: 1_439_227_597,
  verified_at: NOW,
};
const community = {
  user_id: account.user_id,
  verified_at: NOW,
  memberships: [
    {
      guild_id: "111111111111111111",
      community_name: "Nervos Community",
      joined_at: 1_700_000_000,
      recognized_roles: [{ role_id: "222222222222222222", role_name: "Builder" }],
    },
  ],
};

function claim(kind: "identity" | "community", overrides: Partial<Claim> = {}): Claim {
  const isCommunity = kind === "community";
  return {
    claimId: isCommunity ? submission.communityClaimId : submission.claimId,
    schemaHash: isCommunity ? DISCORD_COMMUNITY_CLAIM_SCHEMA_HASH : DISCORD_CLAIM_SCHEMA_HASH,
    cell: {
      outPoint: {
        txHash: submission.transactionHash,
        index: BigInt(isCommunity ? submission.communityOutputIndex! : submission.outputIndex),
      },
    },
    issuerState: { status: "active" },
    issuedAt: BigInt(NOW),
    expiresAt: isCommunity ? BigInt(NOW + 30 * 86_400) : undefined,
    payload: isCommunity ? community : account,
    verification: {
      inclusion: "live",
      issuerAuthorization: "accepted-by-configured-claim-type",
      time: { status: "active", evaluatedAt: BigInt(NOW + 1) },
    },
    ...overrides,
  } as Claim;
}

function readResult(claims: Claim[] = [claim("identity"), claim("community")]): ReadClaimsResult {
  return { claims, invalid: [] };
}

describe("Discord Claim Cell confirmation", () => {
  test("confirms both exact claim outputs from the submitted transaction", () => {
    expect(discordClaimConfirmationFromRead(readResult(), submission, 500n)).toEqual({
      state: "confirmed",
      blockNumber: 500n,
      account,
      community,
    });
  });

  test("waits until both submitted outputs are indexed", () => {
    expect(discordClaimConfirmationFromRead(readResult([claim("identity")]), submission)).toEqual({
      state: "indexing",
      blockNumber: undefined,
    });
    expect(
      discordClaimConfirmationFromRead(
        readResult([
          claim("identity"),
          claim("community", { issuerState: { status: "unavailable", reason: "indexing" } }),
        ]),
        submission,
      ),
    ).toEqual({ state: "indexing", blockNumber: undefined });
  });

  test("rejects mismatched community evidence", () => {
    expect(() =>
      discordClaimConfirmationFromRead(
        readResult([
          claim("identity"),
          claim("community", {
            payload: { ...community, user_id: "90351110224678912" },
          }),
        ]),
        submission,
      ),
    ).toThrow("does not match the callback result");
  });

  test("requires the submitted Discord schemas and one verification time", () => {
    expect(() =>
      discordClaimConfirmationFromRead(
        readResult([
          claim("identity", { schemaHash: DISCORD_COMMUNITY_CLAIM_SCHEMA_HASH }),
          claim("community"),
        ]),
        submission,
      ),
    ).toThrow("does not match the callback result");

    expect(() =>
      discordClaimConfirmationFromRead(
        readResult([
          claim("identity"),
          claim("community", {
            issuedAt: BigInt(NOW + 1),
            expiresAt: BigInt(NOW + 1 + 30 * 86_400),
            payload: { ...community, verified_at: NOW + 1 },
          }),
        ]),
        submission,
      ),
    ).toThrow("does not match the callback result");
  });
});

describe("Discord account claim discovery", () => {
  test("pairs the newest active identity with current community evidence", () => {
    expect(discordAccountClaimsFromRead(readResult())).toEqual([
      {
        account,
        claimId: submission.claimId,
        issuedAt: BigInt(NOW),
        transactionHash: submission.transactionHash,
        outputIndex: 1n,
        community: {
          community,
          claimId: submission.communityClaimId!,
          issuedAt: BigInt(NOW),
          expiresAt: BigInt(NOW + 30 * 86_400),
          transactionHash: submission.transactionHash,
          outputIndex: 2n,
        },
      },
    ]);
  });

  test("does not attach expired community evidence to an active identity", () => {
    const expired = claim("community", {
      verification: {
        inclusion: "live",
        issuerAuthorization: "accepted-by-configured-claim-type",
        time: { status: "expired", evaluatedAt: BigInt(NOW + 31 * 86_400) },
      },
    });
    expect(
      discordAccountClaimsFromRead(readResult([claim("identity"), expired]))[0].community,
    ).toBe(undefined);
  });

  test("rejects community evidence without the required thirty-day lifetime", () => {
    expect(() =>
      discordAccountClaimsFromRead(
        readResult([
          claim("identity"),
          claim("community", { expiresAt: BigInt(NOW + 29 * 86_400) }),
        ]),
      ),
    ).toThrow("does not match its envelope");
  });

  test("keeps unresolved relevant evidence from appearing disconnected", () => {
    expect(() =>
      discordAccountClaimsFromRead(
        readResult([
          claim("identity", { issuerState: { status: "unavailable", reason: "indexing" } }),
        ]),
      ),
    ).toThrow("temporarily unavailable");
  });
});
