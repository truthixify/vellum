import { describe, expect, mock, test } from "bun:test";
import { ccc } from "@ckb-ccc/core";
import type { WriteClaimResult } from "@vellum/sdk";

import deployment from "../../../../deployments/testnet.json";
import {
  assertIssuerController,
  claimScripts,
  issueVerifiedClaim,
  issuerCredential,
  issuerMetadata,
  issuerRpcUrl,
  type IssuanceDependencies,
} from "./issuer";

const HASH = `0x${"11".repeat(32)}` as ccc.Hex;
const TRANSACTION_HASH = `0x${"22".repeat(32)}` as ccc.Hex;
const CLAIM_ID = `0x${"33".repeat(32)}` as ccc.Hex;
const SUBJECT_DID = "did:ckb:fn7u37m7vwerr4ojysgdwwp4mescjtrp";

function preparedClaim(tx: ccc.Transaction): WriteClaimResult {
  return {
    tx,
    claimId: CLAIM_ID,
    outputIndex: 1,
    issuerSource: { kind: "cell-dep", cellDepIndex: 0 },
    controllerInputIndex: 0,
  };
}

describe("issuer configuration", () => {
  test("publishes controller metadata that agrees with the secp256k1 public key", async () => {
    const client = new ccc.ClientPublicTestnet({ url: "https://example.test" });
    const publicSigner = new ccc.SignerCkbPublicKey(client, issuerMetadata.controller.publicKey);

    await expect(assertIssuerController(publicSigner)).resolves.toBeUndefined();
    expect(ccc.Script.from(issuerMetadata.controller.lock).hash()).toBe(
      issuerMetadata.controller.lockHash,
    );
  });

  test("uses the recorded Testnet Claim Type and DID Lock deployments", () => {
    expect(claimScripts.claimType.codeHash).toBe(deployment.contracts.claimType.codeHash);
    expect(claimScripts.didLock?.codeHash).toBe(deployment.contracts.didLock.codeHash);
    expect(issuerMetadata.claimType.outPoint).toEqual(deployment.contracts.claimType.outPoint);
  });

  test("fails closed when the controller credential is missing or malformed", () => {
    expect(() => issuerCredential({})).toThrow(
      "The issuer controller credential is not configured.",
    );
    expect(() => issuerCredential({ VELLUM_ISSUER_PRIVATE_KEY: "not-a-key" })).toThrow(
      "The issuer controller credential is not configured.",
    );
  });

  test("accepts HTTP RPC endpoints without embedded credentials", () => {
    expect(issuerRpcUrl({})).toBe("https://testnet.ckbapp.dev/");
    expect(issuerRpcUrl({ CKB_RPC_URL: "http://127.0.0.1:8114" })).toBe("http://127.0.0.1:8114/");
    expect(() => issuerRpcUrl({ CKB_RPC_URL: "https://user:pass@example.test" })).toThrow(
      "The configured CKB RPC URL is invalid.",
    );
  });

  test("builds, signs, and submits the verified claim through the SDK path", async () => {
    const tx = ccc.Transaction.from({});
    const sendTransaction = mock(async () => TRANSACTION_HASH);
    const signOnlyTransaction = mock(async () => tx.clone());
    const signer = {
      client: { sendTransaction },
      signOnlyTransaction,
    } as unknown as ccc.Signer;
    const createSigner = mock(async () => signer);
    const buildClaim = mock(
      async (
        _props: Parameters<IssuanceDependencies["writeClaim"]>[0],
      ): Promise<WriteClaimResult> => preparedClaim(tx),
    );
    const subject = { did: SUBJECT_DID } as const;
    const claim = {
      schema: { id: "vellum.social.github.v1", hash: HASH },
      payload: { login: "builder" },
      issuedAt: 1_700_000_000,
    };

    const result = await issueVerifiedClaim(
      subject,
      claim,
      {},
      {
        createSigner,
        writeClaim: buildClaim,
      },
    );

    expect(buildClaim).toHaveBeenCalledWith({
      issuerSigner: signer,
      scripts: claimScripts,
      input: {
        subject,
        issuerDid: issuerMetadata.did,
        schemaHash: claim.schema.hash,
        payload: claim.payload,
        issuedAt: claim.issuedAt,
        expiresAt: undefined,
      },
    });
    expect(signOnlyTransaction).toHaveBeenCalledWith(tx);
    expect(sendTransaction).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      status: "submitted",
      network: "ckb_testnet",
      payer: "issuer",
      transactionHash: TRANSACTION_HASH,
      claimId: CLAIM_ID,
      outputIndex: 1,
    });
  });

  test("does not broadcast when signing changes the prepared transaction", async () => {
    const tx = ccc.Transaction.from({});
    const changed = tx.clone();
    changed.cellDeps.push(
      ccc.CellDep.from({
        outPoint: { txHash: HASH, index: 0 },
        depType: "code",
      }),
    );
    const sendTransaction = mock(async () => TRANSACTION_HASH);
    const signer = {
      client: { sendTransaction },
      signOnlyTransaction: async () => changed,
    } as unknown as ccc.Signer;

    await expect(
      issueVerifiedClaim(
        { did: SUBJECT_DID },
        {
          schema: { id: "vellum.social.github.v1", hash: HASH },
          payload: { login: "builder" },
          issuedAt: 1_700_000_000,
        },
        {},
        {
          createSigner: async () => signer,
          writeClaim: async () => preparedClaim(tx),
        },
      ),
    ).rejects.toThrow("The issuer signer changed the prepared transaction.");
    expect(sendTransaction).not.toHaveBeenCalled();
  });
});
