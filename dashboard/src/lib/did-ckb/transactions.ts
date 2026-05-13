import { ccc } from "@ckb-ccc/connector-react";
import * as dagCbor from "@ipld/dag-cbor";

import { deploymentForClient, didCkbCellDep, didCkbTypeScript } from "./deployment";
import { argsToDid, computeDidArgs, didToArgs } from "./identifier";
import { DidCkbData, DidCkbWitness } from "./molecule";
import {
  buildDocument,
  defaultAvatarUrl,
  encodeDocument,
  type DidDocument,
  type VellumProfile,
  type Services,
  type VerificationMethods,
} from "./profile";
import { findDidCell } from "./resolver";
import {
  parseDidKey,
  signRotationHash,
  verifyPrivateKeyMatch,
  type PlcOperation,
} from "./plc";

const PLACEHOLDER_ARGS = ("0x" + "00".repeat(20)) as ccc.Hex;

// Extra CKBytes locked on top of the absolute minimum cell capacity. Lets the
// holder grow the document (add handles, services, longer bio) on a future
// update without having to top up the cell. 200 bytes is enough for a few
// extra handles or one richer service entry.
const CAPACITY_RESERVE_CKB = "200";

// Compute the capacity (in shannons) required to mint a DID Metadata Cell of
// the given lock + type + data, plus the reserve. CCC's CellOutput.from()
// with an outputData argument auto-fills capacity = (occupiedSize +
// data.length) * 10^8 when capacity is 0; we then bump by the reserve.
function requiredCapacity(
  lock: ccc.ScriptLike,
  type: ccc.ScriptLike,
  data: ccc.Hex,
): bigint {
  const minOutput = ccc.CellOutput.from({ capacity: 0, lock, type }, data);
  return BigInt(minOutput.capacity) + BigInt(ccc.fixedPointFrom(CAPACITY_RESERVE_CKB));
}

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

  const profile = input.profile ?? {};
  // If no avatar provided, fill the default DiceBear URL keyed off the DID.
  // We can't know the DID until inputs are picked, so encode the document
  // with a placeholder DID-shaped string first; both URLs are identical
  // length so the cell's required capacity is identical. After
  // completeInputsByCapacity gives us inputs[0], we recompute the real
  // DID and re-encode the cell data in-place.
  const userSuppliedAvatar = profile.avatar !== undefined && profile.avatar.length > 0;
  const placeholderDid = argsToDid(PLACEHOLDER_ARGS);
  const initialProfile: VellumProfile = userSuppliedAvatar
    ? profile
    : { ...profile, avatar: defaultAvatarUrl(placeholderDid) };

  const document = buildDocument(initialProfile, {
    verificationMethods: input.verificationMethods,
    alsoKnownAs: input.alsoKnownAs,
    services: input.services,
  });
  const cellData = encodeCellData(document, null);
  const typeScript = didCkbTypeScript(deployment, PLACEHOLDER_ARGS);
  const capacity = requiredCapacity(lock, typeScript, cellData);

  const tx = ccc.Transaction.from({
    cellDeps: [didCkbCellDep(deployment)],
    inputs: [],
    outputs: [
      {
        capacity,
        lock,
        type: typeScript,
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
  const did = argsToDid(args);

  if (!userSuppliedAvatar) {
    const finalDocument = buildDocument(
      { ...profile, avatar: defaultAvatarUrl(did) },
      {
        verificationMethods: input.verificationMethods,
        alsoKnownAs: input.alsoKnownAs,
        services: input.services,
      },
    );
    tx.outputsData[0] = encodeCellData(finalDocument, null);
  }

  await tx.completeFeeBy(signer);

  return { tx, did, args };
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
  const typeScript = didCkbTypeScript(deployment, args);
  // Keep at least the prior capacity so the cell never shrinks below the
  // already-funded value; bump if the new data needs more.
  const minCapacity = requiredCapacity(newLock, typeScript, cellData);
  const capacity =
    BigInt(prior.cell.cellOutput.capacity) > minCapacity
      ? BigInt(prior.cell.cellOutput.capacity)
      : minCapacity;

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
        capacity,
        lock: newLock,
        type: typeScript,
      },
    ],
    outputsData: [cellData],
  });

  await tx.completeInputsByCapacity(signer);
  await tx.completeFeeBy(signer);

  return tx;
}

// Migration from did:plc (WIP-02)
//
// Implements the recommended single-genesis-operation path (WIP-02 §3.1.1):
// witness carries just the PLC genesis op + a signature over the CKB tx hash
// by one of the genesis rotation keys. The contract walks the (length-1)
// history, verifies the genesis's self-signature, then verifies the final
// signature against rotation_key_indices[1].

export type MigrationInput = {
  sourceDid: string;
  genesisOperation: PlcOperation;
  rotationKeyIndex: number;
  rotationPrivateKeyHex: string;
  profile?: VellumProfile;
  verificationMethods?: VerificationMethods;
  alsoKnownAs?: string[];
  services?: Services;
};

export async function buildMigrationTx(
  signer: ccc.Signer,
  input: MigrationInput,
): Promise<CreateTxResult> {
  if (!input.sourceDid.startsWith("did:plc:")) {
    throw new Error(`sourceDid must be did:plc:..., got "${input.sourceDid}"`);
  }

  const rotationKeys =
    input.genesisOperation.rotationKeys ??
    [input.genesisOperation.signingKey, input.genesisOperation.recoveryKey].filter(
      (k): k is string => typeof k === "string",
    );
  if (!rotationKeys[input.rotationKeyIndex]) {
    throw new Error(
      `rotationKeyIndex ${input.rotationKeyIndex} out of range (genesis has ${rotationKeys.length} keys)`,
    );
  }

  const chosenDidKey = rotationKeys[input.rotationKeyIndex];
  const parsed = parseDidKey(chosenDidKey);
  if (!verifyPrivateKeyMatch(input.rotationPrivateKeyHex, parsed.compressedPubkey, parsed.curve)) {
    throw new Error(
      "Private key does not match the selected rotation key's public key. Double-check the curve and the hex bytes.",
    );
  }

  const client = signer.client;
  const deployment = deploymentForClient(client);
  const addressObj = await signer.getRecommendedAddressObj();
  const lock = addressObj.script;

  const profile = input.profile ?? {};
  const userSuppliedAvatar = profile.avatar !== undefined && profile.avatar.length > 0;
  const placeholderDid = argsToDid(PLACEHOLDER_ARGS);
  const initialProfile: VellumProfile = userSuppliedAvatar
    ? profile
    : { ...profile, avatar: defaultAvatarUrl(placeholderDid) };

  const document = buildDocument(initialProfile, {
    verificationMethods: input.verificationMethods,
    alsoKnownAs: input.alsoKnownAs,
    services: input.services,
  });
  const cellData = encodeCellData(document, input.sourceDid);
  const typeScript = didCkbTypeScript(deployment, PLACEHOLDER_ARGS);
  const capacity = requiredCapacity(lock, typeScript, cellData);

  const tx = ccc.Transaction.from({
    cellDeps: [didCkbCellDep(deployment)],
    inputs: [],
    outputs: [
      {
        capacity,
        lock,
        type: typeScript,
      },
    ],
    outputsData: [cellData],
  });

  await tx.completeInputsByCapacity(signer);
  if (tx.inputs.length === 0) {
    throw new Error("No live cells available to fund the migration");
  }

  const args = computeDidArgs(tx.inputs[0], 0);
  if (!tx.outputs[0].type) {
    throw new Error("Type script missing on migration output");
  }
  tx.outputs[0].type.args = args;
  const did = argsToDid(args);

  if (!userSuppliedAvatar) {
    const finalDocument = buildDocument(
      { ...profile, avatar: defaultAvatarUrl(did) },
      {
        verificationMethods: input.verificationMethods,
        alsoKnownAs: input.alsoKnownAs,
        services: input.services,
      },
    );
    tx.outputsData[0] = encodeCellData(finalDocument, input.sourceDid);
  }

  // The witness has to be set BEFORE completeFeeBy because that helper may
  // size the fee against witness bytes. Plant a placeholder with the same
  // byte shape (history + 64-byte sig + 2 indices) so size estimation is
  // accurate, then replace the sig after we know the tx hash.
  const genesisCbor = encodeGenesisOp(input.genesisOperation);
  const placeholderSig = new Uint8Array(64);
  setMigrationWitness(tx, genesisCbor, placeholderSig, input.rotationKeyIndex);

  await tx.completeFeeBy(signer);

  const txHashHex = tx.hash();
  const txHashBytes = ccc.bytesFrom(txHashHex);
  const realSig = signRotationHash(input.rotationPrivateKeyHex, txHashBytes, parsed.curve);
  setMigrationWitness(tx, genesisCbor, realSig, input.rotationKeyIndex);

  return { tx, did, args };
}

function encodeGenesisOp(op: PlcOperation): ccc.Hex {
  // DAG-CBOR canonical encoding. The contract recomputes the CID over this
  // exact byte sequence, so any mismatch in field ordering means signature
  // failure. @ipld/dag-cbor sorts keys deterministically.
  return ccc.hexFrom(dagCbor.encode(op as unknown as Record<string, unknown>));
}

function setMigrationWitness(
  tx: ccc.Transaction,
  genesisOpCbor: ccc.Hex,
  sig: Uint8Array,
  finalKeyIndex: number,
): void {
  const didCkbWitnessBytes = DidCkbWitness.encode({
    localIdAuthorization: {
      history: [genesisOpCbor],
      sig: ccc.hexFrom(sig),
      // [genesis_self_sig_key_index, final_sig_key_index].
      // We default to 0 for the self-sig because PLC genesis ops are
      // conventionally self-signed with the first rotation key; the contract
      // will reject if the on-chain validator finds otherwise.
      rotationKeyIndices: [0, finalKeyIndex],
    },
  });
  const witnessArgs = ccc.WitnessArgs.from({
    outputType: ccc.hexFrom(didCkbWitnessBytes),
  });
  tx.setWitnessArgsAt(0, witnessArgs);
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
