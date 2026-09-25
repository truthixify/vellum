import { ccc } from "@ckb-ccc/core";

export const CLAIM_TYPE_ARGS_LENGTH = 65;
export const MAX_CLAIM_DATA_LENGTH = 16 * 1024;
export const MAX_UINT64 = (1n << 64n) - 1n;

const CLAIM_ID_DOMAIN = "0x56454c4c554d5f434c41494d5f563100" satisfies ccc.Hex;

export function requireByteLength(value: ccc.HexLike, byteLength: number, field: string): ccc.Hex {
  const bytes = ccc.bytesFrom(value);
  if (bytes.length !== byteLength) {
    throw new Error(`${field} must be ${byteLength} bytes, got ${bytes.length}`);
  }
  return ccc.hexFrom(bytes);
}

export function claimId(
  type: ccc.Script,
  subjectLock: ccc.Script,
  outputData: ccc.HexLike,
): ccc.Hex {
  return ccc.hashCkb(CLAIM_ID_DOMAIN, type.hash(), subjectLock.hash(), outputData);
}
