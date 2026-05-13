import { ccc } from "@ckb-ccc/connector-react";
import { base32Decode, base32Encode } from "./base32";

const DID_PREFIX = "did:ckb:";
const ARGS_LEN_BYTES = 20;

// Per WIP-01 §2.2:
//   args = first 20 bytes of BLAKE2b("ckb-default-hash",
//     since(8 LE) || prev_tx_hash(32) || prev_output_index(4 LE) || did_output_index(8 LE))
//   did:ckb:<base32-lowercase-no-padding>(args)
// CCC's hashTypeId() implements exactly that hash algorithm; we just truncate.
export function computeDidArgs(
  input: ccc.CellInputLike,
  didOutputIndex: ccc.NumLike,
): ccc.Hex {
  const fullHash = ccc.hashTypeId(input, didOutputIndex);
  return fullHash.slice(0, 2 + ARGS_LEN_BYTES * 2) as ccc.Hex;
}

export function argsToDid(args: ccc.HexLike): string {
  const bytes = ccc.bytesFrom(args);
  if (bytes.length !== ARGS_LEN_BYTES) {
    throw new Error(`did:ckb args must be ${ARGS_LEN_BYTES} bytes, got ${bytes.length}`);
  }
  return DID_PREFIX + base32Encode(bytes);
}

export function didToArgs(did: string): ccc.Hex {
  if (!did.startsWith(DID_PREFIX)) {
    throw new Error(`Expected did:ckb:..., got "${did}"`);
  }
  const bytes = base32Decode(did.slice(DID_PREFIX.length));
  if (bytes.length !== ARGS_LEN_BYTES) {
    throw new Error(
      `did:ckb identifier must decode to ${ARGS_LEN_BYTES} bytes, got ${bytes.length}`,
    );
  }
  return ccc.hexFrom(bytes);
}

export function isDidCkb(value: string): boolean {
  if (!value.startsWith(DID_PREFIX)) return false;
  try {
    didToArgs(value);
    return true;
  } catch {
    return false;
  }
}
