import { ccc } from "@ckb-ccc/core";
import { resolveDidCkb } from "@ckb-ccc/did-ckb";
import { verifyCredential, type CredentialKeyType, type SigningAlg } from "@joyid/ckb";

import { issuerRpcUrl } from "../verification/issuer.js";

const JOYID_TESTNET_SERVER_URL = "https://api.testnet.joyid.dev/api/v1";

export type ControllerEnvironment = {
  [key: string]: string | undefined;
  CKB_RPC_URL?: string;
};

export type ControllerSignature = {
  identity: string;
  signature: string;
  signType: "BtcEcdsa" | "EvmPersonal" | "JoyId" | "NostrEvent" | "CkbSecp256k1" | "DogeEcdsa";
};

export type DidController = {
  client: ccc.Client;
  lock: ccc.Script;
};

export type DidControllerDependencies = {
  createClient: (rpcUrl: string) => ccc.Client;
  resolveDid: typeof resolveDidCkb;
  verifyMessage: typeof ccc.Signer.verifyMessage;
  verifyJoyIdCredential: typeof verifyCredential;
};

export const defaultDidControllerDependencies: DidControllerDependencies = {
  createClient: (rpcUrl) =>
    new ccc.ClientPublicTestnet({ url: rpcUrl, fallbacks: [], timeout: 10_000 }),
  resolveDid: resolveDidCkb,
  verifyMessage: ccc.Signer.verifyMessage,
  verifyJoyIdCredential: verifyCredential,
};

export class DidControllerUnavailableError extends Error {
  constructor() {
    super("The selected identity could not be resolved.");
    this.name = "DidControllerUnavailableError";
  }
}

export class DidControllerInactiveError extends Error {
  constructor() {
    super("The selected identity is not active on CKB Testnet.");
    this.name = "DidControllerInactiveError";
  }
}

export async function resolveDidController(
  did: string,
  environment: ControllerEnvironment = process.env,
  dependencies: DidControllerDependencies = defaultDidControllerDependencies,
): Promise<DidController> {
  const client = dependencies.createClient(issuerRpcUrl(environment));
  let record;
  try {
    record = await dependencies.resolveDid({ client, did });
  } catch {
    throw new DidControllerUnavailableError();
  }
  if (!record) throw new DidControllerInactiveError();
  return { client, lock: record.cell.cellOutput.lock };
}

async function signerControlsLock(
  client: ccc.Client,
  lock: ccc.Script,
  walletSignature: ControllerSignature,
  dependencies: DidControllerDependencies,
): Promise<boolean> {
  const identity = walletSignature.identity;
  switch (walletSignature.signType) {
    case ccc.SignerSignType.CkbSecp256k1: {
      const signer = new ccc.SignerCkbPublicKey(client, identity);
      return (await signer.getAddressObjSecp256k1()).script.eq(lock);
    }
    case ccc.SignerSignType.EvmPersonal: {
      const signer = new ccc.SignerEvmAddressReadonly(client, identity);
      return (await signer.getAddressObjs()).some(({ script }) => script.eq(lock));
    }
    case ccc.SignerSignType.BtcEcdsa: {
      const publicKey = identity.startsWith("0x") ? identity : `0x${identity}`;
      const signer = new ccc.SignerBtcPublicKeyReadonly(client, "", publicKey);
      return (await signer.getAddressObjs()).some(({ script }) => script.eq(lock));
    }
    case ccc.SignerSignType.NostrEvent: {
      const signer = new ccc.SignerNostrPublicKeyReadonly(client, identity);
      return (await signer.getAddressObjs()).some(({ script }) => script.eq(lock));
    }
    case ccc.SignerSignType.DogeEcdsa: {
      const signer = new ccc.SignerDogeAddressReadonly(client, identity);
      return (await signer.getAddressObjs()).some(({ script }) => script.eq(lock));
    }
    case ccc.SignerSignType.JoyId: {
      let identityValue: unknown;
      let signatureValue: unknown;
      try {
        identityValue = JSON.parse(identity);
        signatureValue = JSON.parse(walletSignature.signature);
      } catch {
        return false;
      }
      if (
        typeof identityValue !== "object" ||
        identityValue === null ||
        Array.isArray(identityValue) ||
        typeof signatureValue !== "object" ||
        signatureValue === null ||
        Array.isArray(signatureValue)
      ) {
        return false;
      }
      const joyIdentity = identityValue as { keyType?: unknown; publicKey?: unknown };
      const joySignature = signatureValue as { alg?: unknown };
      if (
        typeof joyIdentity.publicKey !== "string" ||
        typeof joyIdentity.keyType !== "string" ||
        typeof joySignature.alg !== "number"
      ) {
        return false;
      }
      const address = ccc.Address.from({ prefix: client.addressPrefix, script: lock }).toString();
      return dependencies.verifyJoyIdCredential(
        {
          pubkey: joyIdentity.publicKey,
          address,
          keyType: joyIdentity.keyType as CredentialKeyType,
          alg: joySignature.alg as SigningAlg,
        },
        JOYID_TESTNET_SERVER_URL,
      );
    }
    default:
      return false;
  }
}

export async function verifyControllerSignature(
  message: string,
  controller: DidController,
  walletSignature: ControllerSignature,
  dependencies: DidControllerDependencies = defaultDidControllerDependencies,
): Promise<boolean> {
  try {
    return (
      (await dependencies.verifyMessage(
        message,
        new ccc.Signature(
          walletSignature.signature,
          walletSignature.identity,
          walletSignature.signType as ccc.SignerSignType,
        ),
      )) &&
      (await signerControlsLock(controller.client, controller.lock, walletSignature, dependencies))
    );
  } catch {
    return false;
  }
}
