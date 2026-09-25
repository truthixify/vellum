import { ccc } from "@ckb-ccc/core";
import {
  ClaimData,
  ClaimDataV1,
  parseClaimPayload,
  readClaims,
  writeClaim,
  writeClaims,
} from "@usevellum/sdk";
import type { Claim, ClaimSchema, ClaimScriptConfigLike, WriteClaimInput } from "@usevellum/sdk";

if (
  typeof ClaimData !== "function" ||
  typeof ClaimDataV1 !== "function" ||
  typeof parseClaimPayload !== "function" ||
  typeof readClaims !== "function" ||
  typeof writeClaim !== "function" ||
  typeof writeClaims !== "function"
) {
  throw new Error("SDK runtime exports are incomplete");
}

export const testnetScripts = {
  claimType: {
    codeHash: "0xfb2757e524b3f83161d8b85b8b3e00186e2019ff04f5dfe833c5a72731e13157",
    hashType: "type",
    cellDeps: [
      {
        cellDep: {
          outPoint: {
            txHash: "0xaf693346282063a5d51f79d180fc807cdba1b8ac9d7af30085ff0aa190e2686c",
            index: "0x0",
          },
          depType: "code",
        },
      },
    ],
  },
  didLock: {
    codeHash: "0xe1562cc57b4bd91619ada2f7e74d63805ea7038a7b6de0b18a529d51aa883d2d",
    hashType: "type",
    cellDeps: [
      {
        cellDep: {
          outPoint: {
            txHash: "0xaf693346282063a5d51f79d180fc807cdba1b8ac9d7af30085ff0aa190e2686c",
            index: "0x1",
          },
          depType: "code",
        },
      },
    ],
  },
} satisfies ClaimScriptConfigLike;

export function findClaims(client: ccc.Client, subjectDid: string, evaluationTime: ccc.NumLike) {
  return readClaims({
    client,
    scripts: testnetScripts,
    filter: { subject: { did: subjectDid }, evaluationTime },
  });
}

export function prepareClaim<TPayload>(issuerSigner: ccc.Signer, input: WriteClaimInput<TPayload>) {
  return writeClaim({ issuerSigner, scripts: testnetScripts, input });
}

export function prepareClaims<TPayload>(
  issuerSigner: ccc.Signer,
  inputs: readonly WriteClaimInput<TPayload>[],
) {
  return writeClaims({ issuerSigner, scripts: testnetScripts, inputs });
}

type ProfileClaim = { account: string };

const profileSchema: ClaimSchema<ProfileClaim> = {
  id: "example.profile.v1",
  hash: "0xee63f8c811694ae206a49b681dfd336caa92b27384284398124e7b53f92d5f2b",
  parse(payload) {
    if (
      typeof payload !== "object" ||
      payload === null ||
      !("account" in payload) ||
      typeof payload.account !== "string"
    ) {
      throw new Error("Profile claim must contain an account string");
    }
    return { account: payload.account };
  },
};

export function parseProfileClaim(claim: Claim): ProfileClaim {
  return parseClaimPayload(claim, profileSchema);
}

const data = ClaimDataV1.from({
  issuerId: `0x${"11".repeat(20)}`,
  nonce: `0x${"22".repeat(32)}`,
  issuedAt: 1_789_764_803n,
  payload: { account: "truthixify" },
});
const decoded = ClaimData.decode(ClaimData.fromV1(data).toBytes());
const decodedPayload = decoded.value.payload;

if (
  decoded.type !== "v1" ||
  typeof decodedPayload !== "object" ||
  decodedPayload === null ||
  !("account" in decodedPayload) ||
  decodedPayload.account !== "truthixify"
) {
  throw new Error("Claim codec example failed");
}

console.log("Claim codec example passed");
