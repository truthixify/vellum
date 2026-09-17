import { describe, expect, test } from "bun:test";
import { ccc } from "@ckb-ccc/core";
import {
  parseDeploymentRecord,
  sha256Hex,
  verifyDeploymentCell,
  type TestnetDeploymentRecord,
} from "./verify";

const TYPE_ID_CODE_HASH = "0x00000000000000000000000000000000000000000000000000545950455f4944";
const TX_HASH = `0x${"22".repeat(32)}`;
const TYPE_ID_ARGS = `0x${"33".repeat(32)}`;
const BINARY = new Uint8Array([0x7f, 0x45, 0x4c, 0x46]);
const UPGRADE_LOCK = {
  codeHash: `0x${"44".repeat(32)}`,
  hashType: "type" as const,
  args: `0x${"55".repeat(20)}`,
};
const TYPE_ID = ccc.Script.from({
  codeHash: TYPE_ID_CODE_HASH,
  hashType: "type",
  args: TYPE_ID_ARGS,
});

function deploymentRecord(): TestnetDeploymentRecord {
  const contract = {
    outPoint: { txHash: TX_HASH, index: "0x0" },
    codeHash: TYPE_ID.hash(),
    hashType: "type" as const,
    depType: "code" as const,
    typeIdArgs: TYPE_ID_ARGS,
    dataHash: ccc.hashCkb(BINARY),
    binarySha256: sha256Hex(BINARY),
    binarySize: BINARY.byteLength,
  };
  return {
    version: 1,
    network: "ckb_testnet",
    deployedAt: "2026-09-17T20:00:00.000Z",
    ckbCliVersion: "2.0.0",
    upgradeLock: UPGRADE_LOCK,
    contracts: { claimType: contract, didLock: contract },
  };
}

function deploymentCell(): ccc.Cell {
  return ccc.Cell.from({
    outPoint: { txHash: TX_HASH, index: 0 },
    cellOutput: {
      capacity: 1_000_000_000_000n,
      lock: UPGRADE_LOCK,
      type: TYPE_ID,
    },
    outputData: ccc.hexFrom(BINARY),
  });
}

describe("testnet deployment verification", () => {
  test("accepts a complete record and matching Type ID code cell", () => {
    const record = parseDeploymentRecord(deploymentRecord());

    expect(() =>
      verifyDeploymentCell(
        "claimType",
        record.contracts.claimType,
        record.upgradeLock,
        deploymentCell(),
        BINARY,
      ),
    ).not.toThrow();
  });

  test("rejects a binary that differs from the published deployment", () => {
    const record = deploymentRecord();

    expect(() =>
      verifyDeploymentCell(
        "claimType",
        record.contracts.claimType,
        record.upgradeLock,
        deploymentCell(),
        new Uint8Array([0x7f, 0x45, 0x4c, 0x47]),
      ),
    ).toThrow("claimType binary SHA-256 mismatch");
  });

  test("rejects malformed deployment metadata", () => {
    const record = deploymentRecord() as unknown as Record<string, unknown>;
    const contracts = record.contracts as Record<string, Record<string, unknown>>;
    contracts.claimType.typeIdArgs = "0x1234";

    expect(() => parseDeploymentRecord(record)).toThrow(
      "deployment.contracts.claimType.typeIdArgs must be a lowercase 32-byte hex value",
    );
  });
});
