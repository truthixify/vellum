import { ccc } from "@ckb-ccc/core";
import {
  argsToDid,
  createDidCkb,
  destroyDidCkb,
  DidCkbData,
  DidCkbWitness,
  didToArgs,
  migrateDidCkb,
  transferDidCkb,
} from "@ckb-ccc/did-ckb";
import {
  parseDidKey,
  signRotationHash,
  verifyPrivateKeyMatch,
  type PlcOperation,
} from "@ckb-ccc/did-ckb/plc";

import {
  buildDocument,
  defaultAvatarUrl,
  type DidDocument,
  type Services,
  type VellumProfile,
  type VerificationMethods,
} from "./profile";
import { findDidCell } from "./resolver";

const PLACEHOLDER_ARGS = ("0x" + "00".repeat(20)) as ccc.Hex;

// Extra CKBytes locked on top of the absolute minimum cell capacity. Lets the
// holder grow the document (add handles, services, longer bio) on a future
// update without having to top up the cell. 200 bytes is enough for a few
// extra handles or one richer service entry.
const CAPACITY_RESERVE_CKB = "200";
const CAPACITY_RESERVE = ccc.fixedPointFrom(CAPACITY_RESERVE_CKB);

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

// Create
//
// Per WIP-01 §3.2.1 the flow is:
//   1. caller supplies a document + lock that authorizes future updates
//   2. controller (this fn) builds a tx creating one DID Metadata Cell
//   3. type script args == hashTypeId(input[0], out_index) truncated to 20 bytes
//
// Upstream `createDidCkb` picks the first funding input and computes the args
// from it, then adds the DID output with the initial data (its codec CBOR-
// encodes the document). We then: bump capacity by the Vellum reserve,
// optionally rewrite outputData so the default avatar URL is keyed off the
// real DID (both URLs are same length so capacity and fee stay valid),
// complete inputs to cover capacity, complete fee. The caller signs and
// submits via `signer.sendTransaction(tx)`.
export async function buildCreateTx(
  signer: ccc.Signer,
  input: CreateTxInput,
): Promise<CreateTxResult> {
  const profile = input.profile ?? {};
  const userSuppliedAvatar = profile.avatar !== undefined && profile.avatar.length > 0;

  const placeholderDid = argsToDid(PLACEHOLDER_ARGS);
  const initialProfile: VellumProfile = userSuppliedAvatar
    ? profile
    : { ...profile, avatar: defaultAvatarUrl(placeholderDid) };

  const initialDoc = buildDocument(initialProfile, {
    verificationMethods: input.verificationMethods,
    alsoKnownAs: input.alsoKnownAs,
    services: input.services,
  });

  const result = await createDidCkb({
    signer,
    data: {
      type: "v1",
      value: {
        document: initialDoc,
      },
    },
  });

  const did = argsToDid(result.id);

  if (!userSuppliedAvatar) {
    const finalDoc = buildDocument(
      { ...profile, avatar: defaultAvatarUrl(did) },
      {
        verificationMethods: input.verificationMethods,
        alsoKnownAs: input.alsoKnownAs,
        services: input.services,
      },
    );
    replaceCellData(result.tx, result.index, finalDoc, null);
  }

  bumpCapacity(result.tx, result.index, CAPACITY_RESERVE);

  await result.tx.completeInputsByCapacity(signer);
  await result.tx.completeFeeBy(signer);

  return { tx: result.tx, did, args: result.id };
}

// Update
//
// Preserves the prior cell's localId. Upstream `transferDidCkb` picks up the
// existing cell and applies the new data + lock; we handle fee completion.
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
  const args = didToArgs(input.did);
  const prior = await findDidCell(client, args);
  if (!prior) {
    throw new Error(`DID ${input.did} not found on chain`);
  }

  const receiver = input.newLock ?? prior.cell.cellOutput.lock;

  const result = await transferDidCkb({
    client,
    id: args,
    receiver,
    data: {
      type: "v1",
      value: {
        document: input.document,
        localId: prior.localId ?? undefined,
      },
    },
  });

  // If the new data is longer than the old, bump capacity so the output meets
  // the minimum required. completeInputsByCapacity then adds funding.
  const outIdx = result.outIndex;
  const output = result.tx.outputs[outIdx];
  const outData = result.tx.outputsData[outIdx];
  const minCapacity = ccc.CellOutput.from(
    { capacity: 0, lock: output.lock, type: output.type },
    outData,
  ).capacity;
  if (BigInt(output.capacity) < BigInt(minCapacity)) {
    output.capacity = minCapacity;
  }

  await result.tx.completeInputsByCapacity(signer);
  await result.tx.completeFeeBy(signer);

  return result.tx;
}

// Migration from did:plc (WIP-02)
//
// Implements the recommended single-genesis-operation path (WIP-02 §3.1.1):
// witness carries the PLC genesis op + a signature over the CKB tx hash by
// one of the genesis rotation keys.
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

  const profile = input.profile ?? {};
  const userSuppliedAvatar = profile.avatar !== undefined && profile.avatar.length > 0;

  const placeholderDid = argsToDid(PLACEHOLDER_ARGS);
  const initialProfile: VellumProfile = userSuppliedAvatar
    ? profile
    : { ...profile, avatar: defaultAvatarUrl(placeholderDid) };
  const initialDoc = buildDocument(initialProfile, {
    verificationMethods: input.verificationMethods,
    alsoKnownAs: input.alsoKnownAs,
    services: input.services,
  });

  const result = await migrateDidCkb({
    signer,
    sourceDid: input.sourceDid,
    data: {
      type: "v1",
      value: {
        document: initialDoc,
        localId: input.sourceDid,
      },
    },
  });

  const did = argsToDid(result.id);

  if (!userSuppliedAvatar) {
    const finalDoc = buildDocument(
      { ...profile, avatar: defaultAvatarUrl(did) },
      {
        verificationMethods: input.verificationMethods,
        alsoKnownAs: input.alsoKnownAs,
        services: input.services,
      },
    );
    replaceCellData(result.tx, result.index, finalDoc, input.sourceDid);
  }

  bumpCapacity(result.tx, result.index, CAPACITY_RESERVE);

  // Placeholder witness first so fee estimation sees the real witness size;
  // real sig gets written after fee completes and we know the final tx hash.
  const placeholderSig = new Uint8Array(64);
  setMigrationWitness(result.tx, input.genesisOperation, placeholderSig, input.rotationKeyIndex);

  await result.tx.completeInputsByCapacity(signer);
  await result.tx.completeFeeBy(signer);

  const txHashHex = result.tx.hash();
  const txHashBytes = ccc.bytesFrom(txHashHex);
  const realSig = signRotationHash(input.rotationPrivateKeyHex, txHashBytes, parsed.curve);
  setMigrationWitness(result.tx, input.genesisOperation, realSig, input.rotationKeyIndex);

  return { tx: result.tx, did, args: result.id };
}

function replaceCellData(
  tx: ccc.Transaction,
  outputIdx: number,
  document: DidDocument,
  localId: string | null,
): void {
  tx.outputsData[outputIdx] = ccc.hexFrom(
    DidCkbData.encode({
      type: "v1",
      value: {
        document,
        localId: localId ?? undefined,
      },
    }),
  );
}

function setMigrationWitness(
  tx: ccc.Transaction,
  genesisOp: PlcOperation,
  sig: Uint8Array,
  finalKeyIndex: number,
): void {
  const didCkbWitnessBytes = DidCkbWitness.encode({
    localIdAuthorization: {
      history: [genesisOp as unknown as object],
      sig: ccc.hexFrom(sig),
      // [genesis_self_sig_key_index, final_sig_key_index]. Default 0 for the
      // self-sig because PLC genesis ops are conventionally self-signed with
      // the first rotation key; the contract rejects otherwise.
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
// same type id. Freed capacity flows back to the signer via completeFeeBy.
export async function buildDeactivateTx(signer: ccc.Signer, did: string): Promise<ccc.Transaction> {
  const client = signer.client;
  const args = didToArgs(did);
  const result = await destroyDidCkb({ client, id: args });
  await result.tx.completeFeeBy(signer);
  return result.tx;
}

function bumpCapacity(tx: ccc.Transaction, outputIdx: number, reserve: bigint): void {
  const output = tx.outputs[outputIdx];
  output.capacity = BigInt(output.capacity) + reserve;
}
