import { ccc } from "@ckb-ccc/core";
import type { ClaimScriptConfigLike } from "@vellum/sdk";

import deployment from "../../../../deployments/testnet.json";

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

export const dashboardClaimScripts = {
  claimType: scriptInfo(deployment.contracts.claimType),
  didLock: scriptInfo(deployment.contracts.didLock),
} satisfies ClaimScriptConfigLike;
