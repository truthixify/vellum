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
