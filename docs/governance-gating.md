# Governance gating with Vellum claims

Vellum Claim Cells can gate an application action without turning Vellum's reputation score into a
universal permission system. The consuming application chooses exact schema hashes, trusted issuer
DIDs, and an evaluation checkpoint. This reference is for CKB Testnet; it is not an audited
governance framework.

## Define the policy

Requirements always pair an issuer DID with a schema hash. A matching schema from another issuer is
not trusted automatically.

```ts
const githubGate = {
  mode: "all",
  requirements: [{ issuerDid: vellumIssuerDid, schemaHash: githubSchemaHash }],
} satisfies ClaimPolicy;
```

`checkPolicy` supports `any`, `all`, and `threshold`. It rejects empty policies, duplicate pairs,
and invalid thresholds instead of silently weakening the gate.

## Check eligibility in a client

Use a client-side check to explain eligibility before an action. Pass the same explicit checkpoint
to `readClaims` and `checkPolicy`.

```ts
const result = await readClaims({
  client,
  scripts: testnetScripts,
  filter: { subject: { did: subjectDid }, evaluationTime },
});
if (result.invalid.length > 0) throw new Error("Eligibility unavailable");
const eligible = checkPolicy(result.claims, githubGate, evaluationTime);
```

The complete runnable example is
[`packages/sdk/examples/governance/client.ts`](../packages/sdk/examples/governance/client.ts).
Client results improve the interface, but must not authorize a durable action because callers can
alter browser code and inputs.

## Enforce the gate on a server

Re-read claims on the trusted side immediately before accepting the action. Select and record the
checkpoint there, return an unavailable result when CKB data is incomplete, and never treat an RPC
failure as ineligibility or eligibility.

```ts
const evaluationTime = BigInt(Math.floor(Date.now() / 1_000));
const result = await readClaims({
  client: testnetClient,
  scripts: testnetScripts,
  filter: { subject: { did: subjectDid }, evaluationTime },
});
if (result.invalid.length > 0) throw new Error("Eligibility unavailable");
const eligible = checkPolicy(result.claims, githubGate, evaluationTime);
```

The runnable Web `Request`/`Response` route is
[`packages/sdk/examples/governance/server.ts`](../packages/sdk/examples/governance/server.ts).

## Security boundaries

- `readClaims` returns current live Cells. A destroyed claim no longer appears; removal is not a
  permanent issuer revocation because an authorized issuer can create a new claim.
- `checkPolicy` requires live inclusion, an active current issuer DID, Claim Type authorization, and
  an active time evaluation at the exact checkpoint. Expiry begins when
  `evaluationTime == expiresAt`.
- Issuer trust is application policy. On-chain authorization proves that the current DID controller
  authorized the Claim Cell transaction, not that the DID represents a named organization.
- Comparing `issuedAt` or `expiresAt` with an earlier checkpoint does not prove that the Claim Cell
  or issuer DID state existed then. Historical eligibility needs separate block inclusion and CKB
  state evidence.
- A complete governance system must separately authenticate control of the subject DID, prevent
  replay, persist one decision per voter, and define proposal and tally rules.

## Live Testnet check

Both examples are tested against the public GitHub claim on
[`did:ckb:4kiidiczwthgxj7dltzkzopgbwu3v6jc`](https://usevellum.xyz/profile/did%3Ackb%3A4kiidiczwthgxj7dltzkzopgbwu3v6jc),
using Vellum issuer `did:ckb:hlvxrdt3e7iwvuxdmbvejp6hc4yoo3no` and the pinned
`vellum.social.github.v1` schema hash. Run:

```bash
bun run --cwd packages/sdk test:testnet
```
