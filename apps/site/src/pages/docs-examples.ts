export const READ_CLAIMS_EXAMPLE = `export function findClaims(
  client: ccc.Client,
  subjectDid: string,
  evaluationTime: ccc.NumLike
) {
  return readClaims({
    client,
    scripts: testnetScripts,
    filter: { subject: { did: subjectDid }, evaluationTime },
  });
}`;

export const RESOLVE_IDENTITY_EXAMPLE = `export function resolveIdentity(
  client: ccc.Client,
  did: string
) {
  return resolveDidCkb({ client, did });
}`;

export const ISSUE_CLAIM_EXAMPLE = `export async function issueClaim<TPayload>(
  issuerSigner: ccc.Signer,
  input: WriteClaimInput<TPayload>,
) {
  const built = await prepareClaim(issuerSigner, input);
  const preparedHash = built.tx.hash();
  const signed = await issuerSigner.signOnlyTransaction(built.tx);
  if (signed.hash() !== preparedHash) {
    throw new Error("Signer changed the prepared transaction");
  }
  const txHash = await issuerSigner.client.sendTransaction(signed);
  return { txHash, claimId: built.claimId, outputIndex: built.outputIndex };
}`;

export const GOVERNANCE_POLICY_EXAMPLE = `export const githubGate = {
  mode: "all",
  requirements: [
    {
      issuerDid: VELLUM_ISSUER_DID,
      schemaHash: GITHUB_SCHEMA_HASH,
    },
  ],
} as const satisfies ClaimPolicy;`;

export const GOVERNANCE_DECISION_EXAMPLE = `export function evaluateGithubGate(result: ReadClaimsResult, evaluationTime: ccc.NumLike): boolean {
  const eligible = checkPolicy(result.claims, githubGate, evaluationTime);
  if (eligible) return true;
  if (result.invalid.length > 0) {
    throw new Error("Eligibility is unavailable because filtered Claim Cells are malformed");
  }
  if (result.claims.some((claim) => claim.issuerState.status === "unavailable")) {
    throw new Error("Eligibility is unavailable because issuer state could not be resolved");
  }
  return false;
}`;

export const CLIENT_GATE_EXAMPLE = `export async function checkGithubEligibility(
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
}`;

export const SERVER_GATE_EXAMPLE = `export async function GET(request: Request): Promise<Response> {
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
}`;
