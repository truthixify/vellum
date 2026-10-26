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

export const ISSUE_CLAIM_EXAMPLE = `export function prepareClaim<TPayload>(
  issuerSigner: ccc.Signer,
  input: WriteClaimInput<TPayload>
) {
  return writeClaim({ issuerSigner, scripts: testnetScripts, input });
}`;
