import { describe, expect, test } from "bun:test";

import {
  argsToDid,
  didToArgs,
  isDidCkb,
} from "./identifier";

const SAMPLE_ARGS = "0x8434cfe81aa825c275d513eee20e4235294e3420" as const;
const SAMPLE_DID = "did:ckb:qq2m72a2vas4e5ovcpxoedscguuu4nba" as const;

describe("identifier", () => {
  test("argsToDid produces the canonical 32-char base32 form", () => {
    expect(argsToDid(SAMPLE_ARGS)).toBe(SAMPLE_DID);
  });

  test("didToArgs is the inverse", () => {
    expect(didToArgs(SAMPLE_DID)).toBe(SAMPLE_ARGS);
  });

  test("round-trips for zero args", () => {
    const zeros: `0x${string}` = `0x${"00".repeat(20)}`;
    const did = argsToDid(zeros);
    expect(did).toBe(`did:ckb:${"a".repeat(32)}`);
    expect(didToArgs(did)).toBe(zeros);
  });

  test("argsToDid rejects args that aren't 20 bytes", () => {
    expect(() => argsToDid("0xdeadbeef")).toThrow();
    expect(() => argsToDid("0x" + "00".repeat(19))).toThrow();
    expect(() => argsToDid("0x" + "00".repeat(21))).toThrow();
  });

  test("didToArgs rejects non did:ckb prefixes", () => {
    expect(() => didToArgs("did:plc:bxvfvvygwbcnbmknn73t6pbu")).toThrow();
    expect(() => didToArgs(SAMPLE_DID.replace("did:ckb:", "did:web:"))).toThrow();
  });

  test("didToArgs rejects payloads of the wrong length", () => {
    expect(() => didToArgs("did:ckb:tooshort")).toThrow();
    expect(() => didToArgs(`did:ckb:${"a".repeat(33)}`)).toThrow();
  });

  test("isDidCkb is true only for well-formed did:ckb values", () => {
    expect(isDidCkb(SAMPLE_DID)).toBe(true);
    expect(isDidCkb("did:ckb:" + "a".repeat(32))).toBe(true);
    expect(isDidCkb("did:plc:bxvfvvygwbcnbmknn73t6pbu")).toBe(false);
    expect(isDidCkb("did:ckb:short")).toBe(false);
    expect(isDidCkb("not a did")).toBe(false);
    expect(isDidCkb("")).toBe(false);
  });
});
