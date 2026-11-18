import { ccc } from "@ckb-ccc/core";
import { didToArgs } from "@ckb-ccc/did-ckb";
import { checkPolicy, readClaims } from "@usevellum/sdk";

import { githubGate, LIVE_GITHUB_SUBJECT } from "./config.js";
import { testnetScripts } from "../testnet.js";

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request): Promise<Response> {
  const subjectDid = new URL(request.url).searchParams.get("did")?.trim();
  if (!subjectDid) return json({ eligible: false, error: "A subject DID is required" }, 400);
  try {
    didToArgs(subjectDid);
  } catch {
    return json({ eligible: false, error: "The subject DID is invalid" }, 400);
  }

  const evaluationTime = BigInt(Math.floor(Date.now() / 1_000));
  try {
    const result = await readClaims({
      client: new ccc.ClientPublicTestnet({
        url: process.env.CKB_RPC_URL ?? "https://testnet.ckbapp.dev",
      }),
      scripts: testnetScripts,
      filter: { subject: { did: subjectDid }, evaluationTime },
    });
    if (result.invalid.length > 0) throw new Error("Malformed Claim Cells prevent a decision");

    return json({
      subjectDid,
      evaluationTime: String(evaluationTime),
      eligible: checkPolicy(result.claims, githubGate, evaluationTime),
    });
  } catch {
    return json({ eligible: false, error: "Eligibility is currently unavailable" }, 503);
  }
}

if (import.meta.main) {
  const response = await GET(
    new Request(`http://localhost/api/eligibility?did=${encodeURIComponent(LIVE_GITHUB_SUBJECT)}`),
  );
  if (!response.ok) throw new Error(await response.text());
  console.log(await response.text());
}
