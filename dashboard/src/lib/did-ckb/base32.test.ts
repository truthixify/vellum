import { describe, expect, test } from "bun:test";

import { base32Decode, base32Encode } from "./base32";

describe("base32", () => {
  test("encodes 20 zero bytes to 32 lowercase a's", () => {
    const zeros = new Uint8Array(20);
    expect(base32Encode(zeros)).toBe("a".repeat(32));
  });

  test("decodes 32 lowercase a's to 20 zero bytes", () => {
    const out = base32Decode("a".repeat(32));
    expect(out).toEqual(new Uint8Array(20));
  });

  test("is case-insensitive on decode", () => {
    const upper = base32Decode("AAAAAAAA");
    const lower = base32Decode("aaaaaaaa");
    expect(upper).toEqual(lower);
  });

  test("strips trailing padding", () => {
    const padded = base32Decode("aaaa====");
    const unpadded = base32Decode("aaaa");
    expect(padded).toEqual(unpadded);
  });

  test("encode then decode round-trips arbitrary bytes", () => {
    const sample = new Uint8Array([
      0x84, 0x34, 0xcf, 0xe8, 0x1a, 0xa8, 0x25, 0xc2, 0x75, 0xd5,
      0x13, 0xee, 0xe2, 0x0e, 0x42, 0x35, 0x29, 0x4e, 0x34, 0x20,
    ]);
    const encoded = base32Encode(sample);
    expect(encoded).toBe("qq2m72a2vas4e5ovcpxoedscguuu4nba");
    expect(base32Decode(encoded)).toEqual(sample);
  });

  test("decode rejects invalid characters", () => {
    expect(() => base32Decode("notbase32!!!")).toThrow();
  });

  test("encoding 1 byte uses 2 characters", () => {
    expect(base32Encode(new Uint8Array([0xff]))).toBe("74");
  });
});
