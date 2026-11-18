import { describe, expect, test } from "bun:test";
import { ccc } from "@ckb-ccc/core";

import type { SubjectProof } from "../verification/contracts";
import {
  createGovernanceChallenge,
  verifyGovernanceProof,
  type GovernanceChallengeDependencies,
} from "./challenge";
import type { GovernanceChallengeRequest } from "./contracts";

const NOW = 1_800_000_000;
const SECRET = "governance-state-secret-for-tests-only".repeat(2);
const DID = "did:ckb:4kiidiczwthgxj7dltzkzopgbwu3v6jc";
const PRIVATE_KEY = `0x${"11".repeat(32)}` as ccc.Hex;
const REQUEST: GovernanceChallengeRequest = {
  version: "1",
  proposalId: "public-governance-participation.v1",
  choice: "yes",
  subject: { did: DID },
};

async function fixture() {
  const client = new ccc.ClientPublicTestnet({ url: "https://example.test" });
  const signer = new ccc.SignerCkbPrivateKey(client, PRIVATE_KEY);
  const controller = (await signer.getAddressObjSecp256k1()).script;
  const dependencies: GovernanceChallengeDependencies = {
    createClient: () => client,
    nonceBytes: () => Uint8Array.from({ length: 32 }, (_, index) => index),
    resolveDid: async () =>
      ({
        cell: ccc.Cell.from({
          outPoint: { txHash: `0x${"22".repeat(32)}`, index: 0 },
          cellOutput: { capacity: 100_000_000_000n, lock: controller },
          outputData: "0x",
        }),
      }) as Awaited<ReturnType<GovernanceChallengeDependencies["resolveDid"]>>,
    verifyMessage: ccc.Signer.verifyMessage,
    verifyJoyIdCredential: async () => false,
  };
  return { client, controller, dependencies, signer };
}

async function proofFixture() {
  const value = await fixture();
  const challenge = await createGovernanceChallenge(REQUEST, SECRET, NOW, {}, value.dependencies);
  const signed = await value.signer.signMessage(challenge.message);
  const proof: SubjectProof = {
    challenge: challenge.challenge,
    signature: {
      identity: signed.identity,
      signature: signed.signature,
      signType: signed.signType as SubjectProof["signature"]["signType"],
    },
  };
  return { ...value, challenge, proof };
}

describe("governance vote challenge", () => {
  test("binds the proposal, choice, DID, live controller, nonce, and expiry", async () => {
    const { challenge, controller, dependencies, proof } = await proofFixture();
    expect(challenge.message).toContain(`Proposal: ${REQUEST.proposalId}`);
    expect(challenge.message).toContain("Choice: yes");
    expect(challenge.message).toContain(`Identity: ${DID}`);
    await expect(
      verifyGovernanceProof(REQUEST, proof, SECRET, NOW, {}, dependencies),
    ).resolves.toMatchObject({ controllerLockHash: controller.hash(), expiresAt: NOW + 300 });
  });

  test("rejects altered intent and expired challenges", async () => {
    const { dependencies, proof } = await proofFixture();
    await expect(
      verifyGovernanceProof({ ...REQUEST, choice: "no" }, proof, SECRET, NOW, {}, dependencies),
    ).rejects.toMatchObject({ code: "challenge_invalid" });
    await expect(
      verifyGovernanceProof(REQUEST, proof, SECRET, NOW + 300, {}, dependencies),
    ).rejects.toMatchObject({ code: "challenge_invalid" });
  });

  test("rejects the wrong signer and a controller rotation", async () => {
    const { client, dependencies, proof } = await proofFixture();
    const otherSigner = new ccc.SignerCkbPrivateKey(client, `0x${"12".repeat(32)}`);
    const wrongChallenge = await createGovernanceChallenge(REQUEST, SECRET, NOW, {}, dependencies);
    const wrongSignature = await otherSigner.signMessage(wrongChallenge.message);
    await expect(
      verifyGovernanceProof(
        REQUEST,
        {
          challenge: wrongChallenge.challenge,
          signature: {
            identity: wrongSignature.identity,
            signature: wrongSignature.signature,
            signType: wrongSignature.signType as SubjectProof["signature"]["signType"],
          },
        },
        SECRET,
        NOW,
        {},
        dependencies,
      ),
    ).rejects.toMatchObject({ code: "subject_control_invalid" });

    const rotated = ccc.Script.from({
      codeHash: `0x${"33".repeat(32)}`,
      hashType: "type",
      args: `0x${"44".repeat(20)}`,
    });
    await expect(
      verifyGovernanceProof(
        REQUEST,
        proof,
        SECRET,
        NOW,
        {},
        {
          ...dependencies,
          resolveDid: async () =>
            ({ cell: { cellOutput: { lock: rotated } } }) as Awaited<
              ReturnType<GovernanceChallengeDependencies["resolveDid"]>
            >,
        },
      ),
    ).rejects.toMatchObject({ code: "subject_control_invalid" });
  });
});
