import { ccc } from "@ckb-ccc/core";
import {
  BLUESKY_CLAIM_SCHEMA_HASH,
  parseBlueskyClaimPayload,
  type BlueskyClaimPayload,
} from "@vellum/schemas";
import { readClaims, type Claim, type ReadClaimsResult } from "@vellum/sdk";

import { dashboardClaimScripts } from "./claim-scripts";
import type { BlueskySubmission } from "./bluesky-verification";
import type { PublicIssuerMetadata } from "./verification-issuer";

export type BlueskyAccountClaim = {
  account: BlueskyClaimPayload;
  claimId: ccc.Hex;
  issuedAt: ccc.Num;
  transactionHash: ccc.Hex;
  outputIndex: ccc.Num;
};

export type BlueskyClaimConfirmation =
  | { state: "pending" }
  | { state: "indexing"; blockNumber?: bigint }
  | { state: "rejected" }
  | { state: "confirmed"; blockNumber?: bigint; account: BlueskyClaimPayload };

function isActive(claim: Claim): boolean {
  return claim.issuerState.status === "active" && claim.verification.time.status === "active";
}

export function blueskyAccountClaimsFromRead(result: ReadClaimsResult): BlueskyAccountClaim[] {
  const claims = result.claims
    .filter((claim) => claim.schemaHash === BLUESKY_CLAIM_SCHEMA_HASH && isActive(claim))
    .map((claim): BlueskyAccountClaim => {
      const account = parseBlueskyClaimPayload(claim.payload);
      if (BigInt(account.verified_at) !== claim.issuedAt) {
        throw new Error("The indexed Bluesky claim does not match its issuance time");
      }
      return {
        account,
        claimId: claim.claimId,
        issuedAt: claim.issuedAt,
        transactionHash: claim.cell.outPoint.txHash,
        outputIndex: claim.cell.outPoint.index,
      };
    })
    .sort((left, right) =>
      left.issuedAt > right.issuedAt ? -1 : left.issuedAt < right.issuedAt ? 1 : 0,
    );

  const accounts = new Set<string>();
  const deduplicated = claims.filter((claim) => {
    if (accounts.has(claim.account.did)) return false;
    accounts.add(claim.account.did);
    return true;
  });
  if (deduplicated.length > 0) return deduplicated;
  if (
    result.claims.some(
      (claim) =>
        claim.schemaHash === BLUESKY_CLAIM_SCHEMA_HASH &&
        (claim.issuerState.status === "unavailable" ||
          claim.verification.time.status === "not-yet-active"),
    )
  ) {
    throw new Error("Bluesky claim status is temporarily unavailable");
  }
  return [];
}

export async function readBlueskyAccountClaims(
  client: ccc.Client,
  subjectDid: string,
  issuer: PublicIssuerMetadata,
  now: () => number = () => Math.floor(Date.now() / 1_000),
): Promise<BlueskyAccountClaim[]> {
  const result = await readClaims({
    client,
    scripts: dashboardClaimScripts,
    filter: {
      subject: { did: subjectDid },
      issuerDid: issuer.did,
      schemaHash: BLUESKY_CLAIM_SCHEMA_HASH,
      evaluationTime: now(),
      order: "desc",
    },
  });
  return blueskyAccountClaimsFromRead(result);
}

export function blueskyClaimConfirmationFromRead(
  result: ReadClaimsResult,
  submission: BlueskySubmission,
  blockNumber?: bigint,
): BlueskyClaimConfirmation {
  const outputIndex = BigInt(submission.outputIndex);
  if (
    result.invalid.some(
      ({ cell }) =>
        cell.outPoint.txHash === submission.transactionHash && cell.outPoint.index === outputIndex,
    )
  ) {
    throw new Error("The submitted Claim Cell could not be decoded safely");
  }

  const claim = result.claims.find(
    (candidate) =>
      candidate.claimId === submission.claimId &&
      candidate.cell.outPoint.txHash === submission.transactionHash &&
      candidate.cell.outPoint.index === outputIndex,
  );
  if (
    !claim ||
    claim.issuerState.status === "unavailable" ||
    claim.verification.time.status === "not-yet-active"
  ) {
    return { state: "indexing", blockNumber };
  }
  if (!isActive(claim)) {
    throw new Error("The claim is not currently backed by an active issuer");
  }
  if (claim.schemaHash !== BLUESKY_CLAIM_SCHEMA_HASH) {
    throw new Error("The indexed Bluesky claim does not match the submission result");
  }

  const account = parseBlueskyClaimPayload(claim.payload);
  if (
    account.did !== submission.accountDid ||
    account.handle !== submission.handle ||
    BigInt(account.verified_at) !== claim.issuedAt
  ) {
    throw new Error("The indexed Bluesky claim does not match the submission result");
  }
  return { state: "confirmed", blockNumber, account };
}

export async function confirmBlueskyClaim(
  client: ccc.Client,
  submission: BlueskySubmission,
  issuer: PublicIssuerMetadata,
  now: () => number = () => Math.floor(Date.now() / 1_000),
): Promise<BlueskyClaimConfirmation> {
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
      schemaHash: BLUESKY_CLAIM_SCHEMA_HASH,
      evaluationTime: now(),
    },
  });
  return blueskyClaimConfirmationFromRead(result, submission, transaction.blockNumber);
}
