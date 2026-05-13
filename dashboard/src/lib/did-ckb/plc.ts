import { secp256k1 } from "@noble/curves/secp256k1";
import { p256 } from "@noble/curves/p256";

// Minimal did:plc helpers. We fetch operation logs from the public PLC
// directory and parse the genesis operation. The on-chain contract is happy
// with just the genesis (WIP-02 §3.1.1 explicitly RECOMMENDs history of
// length 1), so we don't walk the full op chain client-side; that's only
// needed if a holder wants to migrate using a non-genesis rotation key set.

const PLC_DIRECTORY = "https://plc.directory";

export type Curve = "secp256k1" | "p256";

export type PlcRotationKey = {
  didKey: string;
  curve: Curve;
  compressedPubkey: Uint8Array;
};

export type PlcOperation = {
  type: string;
  rotationKeys?: string[];
  verificationMethods?: Record<string, string>;
  alsoKnownAs?: string[];
  services?: Record<string, { type: string; endpoint: string }>;
  prev: string | null;
  sig: string;
  signingKey?: string;
  recoveryKey?: string;
  handle?: string;
  service?: string;
  [key: string]: unknown;
};

export async function fetchPlcLog(did: string): Promise<PlcOperation[]> {
  if (!did.startsWith("did:plc:")) {
    throw new Error(`Expected did:plc identifier, got "${did}"`);
  }
  const res = await fetch(`${PLC_DIRECTORY}/${did}/log`);
  if (!res.ok) {
    throw new Error(`PLC log fetch failed (${res.status} ${res.statusText})`);
  }
  const data: unknown = await res.json();
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error("PLC log empty or malformed");
  }
  return data as PlcOperation[];
}

export function getGenesisOperation(log: PlcOperation[]): PlcOperation {
  if (log.length === 0) throw new Error("Empty PLC log");
  return log[0];
}

// PLC genesis comes in two shapes: the modern plc_operation (with rotationKeys
// array) and the deprecated create (with signingKey + recoveryKey). The
// contract accepts both, treating the legacy form as rotationKeys = [signingKey,
// recoveryKey] in that order. We surface a uniform list to the UI.
export function getRotationKeys(op: PlcOperation): PlcRotationKey[] {
  const keys: string[] = [];
  if (op.rotationKeys?.length) {
    keys.push(...op.rotationKeys);
  } else if (op.signingKey || op.recoveryKey) {
    if (op.signingKey) keys.push(op.signingKey);
    if (op.recoveryKey) keys.push(op.recoveryKey);
  }
  return keys.map((didKey) => {
    const parsed = parseDidKey(didKey);
    return {
      didKey,
      curve: parsed.curve,
      compressedPubkey: parsed.compressedPubkey,
    };
  });
}

export function parseDidKey(didKey: string): {
  curve: Curve;
  compressedPubkey: Uint8Array;
} {
  if (!didKey.startsWith("did:key:z")) {
    throw new Error(`Expected did:key:z..., got "${didKey}"`);
  }
  const raw = base58btcDecode(didKey.slice("did:key:z".length));
  if (raw.length !== 35) {
    throw new Error(`did:key payload must be 35 bytes (2-byte tag + 33-byte compressed pubkey), got ${raw.length}`);
  }
  const tag1 = raw[0];
  const tag2 = raw[1];
  let curve: Curve;
  if (tag1 === 0xe7 && tag2 === 0x01) {
    curve = "secp256k1";
  } else if (tag1 === 0x80 && tag2 === 0x24) {
    curve = "p256";
  } else {
    throw new Error(
      `Unrecognised did:key multicodec tag: 0x${tag1.toString(16).padStart(2, "0")} 0x${tag2.toString(16).padStart(2, "0")}`,
    );
  }
  return { curve, compressedPubkey: raw.slice(2) };
}

// Sign a 32-byte CKB tx hash with the given PLC rotation private key. The
// signature MUST NOT prehash (the tx hash is already a 32-byte digest, see
// WIP-02 §3.1.1). Returned bytes are the canonical low-s compact 64-byte form.
export function signRotationHash(
  privateKeyHex: string,
  txHash: Uint8Array,
  curve: Curve,
): Uint8Array {
  if (txHash.length !== 32) {
    throw new Error(`Expected 32-byte tx hash, got ${txHash.length}`);
  }
  const privKey = hexToBytes(stripHexPrefix(privateKeyHex));
  if (privKey.length !== 32) {
    throw new Error(`Expected 32-byte private key, got ${privKey.length}`);
  }
  if (curve === "secp256k1") {
    const sig = secp256k1.sign(txHash, privKey, { prehash: false, lowS: true });
    return sig.toCompactRawBytes();
  }
  const sig = p256.sign(txHash, privKey, { prehash: false, lowS: true });
  return sig.toCompactRawBytes();
}

// Quick sanity check that the private key matches one of the genesis rotation
// keys. We derive the public key from the private and compare against the
// expected compressed pubkey. This is much friendlier than letting the
// on-chain script reject the signature later.
export function verifyPrivateKeyMatch(
  privateKeyHex: string,
  expectedPubkey: Uint8Array,
  curve: Curve,
): boolean {
  const priv = hexToBytes(stripHexPrefix(privateKeyHex));
  if (priv.length !== 32) return false;
  const pub =
    curve === "secp256k1"
      ? secp256k1.getPublicKey(priv, true)
      : p256.getPublicKey(priv, true);
  if (pub.length !== expectedPubkey.length) return false;
  for (let i = 0; i < pub.length; i++) {
    if (pub[i] !== expectedPubkey[i]) return false;
  }
  return true;
}

// Inline base58btc decode (Bitcoin alphabet) so we don't drag multiformats in
// as a direct dependency. ~30 lines, audited by usage in the test suite.
const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const BASE58_REVERSE: Record<string, number> = (() => {
  const m: Record<string, number> = {};
  for (let i = 0; i < BASE58_ALPHABET.length; i++) m[BASE58_ALPHABET[i]] = i;
  return m;
})();

function base58btcDecode(input: string): Uint8Array {
  if (input.length === 0) return new Uint8Array(0);
  let leadingOnes = 0;
  while (leadingOnes < input.length && input[leadingOnes] === "1") leadingOnes++;
  let value = 0n;
  for (let i = leadingOnes; i < input.length; i++) {
    const c = input[i];
    const v = BASE58_REVERSE[c];
    if (v === undefined) {
      throw new Error(`Invalid base58 character "${c}"`);
    }
    value = value * 58n + BigInt(v);
  }
  const tail: number[] = [];
  while (value > 0n) {
    tail.unshift(Number(value & 0xffn));
    value >>= 8n;
  }
  return Uint8Array.from([...Array<number>(leadingOnes).fill(0), ...tail]);
}

function stripHexPrefix(s: string): string {
  return s.startsWith("0x") || s.startsWith("0X") ? s.slice(2) : s;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim();
  if (clean.length % 2 !== 0) {
    throw new Error(`Hex string has odd length: ${clean.length}`);
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    const byte = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) {
      throw new Error(`Invalid hex at offset ${i * 2}: "${clean.slice(i * 2, i * 2 + 2)}"`);
    }
    out[i] = byte;
  }
  return out;
}
