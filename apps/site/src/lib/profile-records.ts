import type { Claim, ReadClaimsResult } from "@usevellum/sdk";

export type DuplicateClaimRecord = {
  claim: Claim;
  cell: Claim["cell"];
  key: string;
};

export type ClaimCellRecord = DuplicateClaimRecord & {
  duplicate: boolean;
};

export function claimReferenceKey(transactionHash: string, outputIndex: number | bigint): string {
  return `${transactionHash}:${Number(outputIndex)}`;
}

export function claimCellCount(result: ReadClaimsResult): number {
  return (
    result.invalid.length +
    result.claims.reduce((total, claim) => total + 1 + claim.duplicateCells.length, 0)
  );
}

export function claimCellRecords(claims: readonly Claim[]): readonly ClaimCellRecord[] {
  return claims.flatMap((claim) => [
    {
      claim,
      cell: claim.cell,
      key: claimReferenceKey(claim.cell.outPoint.txHash, claim.cell.outPoint.index),
      duplicate: false,
    },
    ...claim.duplicateCells.map((cell) => ({
      claim,
      cell,
      key: claimReferenceKey(cell.outPoint.txHash, cell.outPoint.index),
      duplicate: true,
    })),
  ]);
}

export function unreportedDuplicateClaims(
  result: ReadClaimsResult,
  reportedReferences: ReadonlySet<string>,
): readonly DuplicateClaimRecord[] {
  return result.claims.flatMap((claim) =>
    claim.duplicateCells.flatMap((cell) => {
      const key = claimReferenceKey(cell.outPoint.txHash, cell.outPoint.index);
      return reportedReferences.has(key) ? [] : [{ claim, cell, key }];
    }),
  );
}
