import { ccc } from "@ckb-ccc/core";
import {
  DISCORD_CLAIM_SCHEMA_HASH,
  DISCORD_COMMUNITY_CLAIM_SCHEMA_HASH,
  parseDiscordClaimPayload,
  parseDiscordCommunityClaimPayload,
  type DiscordClaimPayload,
  type DiscordCommunityClaimPayload,
} from "@vellum/schemas";
import { readClaims, type Claim, type ReadClaimsResult } from "@vellum/sdk";

import { dashboardClaimScripts } from "./claim-scripts";
import type { DiscordSubmission } from "./discord-verification";
import type { PublicIssuerMetadata } from "./verification-issuer";

type ClaimReference = {
  claimId: ccc.Hex;
  issuedAt: ccc.Num;
  transactionHash: ccc.Hex;
  outputIndex: ccc.Num;
};

const COMMUNITY_CLAIM_TTL_SECONDS = 30n * 86_400n;

export type DiscordCommunityClaim = ClaimReference & {
  community: DiscordCommunityClaimPayload;
  expiresAt: ccc.Num;
};

export type DiscordAccountClaim = ClaimReference & {
  account: DiscordClaimPayload;
  community?: DiscordCommunityClaim;
};

export type DiscordClaimConfirmation =
  | { state: "pending" }
  | { state: "indexing"; blockNumber?: bigint }
  | { state: "rejected" }
  | {
      state: "confirmed";
      blockNumber?: bigint;
      account: DiscordClaimPayload;
      community?: DiscordCommunityClaimPayload;
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
      (claim.schemaHash === DISCORD_CLAIM_SCHEMA_HASH ||
        claim.schemaHash === DISCORD_COMMUNITY_CLAIM_SCHEMA_HASH) &&
      (claim.issuerState.status === "unavailable" ||
        claim.verification.time.status === "not-yet-active"),
  );
}

export function discordAccountClaimsFromRead(result: ReadClaimsResult): DiscordAccountClaim[] {
  const communities = result.claims
    .filter((claim) => claim.schemaHash === DISCORD_COMMUNITY_CLAIM_SCHEMA_HASH && isActive(claim))
    .map((claim): DiscordCommunityClaim => {
      const community = parseDiscordCommunityClaimPayload(claim.payload);
      if (
        BigInt(community.verified_at) !== claim.issuedAt ||
        claim.expiresAt !== claim.issuedAt + COMMUNITY_CLAIM_TTL_SECONDS
      ) {
        throw new Error("The indexed Discord community claim does not match its envelope");
      }
      return { ...reference(claim), expiresAt: claim.expiresAt, community };
    })
    .sort(newestFirst);
  const newestCommunityByUser = new Map<string, DiscordCommunityClaim>();
  for (const community of communities) {
    if (!newestCommunityByUser.has(community.community.user_id)) {
      newestCommunityByUser.set(community.community.user_id, community);
    }
  }

  const identities = result.claims
    .filter((claim) => claim.schemaHash === DISCORD_CLAIM_SCHEMA_HASH && isActive(claim))
    .map((claim): DiscordAccountClaim => {
      const account = parseDiscordClaimPayload(claim.payload);
      if (BigInt(account.verified_at) !== claim.issuedAt) {
        throw new Error("The indexed Discord claim does not match its issuance time");
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
    throw new Error("Discord claim status is temporarily unavailable");
  }
  return [];
}

export async function readDiscordAccountClaims(
  client: ccc.Client,
  subjectDid: string,
  issuer: PublicIssuerMetadata,
  now: () => number = () => Math.floor(Date.now() / 1_000),
): Promise<DiscordAccountClaim[]> {
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
  return discordAccountClaimsFromRead(result);
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

export function discordClaimConfirmationFromRead(
  result: ReadClaimsResult,
  submission: DiscordSubmission,
  blockNumber?: bigint,
): DiscordClaimConfirmation {
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
  if (identity!.schemaHash !== DISCORD_CLAIM_SCHEMA_HASH) {
    throw new Error("The indexed Discord claim does not match the callback result");
  }
  const account = parseDiscordClaimPayload(identity!.payload);
  if (
    account.username !== submission.username ||
    BigInt(account.verified_at) !== identity!.issuedAt
  ) {
    throw new Error("The indexed Discord claim does not match the callback result");
  }

  let communityPayload: DiscordCommunityClaimPayload | undefined;
  if (community) {
    assertActive(community);
    communityPayload = parseDiscordCommunityClaimPayload(community.payload);
    if (
      community.schemaHash !== DISCORD_COMMUNITY_CLAIM_SCHEMA_HASH ||
      community.issuedAt !== identity!.issuedAt ||
      communityPayload.user_id !== account.user_id ||
      communityPayload.memberships.length !== submission.communityCount ||
      BigInt(communityPayload.verified_at) !== community.issuedAt ||
      community.expiresAt !== community.issuedAt + COMMUNITY_CLAIM_TTL_SECONDS
    ) {
      throw new Error("The indexed Discord community claim does not match the callback result");
    }
  } else if (submission.communityCount !== 0) {
    throw new Error("The Discord community claim is missing");
  }

  return { state: "confirmed", blockNumber, account, community: communityPayload };
}

export async function confirmDiscordClaims(
  client: ccc.Client,
  submission: DiscordSubmission,
  issuer: PublicIssuerMetadata,
  now: () => number = () => Math.floor(Date.now() / 1_000),
): Promise<DiscordClaimConfirmation> {
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
  return discordClaimConfirmationFromRead(result, submission, transaction.blockNumber);
}
