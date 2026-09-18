import { expect, test } from "bun:test";
import { ccc } from "@ckb-ccc/core";

import deployment from "../../../deployments/testnet.json";
import { readClaims } from "../src";

const FIXTURE = {
  txHash: "0x9e32511bcaa49d89421d070d28eded7168fa9010a007659151e7f8928caff91c",
  issuerDid: "did:ckb:fn7u37m7vwerr4ojysgdwwp4mescjtrp",
  issuerId: "0x2b7f4dfd9fad8918f1c9c48c3b59fc612424ce2f",
  claimOutputIndex: 1n,
  claimId: "0xbb3f7a46f7aef44dd53c2cd8f863fd39f046242f3453416219b7a9e47cdd3b5e",
  subjectLockHash: "0x8d00643a80a7e397f25a0cf16374d5bde394d63c82a966ef0914f43db196fbec",
  schemaHash: "0xee63f8c811694ae206a49b681dfd336caa92b27384284398124e7b53f92d5f2b",
  schemaManifest:
    '{"fields":{"fixture":{"type":"string"},"network":{"type":"string"},"version":{"type":"integer"}},"name":"vellum.sdk.read-claims.fixture","version":1}',
  nonce: "0xde80a26a4458dcaa1fee2b002c174359da92c0e30739aef98446d64a30005b34",
  issuedAt: 1_789_764_803n,
  payload: {
    fixture: "readClaims",
    network: "ckb_testnet",
    version: 1,
  },
} as const;

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

test("reads the known Claim Cell from CKB Testnet", async () => {
  expect(ccc.hashCkb(new TextEncoder().encode(FIXTURE.schemaManifest))).toBe(FIXTURE.schemaHash);

  const client = new ccc.ClientPublicTestnet({
    url: process.env.CKB_RPC_URL ?? "https://testnet.ckbapp.dev",
  });
  const result = await readClaims({
    client,
    scripts: {
      claimType: scriptInfo(deployment.contracts.claimType),
      didLock: scriptInfo(deployment.contracts.didLock),
    },
    filter: {
      subject: { did: FIXTURE.issuerDid },
      issuerDid: FIXTURE.issuerDid,
      schemaHash: FIXTURE.schemaHash,
      evaluationTime: FIXTURE.issuedAt,
    },
  });

  expect(result.invalid).toEqual([]);
  const claim = result.claims.find(
    ({ cell }) =>
      cell.outPoint.txHash === FIXTURE.txHash && cell.outPoint.index === FIXTURE.claimOutputIndex,
  );
  expect(claim).toBeDefined();
  expect(claim).toMatchObject({
    claimId: FIXTURE.claimId,
    issuerDid: FIXTURE.issuerDid,
    issuerId: FIXTURE.issuerId,
    subjectLockHash: FIXTURE.subjectLockHash,
    schemaHash: FIXTURE.schemaHash,
    nonce: FIXTURE.nonce,
    issuedAt: FIXTURE.issuedAt,
    payload: FIXTURE.payload,
    verification: {
      inclusion: "live",
      issuerAuthorization: "accepted-by-configured-claim-type",
      time: { status: "active", evaluatedAt: FIXTURE.issuedAt },
    },
    issuerState: { status: "active" },
  });

  if (claim?.issuerState.status !== "active") {
    throw new Error("Known fixture issuer is not active");
  }
  expect(claim.issuerState.cell.outPoint).toEqual(
    ccc.OutPoint.from({ txHash: FIXTURE.txHash, index: 0 }),
  );
}, 30_000);
