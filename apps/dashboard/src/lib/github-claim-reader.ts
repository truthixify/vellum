import { ccc } from "@ckb-ccc/core";
import {
  GITHUB_CLAIM_SCHEMA_HASH,
  parseGithubClaimPayload,
  type GithubClaimPayload,
} from "@vellum/schemas";
import { readClaims, type ReadClaimsResult } from "@vellum/sdk";

import { dashboardClaimScripts } from "./claim-scripts";
import type { GithubSubmission, PublicIssuerMetadata } from "./github-verification";

export type GithubClaimConfirmation =
  | { state: "pending" }
  | { state: "indexing"; blockNumber?: bigint }
  | { state: "rejected" }
  | {
      state: "confirmed";
      blockNumber?: bigint;
      account: ReturnType<typeof parseGithubClaimPayload>;
    };

export type GithubAccountClaim = {
  account: GithubClaimPayload;
  claimId: ccc.Hex;
  issuedAt: ccc.Num;
  transactionHash: ccc.Hex;
  outputIndex: ccc.Num;
};

export function githubAccountClaimsFromRead(result: ReadClaimsResult): GithubAccountClaim[] {
  const activeClaims = result.claims
    .filter(
      (claim) =>
        claim.issuerState.status === "active" && claim.verification.time.status === "active",
    )
    .map((claim) => {
      const account = parseGithubClaimPayload(claim.payload);
      if (BigInt(account.verified_at) !== claim.issuedAt) {
        throw new Error("The indexed GitHub claim does not match its issuance time");
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

  const accounts = new Set<number>();
  const deduplicated = activeClaims.filter((claim) => {
    if (accounts.has(claim.account.user_id)) return false;
    accounts.add(claim.account.user_id);
    return true;
  });
  if (deduplicated.length > 0) return deduplicated;

  const unavailable = result.claims.some(
    (claim) =>
      claim.issuerState.status === "unavailable" ||
      claim.verification.time.status === "not-yet-active",
  );
  if (unavailable) {
    throw new Error("GitHub claim status is temporarily unavailable");
  }
  return [];
}

export async function readGithubAccountClaims(
  client: ccc.Client,
  subjectDid: string,
  issuer: PublicIssuerMetadata,
  now: () => number = () => Math.floor(Date.now() / 1_000),
): Promise<GithubAccountClaim[]> {
  const result = await readClaims({
    client,
    scripts: dashboardClaimScripts,
    filter: {
      subject: { did: subjectDid },
      issuerDid: issuer.did,
      schemaHash: GITHUB_CLAIM_SCHEMA_HASH,
      evaluationTime: now(),
      order: "desc",
    },
  });
  return githubAccountClaimsFromRead(result);
}

export function githubClaimConfirmationFromRead(
  result: ReadClaimsResult,
  submission: GithubSubmission,
  blockNumber?: bigint,
): GithubClaimConfirmation {
  const outputIndex = BigInt(submission.outputIndex);
  const invalid = result.invalid.find(
    ({ cell }) =>
      cell.outPoint.txHash === submission.transactionHash && cell.outPoint.index === outputIndex,
  );
  if (invalid) throw new Error("The submitted Claim Cell could not be decoded safely");

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
  if (claim.issuerState.status !== "active" || claim.verification.time.status !== "active") {
    throw new Error("The claim is not currently backed by an active issuer");
  }

  const account = parseGithubClaimPayload(claim.payload);
  if (account.login !== submission.login || BigInt(account.verified_at) !== claim.issuedAt) {
    throw new Error("The indexed GitHub claim does not match the callback result");
  }
  return { state: "confirmed", blockNumber, account };
}

export async function confirmGithubClaim(
  client: ccc.Client,
  submission: GithubSubmission,
  issuer: PublicIssuerMetadata,
  now: () => number = () => Math.floor(Date.now() / 1_000),
): Promise<GithubClaimConfirmation> {
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
      schemaHash: GITHUB_CLAIM_SCHEMA_HASH,
      evaluationTime: now(),
    },
  });
  return githubClaimConfirmationFromRead(result, submission, transaction.blockNumber);
}
