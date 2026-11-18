import type { ClaimPolicy } from "@usevellum/sdk";

export const VELLUM_ISSUER_DID = "did:ckb:hlvxrdt3e7iwvuxdmbvejp6hc4yoo3no";
export const GITHUB_SCHEMA_HASH =
  "0x25980dec7f198c7b228a621c61b911b8a20c55b340f398e495c4be65aa399f3c";

export const githubGate = {
  mode: "all",
  requirements: [
    {
      issuerDid: VELLUM_ISSUER_DID,
      schemaHash: GITHUB_SCHEMA_HASH,
    },
  ],
} as const satisfies ClaimPolicy;

export const LIVE_GITHUB_SUBJECT = "did:ckb:4kiidiczwthgxj7dltzkzopgbwu3v6jc";
