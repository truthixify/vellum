import { ccc } from "@ckb-ccc/connector-react";

export type DidCkbDeployment = {
  network: "mainnet" | "testnet";
  codeHash: ccc.Hex;
  hashType: ccc.HashType;
  txHash: ccc.Hex;
  index: ccc.Num;
  depType: ccc.DepType;
};

export const DID_CKB_MAINNET: DidCkbDeployment = {
  network: "mainnet",
  codeHash: "0x4a06164dc34dccade5afe3e847a97b6db743e79f5477fa3295acf02849c5984a",
  hashType: "type",
  txHash: "0xe2f74c56cdc610d2b9fe898a96a80118845f5278605d7f9ad535dad69ae015bf",
  index: 0n,
  depType: "code",
};

export const DID_CKB_TESTNET: DidCkbDeployment = {
  network: "testnet",
  codeHash: "0x510150477b10d6ab551a509b71265f3164e9fd4137fcb5a4322f49f03092c7c5",
  hashType: "type",
  txHash: "0x0e7a830e2d5ebd05cd45a55f93f94559edea0ef1237b7233f49f7facfb3d6a6c",
  index: 0n,
  depType: "code",
};

export function deploymentForClient(client: ccc.Client): DidCkbDeployment {
  return client instanceof ccc.ClientPublicMainnet ? DID_CKB_MAINNET : DID_CKB_TESTNET;
}

export function didCkbCellDep(deployment: DidCkbDeployment): ccc.CellDepLike {
  return {
    outPoint: { txHash: deployment.txHash, index: deployment.index },
    depType: deployment.depType,
  };
}

export function didCkbTypeScript(deployment: DidCkbDeployment, args: ccc.Hex): ccc.ScriptLike {
  return {
    codeHash: deployment.codeHash,
    hashType: deployment.hashType,
    args,
  };
}
