import { describe, expect, mock, test } from "bun:test";
import { ccc } from "@ckb-ccc/core";
import type { WriteClaimsResult } from "@usevellum/sdk";

import deployment from "../../../../deployments/testnet.json";
import type { VerifiedClaim } from "./contracts";
import {
  assertIssuerController,
  claimScripts,
  issueVerifiedClaim,
  issueVerifiedClaims,
  issuerCredential,
  issuerMetadata,
  issuerRpcUrl,
  type IssuanceDependencies,
} from "./issuer";

const HASH = `0x${"11".repeat(32)}` as ccc.Hex;
const TRANSACTION_HASH = `0x${"22".repeat(32)}` as ccc.Hex;
const CLAIM_ID = `0x${"33".repeat(32)}` as ccc.Hex;
const SUBJECT_DID = "did:ckb:fn7u37m7vwerr4ojysgdwwp4mescjtrp";

function preparedClaims(
  tx: ccc.Transaction,
  claims: WriteClaimsResult["claims"] = [{ claimId: CLAIM_ID, outputIndex: 1 }],
): WriteClaimsResult {
  return {
    tx,
    claims,
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
    const buildClaims = mock(
      async (
        _props: Parameters<IssuanceDependencies["writeClaims"]>[0],
      ): Promise<WriteClaimsResult> => preparedClaims(tx),
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
        writeClaims: buildClaims,
      },
    );

    expect(buildClaims).toHaveBeenCalledWith({
      issuerSigner: signer,
      scripts: claimScripts,
      inputs: [
        {
          subject,
          issuerDid: issuerMetadata.did,
          schemaHash: claim.schema.hash,
          payload: claim.payload,
          issuedAt: claim.issuedAt,
          expiresAt: undefined,
        },
      ],
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

  test("composes multiple verified claims into one signed transaction", async () => {
    const finalTx = ccc.Transaction.from({
      outputs: [{ capacity: 0, lock: { codeHash: HASH, hashType: "type", args: "0x" } }],
      outputsData: ["0x"],
    });
    const sendTransaction = mock(async () => TRANSACTION_HASH);
    const signOnlyTransaction = mock(async () => finalTx.clone());
    const signer = {
      client: { sendTransaction },
      signOnlyTransaction,
    } as unknown as ccc.Signer;
    const writeClaims = mock(async (props: Parameters<IssuanceDependencies["writeClaims"]>[0]) => {
      expect(props.inputs).toHaveLength(2);
      return preparedClaims(finalTx, [
        { claimId: CLAIM_ID, outputIndex: 1 },
        { claimId: `0x${"44".repeat(32)}` as ccc.Hex, outputIndex: 2 },
      ]);
    });
    const claims: VerifiedClaim[] = [
      {
        schema: { id: "vellum.social.discord.v1", hash: HASH },
        payload: { user_id: "80351110224678912" },
        issuedAt: 1_700_000_000,
      },
      {
        schema: { id: "vellum.community.discord.v1", hash: HASH },
        payload: { memberships: [] },
        issuedAt: 1_700_000_000,
        expiresAt: 1_702_592_000,
      },
    ];

    const result = await issueVerifiedClaims(
      { did: SUBJECT_DID },
      claims,
      {},
      { createSigner: async () => signer, writeClaims },
    );

    expect(writeClaims).toHaveBeenCalledTimes(1);
    expect(signOnlyTransaction).toHaveBeenCalledWith(finalTx);
    expect(sendTransaction).toHaveBeenCalledTimes(1);
    expect(result).toEqual([
      expect.objectContaining({
        transactionHash: TRANSACTION_HASH,
        claimId: CLAIM_ID,
        outputIndex: 1,
      }),
      expect.objectContaining({
        transactionHash: TRANSACTION_HASH,
        claimId: `0x${"44".repeat(32)}`,
        outputIndex: 2,
      }),
    ]);
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
          writeClaims: async () => preparedClaims(tx),
        },
      ),
    ).rejects.toThrow("The issuer signer changed the prepared transaction.");
    expect(sendTransaction).not.toHaveBeenCalled();
  });
});
