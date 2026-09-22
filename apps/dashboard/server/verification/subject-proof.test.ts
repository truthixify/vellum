import { describe, expect, mock, test } from "bun:test";
import { ccc } from "@ckb-ccc/core";

import { MemoryVerificationCoordinator } from "./coordination";
import type { SubjectProof } from "./contracts";
import {
  assertSubjectController,
  createSubjectChallenge,
  verifySubjectProof,
  type SubjectProofDependencies,
} from "./subject-proof";

const NOW = 1_800_000_000;
const SUBJECT = { did: "did:ckb:fn7u37m7vwerr4ojysgdwwp4mescjtrp" } as const;
const SECRET = "subject-proof-secret-for-tests-only".repeat(2);
const PRIVATE_KEY = `0x${"11".repeat(32)}` as ccc.Hex;

async function fixture() {
  const client = new ccc.ClientPublicTestnet({ url: "https://example.test" });
  const signer = new ccc.SignerCkbPrivateKey(client, PRIVATE_KEY);
  const controller = (await signer.getAddressObjSecp256k1()).script;
  const dependencies: SubjectProofDependencies = {
    createClient: () => client,
    nonceBytes: () => Uint8Array.from({ length: 32 }, (_, index) => index),
    resolveDid: async () =>
      ({
        cell: ccc.Cell.from({
          outPoint: { txHash: `0x${"22".repeat(32)}`, index: 0 },
          cellOutput: { capacity: 100_000_000_000n, lock: controller },
          outputData: "0x",
        }),
      }) as Awaited<ReturnType<SubjectProofDependencies["resolveDid"]>>,
    verifyMessage: ccc.Signer.verifyMessage,
    verifyJoyIdCredential: async () => false,
  };
  return { client, controller, dependencies, signer };
}

describe("subject controller proof", () => {
  test("accepts one signature from the live DID controller and rejects replay", async () => {
    const { controller, dependencies, signer } = await fixture();
    const coordinator = new MemoryVerificationCoordinator();
    const challenge = await createSubjectChallenge(
      "github",
      SUBJECT,
      SECRET,
      NOW,
      {},
      dependencies,
    );
    const signed = await signer.signMessage(challenge.message);
    const proof: SubjectProof = {
      challenge: challenge.challenge,
      signature: {
        identity: signed.identity,
        signature: signed.signature,
        signType: "CkbSecp256k1",
      },
    };

    await expect(
      verifySubjectProof("github", SUBJECT, proof, SECRET, NOW, coordinator, {}, dependencies),
    ).resolves.toBe(controller.hash());
    await expect(
      verifySubjectProof("github", SUBJECT, proof, SECRET, NOW, coordinator, {}, dependencies),
    ).rejects.toMatchObject({ code: "subject_control_invalid" });
  });

  test("accepts a Telegram challenge signed by the live DID controller", async () => {
    const { controller, dependencies, signer } = await fixture();
    const challenge = await createSubjectChallenge(
      "telegram",
      SUBJECT,
      SECRET,
      NOW,
      {},
      dependencies,
    );
    const signed = await signer.signMessage(challenge.message);

    await expect(
      verifySubjectProof(
        "telegram",
        SUBJECT,
        {
          challenge: challenge.challenge,
          signature: {
            identity: signed.identity,
            signature: signed.signature,
            signType: "CkbSecp256k1",
          },
        },
        SECRET,
        NOW,
        new MemoryVerificationCoordinator(),
        {},
        dependencies,
      ),
    ).resolves.toBe(controller.hash());
  });

  test("rejects the wrong signer, provider, subject, and expired challenge", async () => {
    const { client, dependencies } = await fixture();
    const otherSigner = new ccc.SignerCkbPrivateKey(client, `0x${"12".repeat(32)}`);
    const challenge = await createSubjectChallenge(
      "discord",
      SUBJECT,
      SECRET,
      NOW,
      {},
      dependencies,
    );
    const signed = await otherSigner.signMessage(challenge.message);
    const proof: SubjectProof = {
      challenge: challenge.challenge,
      signature: {
        identity: signed.identity,
        signature: signed.signature,
        signType: "CkbSecp256k1",
      },
    };

    await expect(
      verifySubjectProof(
        "discord",
        SUBJECT,
        proof,
        SECRET,
        NOW,
        new MemoryVerificationCoordinator(),
        {},
        dependencies,
      ),
    ).rejects.toMatchObject({ code: "subject_control_invalid" });
    await expect(
      verifySubjectProof(
        "github",
        SUBJECT,
        proof,
        SECRET,
        NOW,
        new MemoryVerificationCoordinator(),
        {},
        dependencies,
      ),
    ).rejects.toMatchObject({ code: "subject_control_invalid" });
    await expect(
      verifySubjectProof(
        "discord",
        { did: "did:ckb:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
        proof,
        SECRET,
        NOW,
        new MemoryVerificationCoordinator(),
        {},
        dependencies,
      ),
    ).rejects.toMatchObject({ code: "subject_control_invalid" });
    await expect(
      verifySubjectProof(
        "discord",
        SUBJECT,
        proof,
        SECRET,
        NOW + 300,
        new MemoryVerificationCoordinator(),
        {},
        dependencies,
      ),
    ).rejects.toMatchObject({ code: "subject_control_invalid" });
  });

  test("rejects a controller rotation before the OAuth callback", async () => {
    const { controller, dependencies } = await fixture();

    await expect(
      assertSubjectController(SUBJECT, controller.hash(), {}, dependencies),
    ).resolves.toBeUndefined();
    await expect(
      assertSubjectController(SUBJECT, `0x${"55".repeat(32)}`, {}, dependencies),
    ).rejects.toMatchObject({ code: "subject_control_invalid" });
  });

  test("binds a JoyID credential to the live Testnet controller address", async () => {
    const { client, controller, dependencies } = await fixture();
    const verifyCredential = mock(async () => true);
    const joyIdDependencies = {
      ...dependencies,
      verifyMessage: mock(async () => true),
      verifyJoyIdCredential:
        verifyCredential as unknown as SubjectProofDependencies["verifyJoyIdCredential"],
    };
    const challenge = await createSubjectChallenge(
      "discord",
      SUBJECT,
      SECRET,
      NOW,
      {},
      joyIdDependencies,
    );

    await expect(
      verifySubjectProof(
        "discord",
        SUBJECT,
        {
          challenge: challenge.challenge,
          signature: {
            identity: JSON.stringify({ keyType: "main_key", publicKey: "credential-key" }),
            signature: JSON.stringify({ alg: -7 }),
            signType: "JoyId",
          },
        },
        SECRET,
        NOW,
        new MemoryVerificationCoordinator(),
        {},
        joyIdDependencies,
      ),
    ).resolves.toBe(controller.hash());
    expect(verifyCredential).toHaveBeenCalledWith(
      {
        pubkey: "credential-key",
        address: ccc.Address.from({ prefix: client.addressPrefix, script: controller }).toString(),
        keyType: "main_key",
        alg: -7,
      },
      "https://api.testnet.joyid.dev/api/v1",
    );
  });
});
