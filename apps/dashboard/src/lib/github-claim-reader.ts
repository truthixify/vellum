import { ccc } from "@ckb-ccc/core";
import { GITHUB_CLAIM_SCHEMA_HASH, parseGithubClaimPayload } from "@vellum/schemas";
import { readClaims, type ClaimScriptConfigLike, type ReadClaimsResult } from "@vellum/sdk";

import deployment from "../../../../deployments/testnet.json";
import type { GithubSubmission, PublicIssuerMetadata } from "./github-verification";

function scriptInfo(
  contract: (typeof deployment.contracts)[keyof typeof deployment.contracts],
): ccc.ScriptInfoLike {
  return {
    codeHash: contract.codeHash,
    hashType: contract.hashType,
    cellDeps: [
      {
        cellDep: {
          outPoint: contract.outPoint,
          depType: contract.depType,
        },
      },
    ],
  };
}

export const githubClaimScripts = {
  claimType: scriptInfo(deployment.contracts.claimType),
  didLock: scriptInfo(deployment.contracts.didLock),
} satisfies ClaimScriptConfigLike;

export type GithubClaimConfirmation =
  | { state: "pending" }
  | { state: "indexing"; blockNumber?: bigint }
  | { state: "rejected" }
  | {
      state: "confirmed";
      blockNumber?: bigint;
      account: ReturnType<typeof parseGithubClaimPayload>;
    };

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
    scripts: githubClaimScripts,
    filter: {
      subject: { did: submission.subject },
      issuerDid: issuer.did,
      schemaHash: GITHUB_CLAIM_SCHEMA_HASH,
      evaluationTime: now(),
    },
  });
  return githubClaimConfirmationFromRead(result, submission, transaction.blockNumber);
}
