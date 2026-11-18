import type { ClaimScriptConfigLike } from "@usevellum/sdk";

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
