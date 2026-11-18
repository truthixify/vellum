import type { ccc } from "@ckb-ccc/core";
import { checkPolicy, type ReadClaimsResult } from "@usevellum/sdk";

import { githubGate } from "./config.js";

export function evaluateGithubGate(result: ReadClaimsResult, evaluationTime: ccc.NumLike): boolean {
  const eligible = checkPolicy(result.claims, githubGate, evaluationTime);
  if (eligible) return true;
  if (result.invalid.length > 0) {
    throw new Error("Eligibility is unavailable because filtered Claim Cells are malformed");
  }
  if (result.claims.some((claim) => claim.issuerState.status === "unavailable")) {
    throw new Error("Eligibility is unavailable because issuer state could not be resolved");
  }
  return false;
}
