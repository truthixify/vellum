import { expect, test } from "bun:test";
import { ccc } from "@ckb-ccc/core";

import deployment from "../../../deployments/testnet.json";
import { readClaims, writeClaim } from "../src";

const FIXTURE = {
  txHash: "0xbbe64d73351dbe0faa617f8d5ac0d9624845c329e1d5d7b722a90456cfea4142",
  blockNumber: 22_463_019n,
  issuerDid: "did:ckb:fn7u37m7vwerr4ojysgdwwp4mescjtrp",
  issuerId: "0x2b7f4dfd9fad8918f1c9c48c3b59fc612424ce2f",
  issuerPublicKey: "0x026d11d65c41198c8981f649f262da9fefb2d6501c5e826d24b75bb4b9e2689ec2",
  claimOutputIndex: 0n,
  claimId: "0x512256b75fe9136b5f705bd5fb3b2763c82d6a83bb9ee6bedb72ffa7ee76a0d0",
  subjectLockHash: "0x8d00643a80a7e397f25a0cf16374d5bde394d63c82a966ef0914f43db196fbec",
  schemaHash: "0x46eb45722c74d6724620113a50256ca52d7e47b033da291ac6eacab1cb525de8",
  schemaManifest:
    '{"fields":{"fixture":{"type":"string"},"network":{"type":"string"},"version":{"type":"integer"}},"name":"vellum.sdk.write-claim.fixture","version":1}',
  nonce: "0xd4effb1eb17203bed093ad90b428e6dde73d350fa70d5bf28845ae9c0767e042",
  issuedAt: 1_789_769_035n,
  capacity: 31_200_000_000n,
  payload: {
    fixture: "writeClaim",
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

function scripts() {
  return {
    claimType: scriptInfo(deployment.contracts.claimType),
    didLock: scriptInfo(deployment.contracts.didLock),
  };
}

test("reads the Claim Cell written through writeClaim on CKB Testnet", async () => {
  expect(ccc.hashCkb(new TextEncoder().encode(FIXTURE.schemaManifest))).toBe(FIXTURE.schemaHash);

  const client = new ccc.ClientPublicTestnet({
    url: process.env.CKB_RPC_URL ?? "https://testnet.ckbapp.dev",
  });
  const transaction = await client.getTransaction(FIXTURE.txHash);
  expect(transaction?.status).toBe("committed");
  expect(transaction?.blockNumber).toBe(FIXTURE.blockNumber);
  expect(transaction?.transaction.outputs[Number(FIXTURE.claimOutputIndex)].capacity).toBe(
    FIXTURE.capacity,
  );

  const result = await readClaims({
    client,
    scripts: scripts(),
    filter: {
      subject: { did: FIXTURE.issuerDid },
      issuerDid: FIXTURE.issuerDid,
      schemaHash: FIXTURE.schemaHash,
      evaluationTime: FIXTURE.issuedAt,
    },
  });
  expect(
    result.invalid.find(
      ({ cell }) =>
        cell.outPoint.txHash === FIXTURE.txHash && cell.outPoint.index === FIXTURE.claimOutputIndex,
    ),
  ).toBeUndefined();
  const claim = result.claims.find(
    ({ cell }) =>
      cell.outPoint.txHash === FIXTURE.txHash && cell.outPoint.index === FIXTURE.claimOutputIndex,
  );
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
}, 30_000);

test("prepares a read-only writeClaim transaction against current Testnet state", async () => {
  const client = new ccc.ClientPublicTestnet({
    url: process.env.CKB_RPC_URL ?? "https://testnet.ckbapp.dev",
  });
  const signer = new ccc.SignerCkbPublicKey(client, FIXTURE.issuerPublicKey);
  const built = await writeClaim({
    issuerSigner: signer,
    scripts: scripts(),
    input: {
      subject: { did: FIXTURE.issuerDid },
      issuerDid: FIXTURE.issuerDid,
      schemaHash: FIXTURE.schemaHash,
      payload: FIXTURE.payload,
      issuedAt: FIXTURE.issuedAt,
      nonce: "0xa14be454ee0ea39d66a761bdee18d76f2b0fa814c312345731417869bfd25126",
    },
  });

  expect(built.issuerSource.kind).toBe("cell-dep");
  expect(built.tx.outputs[built.outputIndex].capacity).toBe(FIXTURE.capacity);
  expect(built.tx.outputs[built.outputIndex].lock.hash()).toBe(FIXTURE.subjectLockHash);
  expect(await built.tx.getInputsCapacity(client)).toBeGreaterThanOrEqual(
    built.tx.getOutputsCapacity(),
  );
}, 30_000);
