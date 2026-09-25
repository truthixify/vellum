import { ccc } from "@ckb-ccc/core";
import {
  writeClaims,
  type ClaimScriptConfigLike,
  type WriteClaimsProps,
  type WriteClaimsResult,
} from "@usevellum/sdk";

import deployment from "../../../../deployments/testnet.json" with { type: "json" };
import type { ClaimIssuanceResult, VerificationSubject, VerifiedClaim } from "./contracts.js";
import { IssuerConfigurationError } from "./errors.js";

const DEFAULT_CKB_RPC_URL = "https://testnet.ckbapp.dev";
const PRIVATE_KEY_PATTERN = /^0x[0-9a-fA-F]{64}$/;

export const issuerMetadata = {
  network: "ckb_testnet",
  did: "did:ckb:hlvxrdt3e7iwvuxdmbvejp6hc4yoo3no",
  controller: {
    kind: "ckb-secp256k1",
    publicKey: "0x026d11d65c41198c8981f649f262da9fefb2d6501c5e826d24b75bb4b9e2689ec2",
    address:
      "ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqgd605wl3fn6n6r0q8mjn58ewe77unewxqs5kpmy",
    lock: {
      codeHash: "0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8",
      hashType: "type",
      args: "0x0dd3e8efc533d4f43780fb94e87cbb3ef7279718",
    },
    lockHash: "0x5290a9a3aa411b0b81990310316d086972f285dad4bba7448a55b0021df65d03",
  },
  authorization: "did-controller-input",
  submission: "service",
  payer: "issuer",
  claimType: {
    codeHash: deployment.contracts.claimType.codeHash,
    hashType: deployment.contracts.claimType.hashType,
    outPoint: deployment.contracts.claimType.outPoint,
  },
} as const;

function scriptInfo(
  contract: (typeof deployment.contracts)[keyof typeof deployment.contracts],
): ccc.ScriptInfoLike {
  return {
    codeHash: contract.codeHash,
    hashType: contract.hashType,
    cellDeps: [
      {
        cellDep: {
          outPoint: contract.outPoint,
          depType: contract.depType,
        },
      },
    ],
  };
}

export const claimScripts = {
  claimType: scriptInfo(deployment.contracts.claimType),
  didLock: scriptInfo(deployment.contracts.didLock),
} satisfies ClaimScriptConfigLike;

type IssuerEnvironment = {
  [key: string]: string | undefined;
  CKB_RPC_URL?: string;
  VELLUM_ISSUER_PRIVATE_KEY?: string;
};

export type IssuerSigner = ccc.SignerCkbPrivateKey;

type ClaimWriter = (
  props: WriteClaimsProps<VerifiedClaim["payload"]>,
) => Promise<WriteClaimsResult>;

export type IssuanceDependencies = {
  createSigner: (environment: IssuerEnvironment) => Promise<ccc.Signer>;
  writeClaims: ClaimWriter;
};

const issuanceDependencies: IssuanceDependencies = {
  createSigner: createIssuerSigner,
  writeClaims,
};

export function issuerCredential(environment: IssuerEnvironment): ccc.Hex {
  const value = environment.VELLUM_ISSUER_PRIVATE_KEY;
  if (!value || !PRIVATE_KEY_PATTERN.test(value)) {
    throw new IssuerConfigurationError("The issuer controller credential is not configured.");
  }
  return value.toLowerCase() as ccc.Hex;
}

export function issuerRpcUrl(environment: IssuerEnvironment): string {
  const value = environment.CKB_RPC_URL ?? DEFAULT_CKB_RPC_URL;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new IssuerConfigurationError("The configured CKB RPC URL is invalid.");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new IssuerConfigurationError("The configured CKB RPC URL is invalid.");
  }
  return url.toString();
}

export async function assertIssuerController(
  signer: Pick<ccc.SignerCkbPublicKey, "publicKey" | "getAddressObjSecp256k1">,
): Promise<void> {
  const address = await signer.getAddressObjSecp256k1();
  const expectedLock = ccc.Script.from(issuerMetadata.controller.lock);
  if (
    signer.publicKey.toLowerCase() !== issuerMetadata.controller.publicKey ||
    !address.script.eq(expectedLock) ||
    address.toString() !== issuerMetadata.controller.address ||
    address.script.hash() !== issuerMetadata.controller.lockHash
  ) {
    throw new IssuerConfigurationError(
      "The issuer controller credential does not match the published issuer metadata.",
    );
  }
}

export async function createIssuerSigner(
  environment: IssuerEnvironment = process.env,
): Promise<IssuerSigner> {
  const client = new ccc.ClientPublicTestnet({ url: issuerRpcUrl(environment) });
  let signer: IssuerSigner;
  try {
    signer = new ccc.SignerCkbPrivateKey(client, issuerCredential(environment));
    await assertIssuerController(signer);
  } catch (error) {
    if (error instanceof IssuerConfigurationError) {
      throw error;
    }
    throw new IssuerConfigurationError("The issuer controller credential is invalid.");
  }
  return signer;
}

export async function issueVerifiedClaim(
  subject: VerificationSubject,
  claim: VerifiedClaim,
  environment: IssuerEnvironment = process.env,
  dependencies: IssuanceDependencies = issuanceDependencies,
): Promise<ClaimIssuanceResult> {
  const [result] = await issueVerifiedClaims(subject, [claim], environment, dependencies);
  return result;
}

export async function issueVerifiedClaims(
  subject: VerificationSubject,
  claims: readonly VerifiedClaim[],
  environment: IssuerEnvironment = process.env,
  dependencies: IssuanceDependencies = issuanceDependencies,
): Promise<ClaimIssuanceResult[]> {
  if (claims.length < 1 || claims.length > 8) {
    throw new TypeError("Claim issuance requires between one and eight claims.");
  }

  const issuerSigner = await dependencies.createSigner(environment);
  const built = await dependencies.writeClaims({
    issuerSigner,
    scripts: claimScripts,
    inputs: claims.map((claim) => ({
      subject,
      issuerDid: issuerMetadata.did,
      schemaHash: claim.schema.hash,
      payload: claim.payload,
      issuedAt: claim.issuedAt,
      expiresAt: claim.expiresAt,
    })),
  });

  const prepared = built.tx;

  const preparedHash = prepared.hash();
  const signed = await issuerSigner.signOnlyTransaction(prepared);
  if (signed.hash() !== preparedHash) {
    throw new Error("The issuer signer changed the prepared transaction.");
  }
  const transactionHash = await issuerSigner.client.sendTransaction(signed);

  return built.claims.map((claim) => ({
    status: "submitted",
    network: issuerMetadata.network,
    payer: issuerMetadata.payer,
    transactionHash,
    claimId: claim.claimId,
    outputIndex: claim.outputIndex,
  }));
}
