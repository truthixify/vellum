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
  if (result.invalid.length > 0) {
    throw new Error("Eligibility is unavailable because the subject has malformed Claim Cells");
  }
  return checkPolicy(result.claims, githubGate, evaluationTime);
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
}`;
