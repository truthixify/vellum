import { describe, expect, test } from "bun:test";

import { chooseActiveDid } from "./active-identity-selection";
import type { DidRecord } from "./did-ckb";

function record(did: string): DidRecord {
  return { did } as DidRecord;
}

describe("chooseActiveDid", () => {
  test("keeps the current selection when it remains controlled", () => {
    expect(chooseActiveDid([record("did:ckb:a"), record("did:ckb:b")], "did:ckb:b", null)).toBe(
      "did:ckb:b",
    );
  });

  test("restores a controlled selection from storage", () => {
    expect(chooseActiveDid([record("did:ckb:a"), record("did:ckb:b")], null, "did:ckb:b")).toBe(
      "did:ckb:b",
    );
  });

  test("falls back to the first controlled identity", () => {
    expect(chooseActiveDid([record("did:ckb:a")], "did:ckb:old", "did:ckb:missing")).toBe(
      "did:ckb:a",
    );
  });

  test("returns null when the wallet controls no identities", () => {
    expect(chooseActiveDid([], "did:ckb:old", "did:ckb:old")).toBeNull();
  });
});
