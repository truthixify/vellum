import { ccc } from "@ckb-ccc/core";
import {
  GITHUB_CLAIM_SCHEMA_HASH,
  GITHUB_CONTRIBUTION_CLAIM_SCHEMA_HASH,
  GITHUB_CONTRIBUTION_CLAIM_TTL_SECONDS,
  parseGithubClaimPayload,
  parseGithubContributionClaimPayload,
  type GithubClaimPayload,
  type GithubContributionClaimPayload,
} from "@vellum/schemas";
import { readClaims, type Claim, type ReadClaimsResult } from "@vellum/sdk";

import { dashboardClaimScripts } from "./claim-scripts";
import type { GithubSubmission, PublicIssuerMetadata } from "./github-verification";

const GITHUB_CONTRIBUTION_TTL = BigInt(GITHUB_CONTRIBUTION_CLAIM_TTL_SECONDS);

export type GithubClaimConfirmation =
  | { state: "pending" }
  | { state: "indexing"; blockNumber?: bigint }
  | { state: "rejected" }
  | {
      state: "confirmed";
      blockNumber?: bigint;
      account: ReturnType<typeof parseGithubClaimPayload>;
      contribution?: ReturnType<typeof parseGithubContributionClaimPayload>;
    };

export type GithubContributionClaim = {
  contribution: GithubContributionClaimPayload;
  claimId: ccc.Hex;
  issuedAt: ccc.Num;
  expiresAt?: ccc.Num;
  transactionHash: ccc.Hex;
  outputIndex: ccc.Num;
};

export type GithubAccountClaim = {
  account: GithubClaimPayload;
  claimId: ccc.Hex;
  issuedAt: ccc.Num;
  transactionHash: ccc.Hex;
  outputIndex: ccc.Num;
  contribution?: GithubContributionClaim;
};

function isActive(claim: Claim): boolean {
  return claim.issuerState.status === "active" && claim.verification.time.status === "active";
}

function hasUnavailableStatus(result: ReadClaimsResult): boolean {
  return result.claims.some(
    (claim) =>
      claim.issuerState.status === "unavailable" ||
      claim.verification.time.status === "not-yet-active",
  );
}

export function githubAccountClaimsFromRead(
  result: ReadClaimsResult,
  contributionResult?: ReadClaimsResult,
): GithubAccountClaim[] {
  const activeClaims = result.claims
    .filter(isActive)
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
  const deduplicated: GithubAccountClaim[] = activeClaims.filter((claim) => {
    if (accounts.has(claim.account.user_id)) return false;
    accounts.add(claim.account.user_id);
    return true;
  });
  if (deduplicated.length === 0 && hasUnavailableStatus(result)) {
    throw new Error("GitHub claim status is temporarily unavailable");
  }

  if (!contributionResult) return deduplicated;
  const activeContributions = contributionResult.claims
    .filter(isActive)
    .map((claim): GithubContributionClaim => {
      const contribution = parseGithubContributionClaimPayload(claim.payload);
      if (
        BigInt(contribution.verified_at) !== claim.issuedAt ||
        claim.expiresAt !== claim.issuedAt + GITHUB_CONTRIBUTION_TTL
      ) {
        throw new Error("The indexed GitHub contribution claim does not match its envelope");
      }
      return {
        contribution,
        claimId: claim.claimId,
        issuedAt: claim.issuedAt,
        expiresAt: claim.expiresAt,
        transactionHash: claim.cell.outPoint.txHash,
        outputIndex: claim.cell.outPoint.index,
      };
    })
    .sort((left, right) =>
      left.issuedAt > right.issuedAt ? -1 : left.issuedAt < right.issuedAt ? 1 : 0,
    );
  if (activeContributions.length === 0 && hasUnavailableStatus(contributionResult)) {
    throw new Error("GitHub contribution claim status is temporarily unavailable");
  }

  const contributions = new Map<number, GithubContributionClaim>();
  for (const claim of activeContributions) {
    if (!contributions.has(claim.contribution.user_id)) {
      contributions.set(claim.contribution.user_id, claim);
    }
  }
  return deduplicated.map((claim) => {
    const contribution = contributions.get(claim.account.user_id);
    return contribution ? { ...claim, contribution } : claim;
  });
}

export async function readGithubAccountClaims(
  client: ccc.Client,
  subjectDid: string,
  issuer: PublicIssuerMetadata,
  now: () => number = () => Math.floor(Date.now() / 1_000),
): Promise<GithubAccountClaim[]> {
  const evaluationTime = now();
  const [result, contributionResult] = await Promise.all(
    [GITHUB_CLAIM_SCHEMA_HASH, GITHUB_CONTRIBUTION_CLAIM_SCHEMA_HASH].map((schemaHash) =>
      readClaims({
        client,
        scripts: dashboardClaimScripts,
        filter: {
          subject: { did: subjectDid },
          issuerDid: issuer.did,
          schemaHash,
          evaluationTime,
          order: "desc",
        },
      }),
    ),
  );
  return githubAccountClaimsFromRead(result, contributionResult);
}

export function githubClaimConfirmationFromRead(
  result: ReadClaimsResult,
  submission: GithubSubmission,
  blockNumber?: bigint,
): GithubClaimConfirmation {
  const references = [
    {
      claimId: submission.claimId,
      outputIndex: submission.outputIndex,
      schemaHash: GITHUB_CLAIM_SCHEMA_HASH,
    },
    ...(submission.contribution
      ? [
          {
            claimId: submission.contribution.claimId,
            outputIndex: submission.contribution.outputIndex,
            schemaHash: GITHUB_CONTRIBUTION_CLAIM_SCHEMA_HASH,
          },
        ]
      : []),
  ];
  for (const reference of references) {
    const outputIndex = BigInt(reference.outputIndex);
    const invalid = result.invalid.find(
      ({ cell }) =>
        cell.outPoint.txHash === submission.transactionHash && cell.outPoint.index === outputIndex,
    );
    if (invalid) throw new Error("A submitted Claim Cell could not be decoded safely");
  }

  const claims = references.map((reference) => {
    const claim = result.claims.find(
      (candidate) =>
        candidate.cell.outPoint.txHash === submission.transactionHash &&
        candidate.cell.outPoint.index === BigInt(reference.outputIndex),
    );
    if (claim && claim.claimId !== reference.claimId) {
      throw new Error("A submitted GitHub claim does not match the callback result");
    }
    return claim;
  });
  if (
    claims.some(
      (claim) =>
        !claim ||
        claim.issuerState.status === "unavailable" ||
        claim.verification.time.status === "not-yet-active",
    )
  ) {
    return { state: "indexing", blockNumber };
  }
  const confirmedClaims = claims as Claim[];
  for (const [index, claim] of confirmedClaims.entries()) {
    if (claim.schemaHash !== references[index].schemaHash) {
      throw new Error("A submitted GitHub claim uses an unexpected schema");
    }
    if (!isActive(claim)) {
      throw new Error("A claim is not currently backed by an active issuer");
    }
  }

  const identityClaim = confirmedClaims[0];
  const account = parseGithubClaimPayload(identityClaim.payload);
  if (
    account.login !== submission.login ||
    BigInt(account.verified_at) !== identityClaim.issuedAt
  ) {
    throw new Error("The indexed GitHub claim does not match the callback result");
  }
  if (!submission.contribution) return { state: "confirmed", blockNumber, account };

  const contributionClaim = confirmedClaims[1];
  const contribution = parseGithubContributionClaimPayload(contributionClaim.payload);
  if (
    contribution.login !== submission.login ||
    contribution.user_id !== account.user_id ||
    contribution.verified_at !== account.verified_at ||
    BigInt(contribution.verified_at) !== contributionClaim.issuedAt ||
    contributionClaim.expiresAt !== contributionClaim.issuedAt + GITHUB_CONTRIBUTION_TTL
  ) {
    throw new Error("The indexed GitHub contribution claim does not match the callback result");
  }
  return { state: "confirmed", blockNumber, account, contribution };
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
      evaluationTime: now(),
    },
  });
  return githubClaimConfirmationFromRead(result, submission, transaction.blockNumber);
}
