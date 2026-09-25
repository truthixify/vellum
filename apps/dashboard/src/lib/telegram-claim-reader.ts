import { ccc } from "@ckb-ccc/core";
import {
  TELEGRAM_CLAIM_SCHEMA_HASH,
  TELEGRAM_COMMUNITY_CLAIM_SCHEMA_HASH,
  TELEGRAM_COMMUNITY_CLAIM_TTL_SECONDS,
  parseTelegramClaimPayload,
  parseTelegramCommunityClaimPayload,
  type TelegramClaimPayload,
  type TelegramCommunityClaimPayload,
} from "@vellum/schemas";
import { readClaims, type Claim, type ReadClaimsResult } from "@usevellum/sdk";

import { dashboardClaimScripts } from "./claim-scripts";
import type { TelegramSubmission } from "./telegram-verification";
import type { PublicIssuerMetadata } from "./verification-issuer";

type ClaimReference = {
  claimId: ccc.Hex;
  issuedAt: ccc.Num;
  transactionHash: ccc.Hex;
  outputIndex: ccc.Num;
};

const COMMUNITY_CLAIM_TTL_SECONDS = BigInt(TELEGRAM_COMMUNITY_CLAIM_TTL_SECONDS);

export type TelegramCommunityClaim = ClaimReference & {
  community: TelegramCommunityClaimPayload;
  expiresAt: ccc.Num;
};

export type TelegramAccountClaim = ClaimReference & {
  account: TelegramClaimPayload;
  community?: TelegramCommunityClaim;
};

export type TelegramClaimConfirmation =
  | { state: "pending" }
  | { state: "indexing"; blockNumber?: bigint }
  | { state: "rejected" }
  | {
      state: "confirmed";
      blockNumber?: bigint;
      account: TelegramClaimPayload;
      community?: TelegramCommunityClaimPayload;
    };

function isActive(claim: Claim): boolean {
  return claim.issuerState.status === "active" && claim.verification.time.status === "active";
}

function reference(claim: Claim): ClaimReference {
  return {
    claimId: claim.claimId,
    issuedAt: claim.issuedAt,
    transactionHash: claim.cell.outPoint.txHash,
    outputIndex: claim.cell.outPoint.index,
  };
}

function newestFirst(left: ClaimReference, right: ClaimReference): number {
  if (left.issuedAt !== right.issuedAt) return left.issuedAt > right.issuedAt ? -1 : 1;
  return left.claimId < right.claimId ? -1 : left.claimId > right.claimId ? 1 : 0;
}

function relevantStatusUnavailable(result: ReadClaimsResult): boolean {
  return result.claims.some(
    (claim) =>
      (claim.schemaHash === TELEGRAM_CLAIM_SCHEMA_HASH ||
        claim.schemaHash === TELEGRAM_COMMUNITY_CLAIM_SCHEMA_HASH) &&
      (claim.issuerState.status === "unavailable" ||
        claim.verification.time.status === "not-yet-active"),
  );
}

export function telegramAccountClaimsFromRead(result: ReadClaimsResult): TelegramAccountClaim[] {
  const communities = result.claims
    .filter((claim) => claim.schemaHash === TELEGRAM_COMMUNITY_CLAIM_SCHEMA_HASH && isActive(claim))
    .map((claim): TelegramCommunityClaim => {
      const community = parseTelegramCommunityClaimPayload(claim.payload);
      if (
        BigInt(community.verified_at) !== claim.issuedAt ||
        claim.expiresAt !== claim.issuedAt + COMMUNITY_CLAIM_TTL_SECONDS
      ) {
        throw new Error("The indexed Telegram community claim does not match its envelope");
      }
      return { ...reference(claim), expiresAt: claim.expiresAt, community };
    })
    .sort(newestFirst);
  const newestCommunityByUser = new Map<string, TelegramCommunityClaim>();
  for (const community of communities) {
    if (!newestCommunityByUser.has(community.community.user_id)) {
      newestCommunityByUser.set(community.community.user_id, community);
    }
  }

  const identities = result.claims
    .filter((claim) => claim.schemaHash === TELEGRAM_CLAIM_SCHEMA_HASH && isActive(claim))
    .map((claim): TelegramAccountClaim => {
      const account = parseTelegramClaimPayload(claim.payload);
      if (BigInt(account.verified_at) !== claim.issuedAt) {
        throw new Error("The indexed Telegram claim does not match its issuance time");
      }
      return {
        ...reference(claim),
        account,
        community: newestCommunityByUser.get(account.user_id),
      };
    })
    .sort(newestFirst);

  const accounts = new Set<string>();
  const deduplicated = identities.filter((claim) => {
    if (accounts.has(claim.account.user_id)) return false;
    accounts.add(claim.account.user_id);
    return true;
  });
  if (deduplicated.length > 0) return deduplicated;
  if (relevantStatusUnavailable(result)) {
    throw new Error("Telegram claim status is temporarily unavailable");
  }
  return [];
}

export async function readTelegramAccountClaims(
  client: ccc.Client,
  subjectDid: string,
  issuer: PublicIssuerMetadata,
  now: () => number = () => Math.floor(Date.now() / 1_000),
): Promise<TelegramAccountClaim[]> {
  const result = await readClaims({
    client,
    scripts: dashboardClaimScripts,
    filter: {
      subject: { did: subjectDid },
      issuerDid: issuer.did,
      evaluationTime: now(),
      order: "desc",
    },
  });
  return telegramAccountClaimsFromRead(result);
}

function findSubmittedClaim(
  result: ReadClaimsResult,
  claimId: ccc.Hex,
  transactionHash: ccc.Hex,
  outputIndex: number,
): Claim | undefined {
  const index = BigInt(outputIndex);
  const invalid = result.invalid.find(
    ({ cell }) => cell.outPoint.txHash === transactionHash && cell.outPoint.index === index,
  );
  if (invalid) throw new Error("The submitted Claim Cell could not be decoded safely");
  return result.claims.find(
    (claim) =>
      claim.claimId === claimId &&
      claim.cell.outPoint.txHash === transactionHash &&
      claim.cell.outPoint.index === index,
  );
}

function isIndexing(claim: Claim | undefined): boolean {
  return (
    !claim ||
    claim.issuerState.status === "unavailable" ||
    claim.verification.time.status === "not-yet-active"
  );
}

function assertActive(claim: Claim): void {
  if (!isActive(claim)) {
    throw new Error("The claim is not currently backed by an active issuer");
  }
}

export function telegramClaimConfirmationFromRead(
  result: ReadClaimsResult,
  submission: TelegramSubmission,
  blockNumber?: bigint,
): TelegramClaimConfirmation {
  const identity = findSubmittedClaim(
    result,
    submission.claimId,
    submission.transactionHash,
    submission.outputIndex,
  );
  const community =
    submission.communityClaimId && submission.communityOutputIndex !== undefined
      ? findSubmittedClaim(
          result,
          submission.communityClaimId,
          submission.transactionHash,
          submission.communityOutputIndex,
        )
      : undefined;
  if (isIndexing(identity) || (submission.communityClaimId && isIndexing(community))) {
    return { state: "indexing", blockNumber };
  }

  assertActive(identity!);
  if (identity!.schemaHash !== TELEGRAM_CLAIM_SCHEMA_HASH) {
    throw new Error("The indexed Telegram claim does not match the callback result");
  }
  const account = parseTelegramClaimPayload(identity!.payload);
  if (
    account.user_id !== submission.accountId ||
    account.display_name !== submission.displayName ||
    account.username !== submission.username ||
    BigInt(account.verified_at) !== identity!.issuedAt
  ) {
    throw new Error("The indexed Telegram claim does not match the callback result");
  }

  let communityPayload: TelegramCommunityClaimPayload | undefined;
  if (community) {
    assertActive(community);
    communityPayload = parseTelegramCommunityClaimPayload(community.payload);
    if (
      community.schemaHash !== TELEGRAM_COMMUNITY_CLAIM_SCHEMA_HASH ||
      community.issuedAt !== identity!.issuedAt ||
      communityPayload.user_id !== account.user_id ||
      communityPayload.memberships.length !== submission.communityCount ||
      BigInt(communityPayload.verified_at) !== community.issuedAt ||
      community.expiresAt !== community.issuedAt + COMMUNITY_CLAIM_TTL_SECONDS
    ) {
      throw new Error("The indexed Telegram community claim does not match the callback result");
    }
  } else if (submission.communityCount !== 0) {
    throw new Error("The Telegram community claim is missing");
  }

  return { state: "confirmed", blockNumber, account, community: communityPayload };
}

export async function confirmTelegramClaims(
  client: ccc.Client,
  submission: TelegramSubmission,
  issuer: PublicIssuerMetadata,
  now: () => number = () => Math.floor(Date.now() / 1_000),
): Promise<TelegramClaimConfirmation> {
  const transaction = await client.getTransaction(submission.transactionHash);
  if (!transaction || transaction.status !== "committed") {
    return transaction?.status === "rejected" ? { state: "rejected" } : { state: "pending" };
  }

  const result = await readClaims({
    client,
    scripts: dashboardClaimScripts,
    filter: {
      subject: { did: submission.subject },
      issuerDid: issuer.did,
      evaluationTime: now(),
    },
  });
  return telegramClaimConfirmationFromRead(result, submission, transaction.blockNumber);
}
