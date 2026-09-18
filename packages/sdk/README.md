# @vellum/sdk

Typed Claim Cell codecs and APIs for Vellum and other CKB applications.

## Write claims

`writeClaim` builds and balances a Claim Cell transaction. It returns the unsigned transaction and
stable claim metadata so applications can inspect it, collect every required signature, and submit
it explicitly.

```ts
import { writeClaim } from "@vellum/sdk";

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

const signed = await issuerSigner.signOnlyTransaction(built.tx);
const txHash = await issuerSigner.client.sendTransaction(signed);
const claimOutPoint = { txHash, index: built.outputIndex };
```

The issuer must control the current `did:ckb` controller lock. By default the issuer also funds the
Claim Cell and transaction fee; pass `payerSigner` to fund them separately. Pass
`additionalSigners` when a supplied transaction already contains other input lock groups, and have
each distinct signer sign the returned transaction before broadcasting it.

Output capacity defaults to the exact occupied capacity of the serialized Claim Cell. Applications
may request more with `input.capacity`, but cannot request less. Use `subject: { lock }` for any
complete CKB lock, or configure `scripts.didLock` and use `subject: { did }` to bind the claim to a
live `did:ckb` identity.

## Read claims

`readClaims` scans every live Claim Cell under one exact subject lock. A `did:ckb` subject can be
used when that subject holds claims under Vellum's DID Lock. Applications provide the contract
deployment information so the same API can be used on different CKB networks.

```ts
import { ccc } from "@ckb-ccc/core";
import { parseClaimPayload, readClaims } from "@vellum/sdk";

const client = new ccc.ClientPublicTestnet();
const result = await readClaims({
  client,
  scripts: {
    claimType: {
      codeHash: claimTypeCodeHash,
      hashType: "type",
      cellDeps: [claimTypeCellDep],
    },
    didLock: {
      codeHash: didLockCodeHash,
      hashType: "type",
      cellDeps: [didLockCellDep],
    },
  },
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
for (const rejected of result.invalid) {
  console.warn(rejected.cell.outPoint, rejected.code, rejected.message);
}
```

Use `subject: { lock }` to query any complete CKB lock directly. Filters for `issuerDid` and
`schemaHash` are optional. `evaluationTime` is an application-selected Unix timestamp in seconds;
the SDK never reads the local clock implicitly, and a claim expires exactly at `expiresAt`.

The base reader returns payloads as `unknown`. Use `parseClaimPayload` with a schema parser to obtain
an application type only after verifying the schema hash.

```ts
const profile = parseClaimPayload(claim, {
  id: "example.profile.v1",
  hash: profileSchemaHash,
  parse: parseProfile,
});
```

Malformed Cells are returned in `invalid` without hiding valid claims. A failed subject scan rejects
the operation because its result would be incomplete. Issuer lookup failures remain attached to the
claim as `issuerState: { status: "unavailable", reason }` so authorization code can fail closed.

## Checks

```bash
bun run --cwd packages/sdk typecheck
bun run --cwd packages/sdk test
```

The live integration suite reads committed Testnet fixtures at transactions
[`0x9e32511b...ff91c`](https://testnet.explorer.nervos.org/transaction/0x9e32511bcaa49d89421d070d28eded7168fa9010a007659151e7f8928caff91c)
and
[`0xbbe64d73...a4142`](https://testnet.explorer.nervos.org/transaction/0xbbe64d73351dbe0faa617f8d5ac0d9624845c329e1d5d7b722a90456cfea4142).
It also prepares a fresh unsigned `writeClaim` transaction against current Testnet state. The
fixture DID and Claim outputs must remain unspent. These network-dependent checks are intentionally
separate from the offline suite:

```bash
bun run --cwd packages/sdk test:testnet
```
