import { ccc } from "@ckb-ccc/connector-react";

// Mirrors contracts/did-ckb-ts/molecules/cell_data.mol:
//   table DidCkbDataV1 { document: Bytes, local_id: StringOpt }
//   union DidCkbData { DidCkbDataV1 }
// StringOpt is encoded identically to BytesOpt; the spec just guarantees the
// payload is UTF-8.
export const DidCkbDataV1 = ccc.mol.table({
  document: ccc.mol.Bytes,
  localId: ccc.mol.BytesOpt,
});

export const DidCkbData = ccc.mol.union({
  DidCkbDataV1,
});

// Mirrors contracts/did-ckb-ts/molecules/witness.mol:
//   table PlcAuthorization {
//     history: BytesVec,
//     sig: Bytes,
//     rotation_key_indices: Uint8Vec,
//   }
//   table DidCkbWitness { local_id_authorization: PlcAuthorization }
export const PlcAuthorization = ccc.mol.table({
  history: ccc.mol.BytesVec,
  sig: ccc.mol.Bytes,
  rotationKeyIndices: ccc.mol.Uint8Vec,
});

export const DidCkbWitness = ccc.mol.table({
  localIdAuthorization: PlcAuthorization,
});
