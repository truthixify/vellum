import { describe, expect, test } from "bun:test";
import { ccc } from "@ckb-ccc/core";
import { didToArgs } from "@ckb-ccc/did-ckb";
import { ClaimData } from "@usevellum/sdk";

import { readRecentIssuerClaims } from "./issuer-claims";

const ISSUER_DID = "did:ckb:4kiidiczwthgxj7dltzkzopgbwu3v6jc";
const OTHER_ISSUER_DID = "did:ckb:lzvdgadum4cnatdhs2xzqkm6m7zyqlib";
const SCHEMA_HASH = `0x${"22".repeat(32)}` as const;
const CLAIM_TYPE = {
  codeHash: `0x${"11".repeat(32)}` as ccc.Hex,
  hashType: "type" as const,
  cellDeps: [],
};
const DID_CKB = {
  codeHash: `0x${"33".repeat(32)}` as ccc.Hex,
  hashType: "type" as const,
  cellDeps: [],
};
const SUBJECT_LOCK = ccc.Script.from({
  codeHash: `0x${"44".repeat(32)}`,
  hashType: "type",
  args: `0x${"55".repeat(32)}`,
});

function claimCell(options: {
  byte: number;
  issuerDid?: string;
  outputData?: ccc.Hex;
  typeArgs?: ccc.Hex;
  issuedAt?: bigint;
  expiresAt?: bigint;
}): ccc.Cell {
  const issuerId = ccc.hexFrom(didToArgs(options.issuerDid ?? ISSUER_DID));
  const outputData =
    options.outputData ??
    ClaimData.fromV1({
      issuerId,
      nonce: `0x${options.byte.toString(16).padStart(2, "0").repeat(32)}`,
      issuedAt: options.issuedAt ?? BigInt(1_800_000_000 + options.byte),
      expiresAt: options.expiresAt,
      payload: { proof: options.byte },
    }).toHex();
  const typeArgs =
    options.typeArgs ??
    ccc.hexFrom(
      ccc.bytesConcat(
        ccc.bytesFrom(DID_CKB.codeHash),
        ccc.hashTypeToBytes(DID_CKB.hashType),
        ccc.bytesFrom(SCHEMA_HASH),
      ),
    );
  return ccc.Cell.from({
    outPoint: {
      txHash: `0x${options.byte.toString(16).padStart(2, "0").repeat(32)}`,
      index: 0,
    },
    cellOutput: {
      capacity: 100_000_000_000n,
      lock: SUBJECT_LOCK,
      type: { codeHash: CLAIM_TYPE.codeHash, hashType: CLAIM_TYPE.hashType, args: typeArgs },
    },
    outputData,
  });
}

function fakeClient(cells: ccc.Cell[]) {
  return {
    findCellsPagedNoCache: async (key: ccc.ClientIndexerSearchKeyLike) => {
      const script = ccc.Script.from(key.script);
      expect(key.scriptType).toBe("type");
      expect(key.scriptSearchMode).toBe("prefix");
      expect(script.codeHash).toBe(CLAIM_TYPE.codeHash);
      expect(ccc.bytesFrom(script.args)).toHaveLength(33);
      return { cells, lastCursor: "done" };
    },
  } as unknown as ccc.Client;
}

describe("recent issuer claims", () => {
  test("filters decoded live Claim Cells by issuer and keeps chain order", async () => {
    const malformed = claimCell({ byte: 3, outputData: "0x00" });
    const otherIssuer = claimCell({ byte: 2, issuerDid: OTHER_ISSUER_DID });
    const matching = claimCell({ byte: 1 });

    const result = await readRecentIssuerClaims(
      fakeClient([malformed, otherIssuer, matching]),
      { claimType: CLAIM_TYPE, didCkb: DID_CKB },
      ISSUER_DID,
    );

    expect(result.invalidCells).toBe(1);
    expect(result.scanLimitReached).toBeFalse();
    expect(result.claims).toEqual([
      {
        transactionHash: matching.outPoint.txHash,
        outputIndex: 0,
        schemaHash: SCHEMA_HASH,
        subjectLockHash: SUBJECT_LOCK.hash(),
        issuedAt: 1_800_000_001n,
        expiresAt: undefined,
        capacity: 100_000_000_000n,
      },
    ]);
  });

  test("reports malformed type args and a bounded scan", async () => {
    const cells = [claimCell({ byte: 1, typeArgs: "0x11" }), claimCell({ byte: 2, issuedAt: 0n })];
    const result = await readRecentIssuerClaims(
      fakeClient(cells),
      { claimType: CLAIM_TYPE, didCkb: DID_CKB },
      ISSUER_DID,
      { limit: 2, scanLimit: 2 },
    );

    expect(result).toEqual({ claims: [], invalidCells: 2, scanLimitReached: true });
  });

  test("rejects unsafe result bounds before querying the indexer", async () => {
    await expect(
      readRecentIssuerClaims(
        fakeClient([]),
        { claimType: CLAIM_TYPE, didCkb: DID_CKB },
        ISSUER_DID,
        { limit: 0 },
      ),
    ).rejects.toThrow("Recent issuer claim limit must be between 1 and 50.");
  });
});
