import { describe, expect, test } from "bun:test";
import type { Claim, ReadClaimsResult } from "@usevellum/sdk";

import { claimCellCount, claimCellRecords, unreportedDuplicateClaims } from "./profile-records";

function cell(transactionHash: string, index: bigint) {
  return { outPoint: { txHash: transactionHash, index } } as Claim["cell"];
}

function claim(primary: Claim["cell"], duplicateCells: Claim["cell"][]): Claim {
  return { cell: primary, duplicateCells } as unknown as Claim;
}

describe("public profile Claim Cell records", () => {
  test("counts canonical, duplicate, and unreadable live cells", () => {
    const result = {
      claims: [
        claim(cell("0xprimary", 0n), [cell("0xduplicate-a", 1n), cell("0xduplicate-b", 2n)]),
      ],
      invalid: [{ cell: cell("0xinvalid", 3n) } as ReadClaimsResult["invalid"][number]],
    };

    expect(claimCellCount(result)).toBe(4);
    expect(
      claimCellRecords(result.claims).map(({ key, duplicate }) => ({ key, duplicate })),
    ).toEqual([
      { key: "0xprimary:0", duplicate: false },
      { key: "0xduplicate-a:1", duplicate: true },
      { key: "0xduplicate-b:2", duplicate: true },
    ]);
  });

  test("keeps duplicate cells visible when reputation does not report them", () => {
    const result = {
      claims: [claim(cell("0xprimary", 0n), [cell("0xreported", 1n), cell("0xunreported", 2n)])],
      invalid: [],
    };

    const records = unreportedDuplicateClaims(result, new Set(["0xreported:1"]));
    expect(records.map(({ key }) => key)).toEqual(["0xunreported:2"]);
  });
});
