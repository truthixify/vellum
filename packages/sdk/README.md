# @usevellum/sdk

`@usevellum/sdk` provides typed Claim Cell codecs, reads, and transaction construction for Vellum
and other CKB applications. It uses `@ckb-ccc/did-ckb` for identity primitives while keeping the
Claim Cell API and release lifecycle in Vellum.

The package is ESM-only and supports browser and server applications that use CCC.

## Install

```bash
bun add @usevellum/sdk @ckb-ccc/core
```

## Testnet deployment

Vellum's current Claim contracts are Type ID code cells on CKB Testnet. They are upgradable Testnet
infrastructure, not audited Mainnet deployments.

| Script     | Code hash                                                            | Code cell outpoint        |
| ---------- | -------------------------------------------------------------------- | ------------------------- |
| Claim Type | `0xfb2757e524b3f83161d8b85b8b3e00186e2019ff04f5dfe833c5a72731e13157` | `0xaf693346...e2686c:0x0` |
| DID Lock   | `0xe1562cc57b4bd91619ada2f7e74d63805ea7038a7b6de0b18a529d51aa883d2d` | `0xaf693346...e2686c:0x1` |

Both use `hashType: "type"` and `depType: "code"`. The complete, machine-readable deployment is
[`deployments/testnet.json`](https://github.com/truthixify/vellum/blob/main/deployments/testnet.json).
There is no Vellum Claim Type or DID Lock deployment on CKB Mainnet.

A complete configuration object is available in
[`examples/api.ts`](https://github.com/truthixify/vellum/blob/main/packages/sdk/examples/api.ts).

## Encode and decode

`ClaimDataV1` represents the current Claim Cell data layout. `ClaimData` is the versioned Molecule
union written to cell data. Payloads are encoded as canonical DAG-CBOR.

```ts
import { ClaimData, ClaimDataV1 } from "@usevellum/sdk";

const data = ClaimDataV1.from({
  issuerId,
  nonce,
  issuedAt,
  expiresAt,
  payload: { account: "truthixify" },
});

const encoded = ClaimData.fromV1(data).toHex();
const decoded = ClaimData.decode(encoded);
```

## Read claims

`readClaims` scans every live Claim Cell under one exact subject lock. Applications supply the
contract deployment, the subject, and any issuer or schema filters they want to enforce.

```ts
import { ccc } from "@ckb-ccc/core";
import { readClaims } from "@usevellum/sdk";

const client = new ccc.ClientPublicTestnet();
const result = await readClaims({
  client,
  scripts,
  filter: {
    subject: { did: subjectDid },
    issuerDid,
    schemaHash,
    evaluationTime: checkpointTimestamp,
  },
});

for (const claim of result.claims) {
  console.log(claim.claimId, claim.payload, claim.verification.time);
}
```

Use `subject: { lock }` to query any complete CKB lock directly. A `did:ckb` subject requires the
DID Lock deployment in `scripts`. `issuerDid` and `schemaHash` are optional filters.

`evaluationTime` is an application-selected Unix timestamp in seconds. The SDK never reads the
local clock implicitly, and a claim expires exactly at `expiresAt`. Checking an earlier timestamp
does not prove that the claim or DID state existed then; historical decisions need separate chain
state and inclusion evidence.

Malformed Cells are returned in `invalid` without hiding valid claims. A failed subject scan rejects
the operation because its result would be incomplete. Issuer lookup failures stay attached to a
claim as `issuerState: { status: "unavailable", reason }`, which authorization code should treat as
fail-closed.

## Parse a payload

The base reader returns payloads as `unknown`. `parseClaimPayload` checks the schema hash before
running an application parser.

```ts
import { parseClaimPayload } from "@usevellum/sdk";

const profile = parseClaimPayload(claim, {
  id: "example.profile.v1",
  hash: profileSchemaHash,
  parse: parseProfile,
});
```

## Write claims

`writeClaim` builds and balances one Claim Cell transaction. `writeClaims` adds between one and
eight claims for the same subject and issuer to one transaction, then performs signer preparation
and fee balancing once. Neither function signs or broadcasts. The returned metadata lets the
caller inspect every output and collect every required signature before submitting it.

```ts
import { writeClaim, writeClaims } from "@usevellum/sdk";

const built = await writeClaim({
  issuerSigner,
  scripts,
  input: {
    subject: { did: subjectDid },
    issuerDid,
    schemaHash,
    payload,
    issuedAt,
  },
});

const preparedHash = built.tx.hash();
const signed = await issuerSigner.signOnlyTransaction(built.tx);
if (signed.hash() !== preparedHash) {
  throw new Error("Signer changed the prepared transaction");
}

const txHash = await issuerSigner.client.sendTransaction(signed);
const claimOutPoint = { txHash, index: built.outputIndex };

const batch = await writeClaims({
  issuerSigner,
  scripts,
  inputs: [firstClaim, secondClaim],
});
```

Use `writeClaims` when one verification produces multiple claims. Its result contains `claims`, in
input order, with each claim's ID and output index. Batch construction avoids selecting the same
payer Cell independently for several transactions.

The issuer must control the current `did:ckb` controller lock. By default the issuer also pays for
the Claim Cell and transaction fee. Pass `payerSigner` to use a separate payer and
`additionalSigners` for pre-existing input lock groups. Every distinct signer must sign the final
prepared transaction before it is broadcast.

Output capacity defaults to the exact occupied capacity of the serialized Claim Cell. An explicit
`input.capacity` may be larger but cannot be smaller. A subject may be any complete CKB lock;
`subject: { did }` anchors the output to a live `did:ckb` identity through DID Lock.

## Public API

The package root exports six runtime values:

- `ClaimDataV1` and `ClaimData` for canonical Claim Cell encoding and decoding;
- `readClaims` for complete live subject scans;
- `parseClaimPayload` for schema-bound application parsing; and
- `writeClaim` and `writeClaims` for unsigned single-claim and atomic batch construction.

It also exports the public types used by those values: `Claim`, `ClaimDataLike`, `ClaimDataV1Like`,
`ClaimFilter`, `ClaimIssuerSource`, `ClaimIssuerState`, `ClaimReadFailure`,
`ClaimReadFailureCode`, `ClaimSchema`, `ClaimScriptConfigLike`, `ClaimSubjectLike`,
`ClaimTimeEvaluation`, `ReadClaimsProps`, `ReadClaimsResult`, `WriteClaimInput`, `WriteClaimProps`,
`WriteClaimResult`, `WriteClaimsProps`, and `WriteClaimsResult`.

## Verify

Run the offline unit suite, strict TypeScript checks, package build, executable example, and tarball
inspection with:

```bash
bun run --cwd packages/sdk test
bun run --cwd packages/sdk typecheck
bun run --cwd packages/sdk verify:package
```

`verify:package` starts from a clean build, type-checks and runs the example, inspects the
publishable tarball, and validates its ESM and TypeScript package exports.

The network-dependent suite reads committed Testnet fixtures, covers a claim whose issuer and
subject are different DIDs, proves a destroyed claim's capacity returned to the subject controller,
and prepares fresh unsigned single-claim and atomic batch transactions without broadcasting:

```bash
bun run --cwd packages/sdk test:testnet
```

These checks use public RPC and indexer state, so they remain separate from the deterministic CI
suite. The fixture DIDs and live Claim outputs must remain unspent. The live reads are anchored at
transactions
[`0x9e32511b...ff91c`](https://testnet.explorer.nervos.org/transaction/0x9e32511bcaa49d89421d070d28eded7168fa9010a007659151e7f8928caff91c),
[`0xbbe64d73...a4142`](https://testnet.explorer.nervos.org/transaction/0xbbe64d73351dbe0faa617f8d5ac0d9624845c329e1d5d7b722a90456cfea4142),
and
[`0xdd3ba6f4...19cb3`](https://testnet.explorer.nervos.org/transaction/0xdd3ba6f4574568df0f82a1a9201598da697ff4ce28b3b1cc7a28289ef2319cb3).
The reclaim proof links creation transaction
[`0x6003e4e1...255640`](https://testnet.explorer.nervos.org/transaction/0x6003e4e13d757a02003cc23d156f100ff351ca28f0d67df7f04bf71d18255640)
to spend transaction
[`0x647a5253...38816`](https://testnet.explorer.nervos.org/transaction/0x647a5253321acb45e8aa07195f0414678831f955610bdfcce59efa1107638816).

## Releases

Every public SDK change includes a Changeset describing its semver impact:

```bash
bun run changeset
```

After changes land on `main`, the release workflow creates or updates one version pull request. That
pull request applies the version bump and changelog. Merging it publishes the validated package,
creates the matching Git tag and GitHub release, and records npm provenance. Other workspace
packages are private and are not published.

Repository maintainers must enable GitHub Actions to create pull requests and create an `npm`
environment. The first publication uses a granular npm token with read/write access to the
`@usevellum` scope and permission to bypass publishing 2FA, stored as that environment's `NPM_TOKEN`
secret. After `0.1.0` exists, configure npm trusted publishing for `truthixify/vellum`, workflow
`release.yml`, and environment `npm`, allowing direct `npm publish`; set the repository variable
`NPM_TRUSTED_PUBLISHING=true`; then remove and revoke the bootstrap token. Later releases use OIDC
and do not require an npm token.
