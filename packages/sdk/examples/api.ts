import { ccc } from "@ckb-ccc/core";
import { resolveDidCkb } from "@ckb-ccc/did-ckb";
import {
  ClaimData,
  ClaimDataV1,
  checkPolicy,
  parseClaimPayload,
  readClaims,
  writeClaim,
  writeClaims,
} from "@usevellum/sdk";
import type { Claim, ClaimSchema, WriteClaimInput } from "@usevellum/sdk";
import { testnetScripts } from "./testnet.js";

export { testnetScripts } from "./testnet.js";

if (
  typeof ClaimData !== "function" ||
  typeof ClaimDataV1 !== "function" ||
  typeof checkPolicy !== "function" ||
  typeof resolveDidCkb !== "function" ||
  typeof parseClaimPayload !== "function" ||
  typeof readClaims !== "function" ||
  typeof writeClaim !== "function" ||
  typeof writeClaims !== "function"
) {
  throw new Error("SDK runtime exports are incomplete");
}

export function resolveIdentity(client: ccc.Client, did: string) {
  return resolveDidCkb({ client, did });
}

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

export async function issueClaim<TPayload>(
  issuerSigner: ccc.Signer,
  input: WriteClaimInput<TPayload>,
) {
  const built = await prepareClaim(issuerSigner, input);
  const preparedHash = built.tx.hash();
  const signed = await issuerSigner.signOnlyTransaction(built.tx);
  if (signed.hash() !== preparedHash) {
    throw new Error("Signer changed the prepared transaction");
  }
  const txHash = await issuerSigner.client.sendTransaction(signed);
  return { txHash, claimId: built.claimId, outputIndex: built.outputIndex };
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
