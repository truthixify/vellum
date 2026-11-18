import { describe, expect, test } from "bun:test";
import { ccc } from "@ckb-ccc/core";
import { didToArgs } from "@ckb-ccc/did-ckb";

import { checkPolicy } from "./policy";
import type { Claim, ClaimIssuerState, ClaimPolicy, ClaimTimeEvaluation } from "./types";

function repeatedHex(byte: number, length: number): ccc.Hex {
  return `0x${byte.toString(16).padStart(2, "0").repeat(length)}` as ccc.Hex;
}

const VELLUM_ISSUER = "did:ckb:hlvxrdt3e7iwvuxdmbvejp6hc4yoo3no";
const PARTNER_ISSUER = "did:ckb:tlitdhrdn7wdzmktk3kzhfua3ivpgiq2";
const GITHUB_SCHEMA = repeatedHex(0x11, 32);
const PARTNER_SCHEMA = repeatedHex(0x22, 32);
const CONTROLLER = ccc.Script.from({
  codeHash: repeatedHex(0x33, 32),
  hashType: "type",
  args: repeatedHex(0x34, 20),
});
const SUBJECT_LOCK = ccc.Script.from({
  codeHash: repeatedHex(0x44, 32),
  hashType: "type",
  args: repeatedHex(0x45, 20),
});

function makeCell(lock: ccc.Script, type?: ccc.Script): ccc.Cell {
  return ccc.Cell.from({
    outPoint: { txHash: repeatedHex(0x55, 32), index: 0 },
    cellOutput: { capacity: 20_000_000_000n, lock, type },
    outputData: "0x",
  });
}

function makeClaim(
  options: {
    issuerDid?: string;
    schemaHash?: ccc.Hex;
    issuedAt?: bigint;
    expiresAt?: bigint;
    time?: ClaimTimeEvaluation;
    issuerState?: ClaimIssuerState;
  } = {},
): Claim {
  const issuerDid = options.issuerDid ?? VELLUM_ISSUER;
  const issuerId = ccc.hexFrom(didToArgs(issuerDid));
  const issuerType = ccc.Script.from({
    codeHash: repeatedHex(0x66, 32),
    hashType: "type",
    args: issuerId,
  });
  const issuerCell = makeCell(CONTROLLER, issuerType);
  const claimCell = makeCell(SUBJECT_LOCK);

  return {
    version: "v1",
    claimId: repeatedHex(0x77, 32),
    issuerDid,
    issuerId,
    issuerType,
    issuerState: options.issuerState ?? {
      status: "active",
      cell: issuerCell,
      controller: CONTROLLER,
    },
    subjectLock: SUBJECT_LOCK,
    subjectLockHash: SUBJECT_LOCK.hash(),
    schemaHash: options.schemaHash ?? GITHUB_SCHEMA,
    nonce: repeatedHex(0x88, 32),
    issuedAt: options.issuedAt ?? 100n,
    expiresAt: options.expiresAt,
    payload: {},
    payloadBytes: "0xa0",
    cell: claimCell,
    duplicateCells: [],
    verification: {
      inclusion: "live",
      issuerAuthorization: "accepted-by-configured-claim-type",
      time: options.time ?? { status: "active", evaluatedAt: 150n },
    },
  };
}

const requirements = [
  { issuerDid: VELLUM_ISSUER, schemaHash: GITHUB_SCHEMA },
  { issuerDid: PARTNER_ISSUER, schemaHash: PARTNER_SCHEMA },
] as const;

describe("checkPolicy", () => {
  test("evaluates any, all, and threshold policies over unique requirements", () => {
    const claims = [makeClaim()];

    expect(checkPolicy([], { mode: "any", requirements }, 150n)).toBe(false);
    expect(checkPolicy([], { mode: "all", requirements }, 150n)).toBe(false);
    expect(checkPolicy(claims, { mode: "any", requirements }, 150n)).toBe(true);
    expect(checkPolicy(claims, { mode: "all", requirements }, 150n)).toBe(false);
    expect(checkPolicy(claims, { mode: "threshold", requirements, threshold: 1 }, 150n)).toBe(true);
    expect(checkPolicy(claims, { mode: "threshold", requirements, threshold: 2 }, 150n)).toBe(
      false,
    );

    const complete = [
      ...claims,
      makeClaim({ issuerDid: PARTNER_ISSUER, schemaHash: PARTNER_SCHEMA }),
    ];
    expect(checkPolicy(complete, { mode: "all", requirements }, 150n)).toBe(true);
  });

  test("requires an exact issuer-and-schema pair", () => {
    const policy = { mode: "all", requirements: [requirements[0]] } satisfies ClaimPolicy;

    expect(checkPolicy([makeClaim()], policy, 150n)).toBe(true);
    expect(checkPolicy([makeClaim({ issuerDid: PARTNER_ISSUER })], policy, 150n)).toBe(false);
    expect(checkPolicy([makeClaim({ schemaHash: PARTNER_SCHEMA })], policy, 150n)).toBe(false);
  });

  test("fails closed for an inactive or differently evaluated claim", () => {
    const policy = { mode: "all", requirements: [requirements[0]] } satisfies ClaimPolicy;
    const inactiveTimes: ClaimTimeEvaluation[] = [
      { status: "not-evaluated" },
      { status: "not-yet-active", evaluatedAt: 150n },
      { status: "expired", evaluatedAt: 150n },
      { status: "active", evaluatedAt: 149n },
    ];

    for (const time of inactiveTimes) {
      expect(checkPolicy([makeClaim({ time })], policy, 150n)).toBe(false);
    }
    for (const issuerState of [
      { status: "deactivated" },
      { status: "missing" },
      { status: "ambiguous", cells: [] },
      { status: "unavailable", reason: "indexer unavailable" },
    ] satisfies ClaimIssuerState[]) {
      expect(checkPolicy([makeClaim({ issuerState })], policy, 150n)).toBe(false);
    }
  });

  test("requires verified live inclusion and Claim Type authorization", () => {
    const policy = { mode: "all", requirements: [requirements[0]] } satisfies ClaimPolicy;
    const claim = makeClaim();
    const spent = {
      ...claim,
      verification: { ...claim.verification, inclusion: "spent" },
    } as unknown as Claim;
    const unauthorized = {
      ...claim,
      verification: { ...claim.verification, issuerAuthorization: "unverified" },
    } as unknown as Claim;

    expect(checkPolicy([spent], policy, 150n)).toBe(false);
    expect(checkPolicy([unauthorized], policy, 150n)).toBe(false);
  });

  test("enforces the exact activation and expiry boundary", () => {
    const policy = { mode: "all", requirements: [requirements[0]] } satisfies ClaimPolicy;

    expect(
      checkPolicy(
        [
          makeClaim({
            issuedAt: 100n,
            expiresAt: 200n,
            time: { status: "active", evaluatedAt: 99n },
          }),
        ],
        policy,
        99n,
      ),
    ).toBe(false);
    expect(
      checkPolicy(
        [
          makeClaim({
            issuedAt: 100n,
            expiresAt: 200n,
            time: { status: "active", evaluatedAt: 100n },
          }),
        ],
        policy,
        100n,
      ),
    ).toBe(true);
    expect(
      checkPolicy(
        [
          makeClaim({
            issuedAt: 100n,
            expiresAt: 200n,
            time: { status: "active", evaluatedAt: 200n },
          }),
        ],
        policy,
        200n,
      ),
    ).toBe(false);
  });

  test("rejects malformed or ambiguous policy configuration", () => {
    expect(() => checkPolicy([], { mode: "any", requirements: [] }, 150n)).toThrow(
      "at least one requirement",
    );
    expect(() => checkPolicy([], { mode: "threshold", requirements, threshold: 0 }, 150n)).toThrow(
      "threshold must be an integer between 1 and the requirement count",
    );
    expect(() =>
      checkPolicy([], { mode: "all", requirements, threshold: 1 } as unknown as ClaimPolicy, 150n),
    ).toThrow("threshold is only valid for threshold policies");
    expect(() =>
      checkPolicy([], { mode: "all", requirements: [requirements[0], requirements[0]] }, 150n),
    ).toThrow("duplicate issuer-and-schema requirements");
    expect(() =>
      checkPolicy(
        [],
        { mode: "all", requirements: [{ ...requirements[0], schemaHash: "0x01" }] },
        150n,
      ),
    ).toThrow("requirements[0].schemaHash must be 32 bytes, got 1");
    expect(() =>
      checkPolicy(
        [],
        { mode: "all", requirements: [{ ...requirements[0], issuerDid: "invalid" }] },
        150n,
      ),
    ).toThrow();
    expect(() =>
      checkPolicy(
        [],
        { mode: "all", requirements: [requirements[0]] },
        Number.MAX_SAFE_INTEGER + 1,
      ),
    ).toThrow("evaluationTime numbers must be safe integers");
    expect(() =>
      checkPolicy([], { mode: "all", requirements: [requirements[0]] }, 2n ** 64n),
    ).toThrow("evaluationTime must fit in an unsigned 64-bit integer");
    expect(() =>
      checkPolicy(
        [],
        { mode: "unsupported", requirements: [requirements[0]] } as unknown as ClaimPolicy,
        150n,
      ),
    ).toThrow("Unsupported claim policy mode: unsupported");
  });
});
