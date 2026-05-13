// RFC 4648 base32, lowercase, no padding, per WIP-01 §2.2.3.

const ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";
const REVERSE = (() => {
  const map: Record<string, number> = {};
  for (let i = 0; i < ALPHABET.length; i++) map[ALPHABET[i]] = i;
  return map;
})();

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8) | bytes[i];
    bits += 8;
    while (bits >= 5) {
      output += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

export function base32Decode(input: string): Uint8Array {
  const cleaned = input.toLowerCase().replace(/=+$/g, "");
  let bits = 0;
  let value = 0;
  const output: number[] = [];
  for (const char of cleaned) {
    const v = REVERSE[char];
    if (v === undefined) {
      throw new Error(`Invalid base32 character "${char}" in input`);
    }
    value = (value << 5) | v;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Uint8Array.from(output);
}
