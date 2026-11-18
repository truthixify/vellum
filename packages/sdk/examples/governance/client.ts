import { ccc } from "@ckb-ccc/core";
import { readClaims } from "@usevellum/sdk";

import { githubGate, LIVE_GITHUB_SUBJECT } from "./config.js";
import { evaluateGithubGate } from "./decision.js";
import { testnetScripts } from "../testnet.js";

export async function checkGithubEligibility(
  subjectDid: string,
  evaluationTime: ccc.NumLike,
): Promise<boolean> {
  const result = await readClaims({
    client: new ccc.ClientPublicTestnet({ url: "https://testnet.ckbapp.dev" }),
    scripts: testnetScripts,
    filter: {
      subject: { did: subjectDid },
      issuerDid: githubGate.requirements[0].issuerDid,
      schemaHash: githubGate.requirements[0].schemaHash,
      evaluationTime,
    },
  });
  return evaluateGithubGate(result, evaluationTime);
}

if (import.meta.main) {
  const evaluationTime = BigInt(Math.floor(Date.now() / 1_000));
  const eligible = await checkGithubEligibility(LIVE_GITHUB_SUBJECT, evaluationTime);
  if (!eligible) throw new Error("The live Testnet fixture did not satisfy the GitHub gate");
  console.log(
    JSON.stringify({
      subjectDid: LIVE_GITHUB_SUBJECT,
      evaluationTime: String(evaluationTime),
      eligible,
    }),
  );
}
