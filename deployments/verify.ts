import { ccc } from "@ckb-ccc/core";
import { fileURLToPath } from "node:url";

const TYPE_ID_CODE_HASH = "0x00000000000000000000000000000000000000000000000000545950455f4944";

const CONTRACT_BINARIES = {
  claimType: fileURLToPath(
    new URL("../packages/claim-cell-script/build/release/claim-cell", import.meta.url),
  ),
  didLock: fileURLToPath(
    new URL("../packages/claim-cell-script/build/release/did-lock", import.meta.url),
  ),
} as const;

type ContractName = keyof typeof CONTRACT_BINARIES;

type ScriptRecord = {
  codeHash: string;
  hashType: "type";
  args: string;
};

type ContractDeployment = {
  outPoint: {
    txHash: string;
    index: string;
  };
  codeHash: string;
  hashType: "type";
  depType: "code";
  typeIdArgs: string;
  dataHash: string;
  binarySha256: string;
  binarySize: number;
};

export type TestnetDeploymentRecord = {
  version: 1;
  network: "ckb_testnet";
  deployedAt: string;
  ckbCliVersion: string;
  upgradeLock: ScriptRecord;
  contracts: Record<ContractName, ContractDeployment>;
};

function fail(message: string): never {
  throw new Error(message);
}

function objectAt(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function stringAt(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) {
    fail(`${path} must be a non-empty string`);
  }
  return value;
}

function literalAt<T extends string | number>(value: unknown, expected: T, path: string): T {
  if (value !== expected) {
    fail(`${path} must be ${JSON.stringify(expected)}`);
  }
  return expected;
}

function hexAt(value: unknown, bytes: number, path: string): string {
  const hex = stringAt(value, path);
  if (!new RegExp(`^0x[0-9a-f]{${bytes * 2}}$`).test(hex)) {
    fail(`${path} must be a lowercase ${bytes}-byte hex value`);
  }
  return hex;
}

function scriptAt(value: unknown, path: string): ScriptRecord {
  const script = objectAt(value, path);
  return {
    codeHash: hexAt(script.codeHash, 32, `${path}.codeHash`),
    hashType: literalAt(script.hashType, "type", `${path}.hashType`),
    args: hexAt(script.args, 20, `${path}.args`),
  };
}

function contractAt(value: unknown, path: string): ContractDeployment {
  const contract = objectAt(value, path);
  const outPoint = objectAt(contract.outPoint, `${path}.outPoint`);
  const index = stringAt(outPoint.index, `${path}.outPoint.index`);
  if (!/^0x(?:0|[1-9a-f][0-9a-f]*)$/.test(index)) {
    fail(`${path}.outPoint.index must be canonical lowercase hex`);
  }
  if (!Number.isSafeInteger(contract.binarySize) || Number(contract.binarySize) <= 0) {
    fail(`${path}.binarySize must be a positive integer`);
  }

  return {
    outPoint: {
      txHash: hexAt(outPoint.txHash, 32, `${path}.outPoint.txHash`),
      index,
    },
    codeHash: hexAt(contract.codeHash, 32, `${path}.codeHash`),
    hashType: literalAt(contract.hashType, "type", `${path}.hashType`),
    depType: literalAt(contract.depType, "code", `${path}.depType`),
    typeIdArgs: hexAt(contract.typeIdArgs, 32, `${path}.typeIdArgs`),
    dataHash: hexAt(contract.dataHash, 32, `${path}.dataHash`),
    binarySha256: hexAt(contract.binarySha256, 32, `${path}.binarySha256`),
    binarySize: Number(contract.binarySize),
  };
}

export function parseDeploymentRecord(value: unknown): TestnetDeploymentRecord {
  const record = objectAt(value, "deployment");
  const deployedAt = stringAt(record.deployedAt, "deployment.deployedAt");
  if (new Date(deployedAt).toISOString() !== deployedAt) {
    fail("deployment.deployedAt must be an ISO 8601 timestamp");
  }
  const contracts = objectAt(record.contracts, "deployment.contracts");

  return {
    version: literalAt(record.version, 1, "deployment.version"),
    network: literalAt(record.network, "ckb_testnet", "deployment.network"),
    deployedAt,
    ckbCliVersion: stringAt(record.ckbCliVersion, "deployment.ckbCliVersion"),
    upgradeLock: scriptAt(record.upgradeLock, "deployment.upgradeLock"),
    contracts: {
      claimType: contractAt(contracts.claimType, "deployment.contracts.claimType"),
      didLock: contractAt(contracts.didLock, "deployment.contracts.didLock"),
    },
  };
}

export function sha256Hex(bytes: Uint8Array): string {
  return `0x${new Bun.CryptoHasher("sha256").update(bytes).digest("hex")}`;
}

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) {
    fail(`${label} mismatch: expected ${String(expected)}, received ${String(actual)}`);
  }
}

export function verifyDeploymentCell(
  name: ContractName,
  deployment: ContractDeployment,
  upgradeLock: ScriptRecord,
  cell: ccc.Cell,
  binary: Uint8Array,
): void {
  assertEqual(cell.outPoint.txHash, deployment.outPoint.txHash, `${name} transaction hash`);
  assertEqual(ccc.numToHex(cell.outPoint.index), deployment.outPoint.index, `${name} output index`);
  assertEqual(binary.byteLength, deployment.binarySize, `${name} binary size`);
  assertEqual(sha256Hex(binary), deployment.binarySha256, `${name} binary SHA-256`);
  assertEqual(ccc.hashCkb(binary), deployment.dataHash, `${name} data hash`);
  assertEqual(cell.outputData, ccc.hexFrom(binary), `${name} on-chain bytes`);

  const type = cell.cellOutput.type ?? fail(`${name} code cell has no Type ID script`);
  assertEqual(type.codeHash, TYPE_ID_CODE_HASH, `${name} Type ID code hash`);
  assertEqual(type.hashType, "type", `${name} Type ID hash type`);
  assertEqual(type.args, deployment.typeIdArgs, `${name} Type ID args`);
  assertEqual(type.hash(), deployment.codeHash, `${name} consumer code hash`);

  const lock = cell.cellOutput.lock;
  assertEqual(lock.codeHash, upgradeLock.codeHash, `${name} upgrade lock code hash`);
  assertEqual(lock.hashType, upgradeLock.hashType, `${name} upgrade lock hash type`);
  assertEqual(lock.args, upgradeLock.args, `${name} upgrade lock args`);
}

async function main(): Promise<void> {
  const recordPath = process.argv[2] ?? fileURLToPath(new URL("./testnet.json", import.meta.url));
  const record = parseDeploymentRecord(await Bun.file(recordPath).json());
  const rpcUrl = process.env.CKB_RPC_URL ?? "https://testnet.ckbapp.dev";
  const client = new ccc.ClientPublicTestnet({ url: rpcUrl });

  for (const name of Object.keys(CONTRACT_BINARIES) as ContractName[]) {
    const deployment = record.contracts[name];
    const transaction = await client.getTransaction(deployment.outPoint.txHash);
    if (transaction?.status !== "committed") {
      fail(`${name} deployment transaction is not committed`);
    }
    const cell = await client.getCellLive(deployment.outPoint, true);
    if (!cell) {
      fail(`${name} code cell is not live`);
    }
    const binary = new Uint8Array(await Bun.file(CONTRACT_BINARIES[name]).arrayBuffer());
    verifyDeploymentCell(name, deployment, record.upgradeLock, cell, binary);
    console.log(
      `${name}: verified ${deployment.binarySize} bytes at ${deployment.outPoint.txHash}:${deployment.outPoint.index}`,
    );
  }
}

if (import.meta.main) {
  await main();
}
