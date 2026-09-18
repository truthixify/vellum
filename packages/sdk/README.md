# @vellum/sdk

Typed Claim Cell codecs and APIs for Vellum and other CKB applications.

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

The known-claim integration test reads the committed Testnet fixture at transaction
[`0x9e32511b...ff91c`](https://testnet.explorer.nervos.org/transaction/0x9e32511bcaa49d89421d070d28eded7168fa9010a007659151e7f8928caff91c),
output `1`. The fixture DID and Claim outputs must remain unspent. The live check is intentionally
separate from the offline suite:

```bash
bun run --cwd packages/sdk test:testnet
```
