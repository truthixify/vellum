import { ccc } from "@ckb-ccc/connector-react";

import { deploymentForClient, didCkbCellDep, didCkbTypeScript } from "./deployment";
import { argsToDid, computeDidArgs, didToArgs } from "./identifier";
import { DidCkbData } from "./molecule";
import {
  buildDocument,
  encodeDocument,
  type DidDocument,
  type VellumProfile,
  type Services,
  type VerificationMethods,
} from "./profile";
import { findDidCell } from "./resolver";

const PLACEHOLDER_ARGS = ("0x" + "00".repeat(20)) as ccc.Hex;

export type CreateTxResult = {
  tx: ccc.Transaction;
  did: string;
  args: ccc.Hex;
};

export type CreateTxInput = {
  profile?: VellumProfile;
  verificationMethods?: VerificationMethods;
  alsoKnownAs?: string[];
  services?: Services;
};

function encodeCellData(document: DidDocument, localId?: string | null): ccc.Hex {
  const encoded = DidCkbData.encode({
    type: "DidCkbDataV1",
    value: {
      document: encodeDocument(document),
      localId: localId ? ccc.hexFrom(new TextEncoder().encode(localId)) : undefined,
    },
  });
  return ccc.hexFrom(encoded);
}

// Create
//
// Per WIP-01 §3.2.1 the flow is:
//   1. caller supplies a document + lock that authorizes future updates
//   2. controller (this fn) builds a tx creating one DID Metadata Cell
//   3. type script args == BLAKE2b("ckb-default-hash", since||tx_hash||idx||out_idx)
//      truncated to 20 bytes. We can only compute it once inputs are picked,
//      so we run completeInputsByCapacity first, then fix the args, then fee.
export async function buildCreateTx(
  signer: ccc.Signer,
  input: CreateTxInput,
): Promise<CreateTxResult> {
  const client = signer.client;
  const deployment = deploymentForClient(client);
  const addressObj = await signer.getRecommendedAddressObj();
  const lock = addressObj.script;

  const document = buildDocument(input.profile ?? {}, {
    verificationMethods: input.verificationMethods,
    alsoKnownAs: input.alsoKnownAs,
    services: input.services,
  });
  const cellData = encodeCellData(document, null);

  const tx = ccc.Transaction.from({
    cellDeps: [didCkbCellDep(deployment)],
    inputs: [],
    outputs: [
      {
        capacity: 0,
        lock,
        type: didCkbTypeScript(deployment, PLACEHOLDER_ARGS),
      },
    ],
    outputsData: [cellData],
  });

  await tx.completeInputsByCapacity(signer);

  if (tx.inputs.length === 0) {
    throw new Error("No live cells available to fund the DID creation");
  }
  const args = computeDidArgs(tx.inputs[0], 0);
  if (!tx.outputs[0].type) {
    throw new Error("Type script missing on DID output");
  }
  tx.outputs[0].type.args = args;

  await tx.completeFeeBy(signer);

  return { tx, did: argsToDid(args), args };
}

// Update
//
// Per WIP-01 §3.4.2 the type script requires exactly one DID Metadata Cell
// consumed and one created with the same args. The contract does NOT check
// that the local_id is preserved on creation (only on update), but since we
// resolved the prior cell we keep whatever local_id it carries.
export type UpdateTxInput = {
  did: string;
  document: DidDocument;
  newLock?: ccc.ScriptLike;
};

export async function buildUpdateTx(
  signer: ccc.Signer,
  input: UpdateTxInput,
): Promise<ccc.Transaction> {
  const client = signer.client;
  const deployment = deploymentForClient(client);

  const args = didToArgs(input.did);
  const prior = await findDidCell(client, args);
  if (!prior) {
    throw new Error(`DID ${input.did} not found on chain`);
  }

  const localId = prior.localId ?? null;
  const localIdString = localId ? new TextDecoder().decode(ccc.bytesFrom(localId)) : null;
  const cellData = encodeCellData(input.document, localIdString);

  const newLock = input.newLock ?? prior.cell.cellOutput.lock;

  const tx = ccc.Transaction.from({
    cellDeps: [didCkbCellDep(deployment)],
    inputs: [
      {
        previousOutput: prior.cell.outPoint,
        since: 0n,
      },
    ],
    outputs: [
      {
        capacity: 0,
        lock: newLock,
        type: didCkbTypeScript(deployment, args),
      },
    ],
    outputsData: [cellData],
  });

  await tx.completeInputsByCapacity(signer);
  await tx.completeFeeBy(signer);

  return tx;
}

// Deactivate
//
// Per WIP-01 §3.5.2 we consume the DID Cell and produce no output bearing the
// same type id. We let CCC route the freed capacity (minus fee) back as change
// to the signer.
export async function buildDeactivateTx(
  signer: ccc.Signer,
  did: string,
): Promise<ccc.Transaction> {
  const client = signer.client;
  const args = didToArgs(did);
  const prior = await findDidCell(client, args);
  if (!prior) {
    throw new Error(`DID ${did} not found on chain`);
  }
  const deployment = deploymentForClient(client);

  const tx = ccc.Transaction.from({
    cellDeps: [didCkbCellDep(deployment)],
    inputs: [
      {
        previousOutput: prior.cell.outPoint,
        since: 0n,
      },
    ],
    outputs: [],
    outputsData: [],
  });

  await tx.completeFeeBy(signer);

  return tx;
}
