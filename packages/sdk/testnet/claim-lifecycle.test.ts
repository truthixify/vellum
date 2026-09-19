import { expect, test } from "bun:test";
import { ccc } from "@ckb-ccc/core";

import deployment from "../../../deployments/testnet.json";
import { ClaimData, readClaims } from "../src";

const CLAIM_ID_DOMAIN = "0x56454c4c554d5f434c41494d5f563100" satisfies ccc.Hex;

const FIXTURE = {
  schemaManifest:
    '{"fields":{"fixture":{"type":"string"},"network":{"type":"string"},"version":{"type":"integer"}},"name":"vellum.sdk.lifecycle.fixture","version":1}',
  schemaHash: "0xdacbb201a3fa94158d373b9c9001c944d5226564776401af0a2d821e277c2791",
  subjectDid: "did:ckb:fn7u37m7vwerr4ojysgdwwp4mescjtrp",
  subjectIdentityOutPoint: {
    txHash: "0x9e32511bcaa49d89421d070d28eded7168fa9010a007659151e7f8928caff91c",
    index: 0n,
  },
  subjectLockHash: "0x8d00643a80a7e397f25a0cf16374d5bde394d63c82a966ef0914f43db196fbec",
  controllerLockHash: "0x5290a9a3aa411b0b81990310316d086972f285dad4bba7448a55b0021df65d03",
  issuerDid: "did:ckb:hlvxrdt3e7iwvuxdmbvejp6hc4yoo3no",
  issuerId: "0x3aeb788e7b27d16ad2e3606a44bfc71730e76dae",
  crossIssuer: {
    txHash: "0xdd3ba6f4574568df0f82a1a9201598da697ff4ce28b3b1cc7a28289ef2319cb3",
    blockNumber: 22_463_641n,
    outputIndex: 1n,
    claimId: "0xc55af9c00ff7a157425586456edb2c2fc94c840e665dfdba061b99f89bc4a694",
    nonce: "0x79f2879a20e60f766ab54423a8286a44ec68006f64398525e612f0d849d46c38",
    issuedAt: 1_789_774_145n,
    capacity: 31_400_000_000n,
    payload: { fixture: "cross-issuer", network: "ckb_testnet", version: 1 },
  },
  reclaim: {
    creationTxHash: "0x6003e4e13d757a02003cc23d156f100ff351ca28f0d67df7f04bf71d18255640",
    creationBlockNumber: 22_463_646n,
    outputIndex: 0n,
    claimId: "0x59af15603f373aa6c2a471e731b8c6dfe8ced328d4355cbbad4e5b1f32d85ad4",
    nonce: "0x48d5f307512879980f65cd582c761b213a62513ce01f7802cad58869a317173e",
    issuedAt: 1_789_774_146n,
    capacity: 31_700_000_000n,
    payload: { fixture: "destroy-reclaim", network: "ckb_testnet", version: 1 },
    spendTxHash: "0x647a5253321acb45e8aa07195f0414678831f955610bdfcce59efa1107638816",
    spendBlockNumber: 22_463_649n,
    fee: 17_209n,
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

test("reads a live claim issued to a different did:ckb subject", async () => {
  expect(FIXTURE.issuerDid).not.toBe(FIXTURE.subjectDid);
  expect(ccc.hashCkb(new TextEncoder().encode(FIXTURE.schemaManifest))).toBe(FIXTURE.schemaHash);

  const client = new ccc.ClientPublicTestnet({
    url: process.env.CKB_RPC_URL ?? "https://testnet.ckbapp.dev",
  });
  const transaction = await client.getTransaction(FIXTURE.crossIssuer.txHash);
  expect(transaction?.status).toBe("committed");
  expect(transaction?.blockNumber).toBe(FIXTURE.crossIssuer.blockNumber);
  expect(transaction?.transaction.hash()).toBe(FIXTURE.crossIssuer.txHash);
  expect(transaction?.transaction.outputs[Number(FIXTURE.crossIssuer.outputIndex)].capacity).toBe(
    FIXTURE.crossIssuer.capacity,
  );

  const result = await readClaims({
    client,
    scripts: scripts(),
    filter: {
      subject: { did: FIXTURE.subjectDid },
      issuerDid: FIXTURE.issuerDid,
      schemaHash: FIXTURE.schemaHash,
      evaluationTime: FIXTURE.crossIssuer.issuedAt,
    },
  });

  expect(result.invalid).toEqual([]);
  expect(result.claims).toHaveLength(1);
  expect(result.claims[0]).toMatchObject({
    claimId: FIXTURE.crossIssuer.claimId,
    issuerDid: FIXTURE.issuerDid,
    issuerId: FIXTURE.issuerId,
    subjectLockHash: FIXTURE.subjectLockHash,
    schemaHash: FIXTURE.schemaHash,
    nonce: FIXTURE.crossIssuer.nonce,
    issuedAt: FIXTURE.crossIssuer.issuedAt,
    payload: FIXTURE.crossIssuer.payload,
    issuerState: { status: "active" },
    verification: {
      inclusion: "live",
      issuerAuthorization: "accepted-by-configured-claim-type",
      time: { status: "active", evaluatedAt: FIXTURE.crossIssuer.issuedAt },
    },
  });
  expect(result.claims[0].claimId).not.toBe(FIXTURE.reclaim.claimId);

  const issuerState = result.claims[0].issuerState;
  if (issuerState.status !== "active") {
    throw new Error("Cross-issuer fixture DID is not active");
  }
  expect(issuerState.cell.outPoint).toEqual(
    ccc.OutPoint.from({ txHash: FIXTURE.crossIssuer.txHash, index: 0 }),
  );
}, 30_000);

test("proves Claim Cell destruction and capacity recovery", async () => {
  const client = new ccc.ClientPublicTestnet({
    url: process.env.CKB_RPC_URL ?? "https://testnet.ckbapp.dev",
  });
  const [creation, spend, liveCell] = await Promise.all([
    client.getTransaction(FIXTURE.reclaim.creationTxHash),
    client.getTransaction(FIXTURE.reclaim.spendTxHash),
    client.getCellLiveNoCache(
      { txHash: FIXTURE.reclaim.creationTxHash, index: FIXTURE.reclaim.outputIndex },
      true,
      true,
    ),
  ]);

  expect(creation?.status).toBe("committed");
  expect(creation?.blockNumber).toBe(FIXTURE.reclaim.creationBlockNumber);
  expect(creation?.transaction.hash()).toBe(FIXTURE.reclaim.creationTxHash);
  expect(spend?.status).toBe("committed");
  expect(spend?.blockNumber).toBe(FIXTURE.reclaim.spendBlockNumber);
  expect(spend?.transaction.hash()).toBe(FIXTURE.reclaim.spendTxHash);
  expect(liveCell).toBeUndefined();
  if (!creation || !spend) {
    throw new Error("Claim lifecycle fixture transactions are unavailable");
  }

  const claimOutPoint = ccc.OutPoint.from({
    txHash: FIXTURE.reclaim.creationTxHash,
    index: FIXTURE.reclaim.outputIndex,
  });
  const claimOutput = creation.transaction.outputs[Number(FIXTURE.reclaim.outputIndex)];
  const claimData = creation.transaction.outputsData[Number(FIXTURE.reclaim.outputIndex)];
  const controllerOutput = creation.transaction.outputs[1];
  const claimType = ccc.ScriptInfo.from(scriptInfo(deployment.contracts.claimType));
  expect(claimOutput.capacity).toBe(FIXTURE.reclaim.capacity);
  expect(claimOutput.lock.hash()).toBe(FIXTURE.subjectLockHash);
  expect(claimOutput.type).toBeDefined();
  expect(claimOutput.type?.codeHash).toBe(claimType.codeHash);
  expect(claimOutput.type?.hashType).toBe(claimType.hashType);
  expect(ccc.hexFrom(ccc.bytesFrom(claimOutput.type!.args).slice(33))).toBe(FIXTURE.schemaHash);
  expect(
    ccc.hashCkb(CLAIM_ID_DOMAIN, claimOutput.type!.hash(), claimOutput.lock.hash(), claimData),
  ).toBe(FIXTURE.reclaim.claimId);
  expect(ClaimData.decode(claimData).value).toMatchObject({
    issuerId: FIXTURE.issuerId,
    nonce: FIXTURE.reclaim.nonce,
    issuedAt: FIXTURE.reclaim.issuedAt,
    payload: FIXTURE.reclaim.payload,
  });
  expect(spend.transaction.inputs[0].previousOutput).toEqual(claimOutPoint);
  expect(spend.transaction.inputs[1].previousOutput).toEqual(
    ccc.OutPoint.from({ txHash: FIXTURE.reclaim.creationTxHash, index: 1 }),
  );
  expect(controllerOutput.type).toBeUndefined();
  expect(controllerOutput.lock.hash()).toBe(FIXTURE.controllerLockHash);

  expect(spend.transaction.outputs).toHaveLength(1);
  expect(spend.transaction.outputs[0].type).toBeUndefined();
  expect(spend.transaction.outputs[0].lock.hash()).toBe(FIXTURE.controllerLockHash);

  const inputCapacity = claimOutput.capacity + controllerOutput.capacity;
  const outputCapacity = spend.transaction.getOutputsCapacity();
  expect(inputCapacity - outputCapacity).toBe(FIXTURE.reclaim.fee);
  expect(outputCapacity - controllerOutput.capacity).toBe(
    claimOutput.capacity - FIXTURE.reclaim.fee,
  );

  const requiredDeps = [
    FIXTURE.subjectIdentityOutPoint,
    deployment.contracts.claimType.outPoint,
    deployment.contracts.didLock.outPoint,
  ].map((outPoint) => ccc.OutPoint.from(outPoint));
  for (const required of requiredDeps) {
    expect(
      spend.transaction.cellDeps.some(
        ({ outPoint, depType }) => depType === "code" && outPoint.eq(required),
      ),
    ).toBe(true);
  }
}, 30_000);
