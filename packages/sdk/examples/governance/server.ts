import { ccc } from "@ckb-ccc/core";
import { didToArgs } from "@ckb-ccc/did-ckb";
import { readClaims } from "@usevellum/sdk";

import { githubGate, LIVE_GITHUB_SUBJECT } from "./config.js";
import { evaluateGithubGate } from "./decision.js";
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
      filter: {
        subject: { did: subjectDid },
        issuerDid: githubGate.requirements[0].issuerDid,
        schemaHash: githubGate.requirements[0].schemaHash,
        evaluationTime,
      },
    });

    return json({
      subjectDid,
      evaluationTime: String(evaluationTime),
      eligible: evaluateGithubGate(result, evaluationTime),
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
