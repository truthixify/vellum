import { describe, expect, test } from "bun:test";
import { TELEGRAM_CLAIM_SCHEMA_HASH, TELEGRAM_COMMUNITY_CLAIM_SCHEMA_HASH } from "@vellum/schemas";
import type { Claim, ReadClaimsResult } from "@usevellum/sdk";

import {
  telegramAccountClaimsFromRead,
  telegramClaimConfirmationFromRead,
} from "./telegram-claim-reader";
import type { TelegramSubmission } from "./telegram-verification";

const NOW = 1_800_000_000;
const TRANSACTION_HASH = `0x${"11".repeat(32)}` as `0x${string}`;
const submission: TelegramSubmission = {
  subject: "did:ckb:fn7u37m7vwerr4ojysgdwwp4mescjtrp",
  transactionHash: TRANSACTION_HASH,
  claimId: `0x${"22".repeat(32)}`,
  outputIndex: 1,
  communityClaimId: `0x${"33".repeat(32)}`,
  communityOutputIndex: 2,
  communityCount: 1,
  accountId: "1234123412341234123",
  displayName: "Vellum Builder",
  username: "vellum_builder",
};
const account = {
  user_id: submission.accountId,
  display_name: submission.displayName,
  username: submission.username!,
  profile_url: `https://t.me/${submission.username}`,
  verified_at: NOW,
};
const community = {
  user_id: account.user_id,
  verified_at: NOW,
  memberships: [
    {
      chat_id: "-1006577996900705",
      community_name: "Nervos Network",
      community_type: "supergroup" as const,
      member_role: "member" as const,
    },
  ],
};

function claim(kind: "identity" | "community", overrides: Partial<Claim> = {}): Claim {
  const isCommunity = kind === "community";
  return {
    claimId: isCommunity ? submission.communityClaimId : submission.claimId,
    schemaHash: isCommunity ? TELEGRAM_COMMUNITY_CLAIM_SCHEMA_HASH : TELEGRAM_CLAIM_SCHEMA_HASH,
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

describe("Telegram Claim Cell confirmation", () => {
  test("confirms both exact claim outputs from the submitted transaction", () => {
    expect(telegramClaimConfirmationFromRead(readResult(), submission, 500n)).toEqual({
      state: "confirmed",
      blockNumber: 500n,
      account,
      community,
    });
  });

  test("waits until both submitted outputs are indexed", () => {
    expect(telegramClaimConfirmationFromRead(readResult([claim("identity")]), submission)).toEqual({
      state: "indexing",
      blockNumber: undefined,
    });
    expect(
      telegramClaimConfirmationFromRead(
        readResult([
          claim("identity"),
          claim("community", { issuerState: { status: "unavailable", reason: "indexing" } }),
        ]),
        submission,
      ),
    ).toEqual({ state: "indexing", blockNumber: undefined });
  });

  test("rejects mismatched community evidence and lifetimes", () => {
    expect(() =>
      telegramClaimConfirmationFromRead(
        readResult([
          claim("identity"),
          claim("community", {
            payload: { ...community, user_id: "1234123412341234124" },
          }),
        ]),
        submission,
      ),
    ).toThrow("does not match the callback result");
    expect(() =>
      telegramClaimConfirmationFromRead(
        readResult([
          claim("identity"),
          claim("community", { expiresAt: BigInt(NOW + 29 * 86_400) }),
        ]),
        submission,
      ),
    ).toThrow("does not match the callback result");
  });
});

describe("Telegram account claim discovery", () => {
  test("pairs the newest active identity with current community evidence", () => {
    expect(telegramAccountClaimsFromRead(readResult())).toEqual([
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
      telegramAccountClaimsFromRead(readResult([claim("identity"), expired]))[0].community,
    ).toBeUndefined();
  });

  test("keeps unresolved relevant evidence from appearing disconnected", () => {
    expect(() =>
      telegramAccountClaimsFromRead(
        readResult([
          claim("identity", { issuerState: { status: "unavailable", reason: "indexing" } }),
        ]),
      ),
    ).toThrow("temporarily unavailable");
  });
});
