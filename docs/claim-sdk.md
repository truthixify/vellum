# Claim SDK API

This document defines the public Claim Cell API intended for `@ckb-ccc/did-ckb`. It maps directly
to the [Claim Cell protocol](./claim-cell.md) and follows the existing CCC convention of accepting
one properties object and returning transaction builders without signing or broadcasting them.

The SDK remains deployment-neutral. Applications provide the Claim Type and optional DID Lock
script information for the network they use. A direct subject lock does not require DID Lock;
`did:ckb` is a convenience path that derives the subject lock from the identity Type Script.

## Public types

```ts
import type { ccc } from "@ckb-ccc/core";

export type ClaimScriptConfigLike = {
  claimType: ccc.ScriptInfoLike;
  didLock?: ccc.ScriptInfoLike;
  /** Defaults to the client's KnownScript.DidCkb entry. */
  didCkb?: ccc.ScriptInfoLike;
};

export type ClaimSubjectLike =
  | {
      lock: ccc.ScriptLike;
      did?: never;
    }
  | {
      did: string;
      lock?: never;
    };

export type ClaimDataV1Like<TPayload = unknown> = {
  issuerId: ccc.HexLike;
  nonce: ccc.HexLike;
  issuedAt: ccc.NumLike;
  expiresAt?: ccc.NumLike | null;
  payload: TPayload;
};

export type ClaimDataLike<TPayload = unknown> = {
  type?: "v1";
  value: ClaimDataV1Like<TPayload>;
};

export type ClaimTimeEvaluation =
  | {
      status: "not-evaluated";
    }
  | {
      status: "not-yet-active" | "active" | "expired";
      evaluatedAt: ccc.Num;
    };

export type ClaimIssuerState =
  | {
      status: "active";
      cell: ccc.Cell;
      controller: ccc.Script;
    }
  | {
      status: "deactivated" | "missing";
    }
  | {
      status: "ambiguous";
      cells: readonly ccc.Cell[];
    }
  | {
      status: "unavailable";
      reason: string;
    };

export type Claim<TPayload = unknown> = {
  version: "v1";
  claimId: ccc.Hex;
  issuerDid: string;
  issuerId: ccc.Hex;
  issuerType: ccc.Script;
  issuerState: ClaimIssuerState;
  subjectLock: ccc.Script;
  subjectLockHash: ccc.Hex;
  schemaHash: ccc.Hex;
  nonce: ccc.Hex;
  issuedAt: ccc.Num;
  expiresAt?: ccc.Num;
  payload: TPayload;
  payloadBytes: ccc.Hex;
  cell: ccc.Cell;
  duplicateCells: readonly ccc.Cell[];
  verification: {
    inclusion: "live";
    issuerAuthorization: "validated-by-claim-type";
    time: ClaimTimeEvaluation;
  };
};

export type ClaimFilter = {
  subject: ClaimSubjectLike;
  issuerDid?: string;
  schemaHash?: ccc.HexLike;
  /** No current-clock default is applied when this is omitted. */
  evaluationTime?: ccc.NumLike;
  order?: "asc" | "desc";
  /** Indexer page size, not a cap on the complete result. */
  pageSize?: number;
};

export type ClaimReadFailureCode =
  | "invalid-type-args"
  | "unsupported-data-version"
  | "invalid-claim-data"
  | "invalid-dag-cbor"
  | "non-canonical-dag-cbor";

export type ClaimReadFailure = {
  cell: ccc.Cell;
  code: ClaimReadFailureCode;
  message: string;
};

export type ReadClaimsResult = {
  claims: Claim[];
  invalid: ClaimReadFailure[];
};

export type ReadClaimsProps = {
  client: ccc.Client;
  scripts: ClaimScriptConfigLike;
  filter: ClaimFilter;
};

export type WriteClaimInput<TPayload = unknown> = {
  subject: ClaimSubjectLike;
  issuerDid: string;
  schemaHash: ccc.HexLike;
  payload: TPayload;
  issuedAt: ccc.NumLike;
  expiresAt?: ccc.NumLike | null;
  /** Generated with a cryptographically secure random source when omitted. */
  nonce?: ccc.HexLike;
  /** Output capacity in shannons; defaults to the exact occupied capacity. */
  capacity?: ccc.NumLike;
};

export type WriteClaimProps<TPayload = unknown> = {
  issuerSigner: ccc.Signer;
  /** Defaults to issuerSigner. */
  payerSigner?: ccc.Signer;
  scripts: ClaimScriptConfigLike;
  input: WriteClaimInput<TPayload>;
  tx?: ccc.TransactionLike;
};

export type WriteClaimResult = {
  tx: ccc.Transaction;
  claimId: ccc.Hex;
  outputIndex: number;
  issuerInputIndex: number;
};

export type ClaimSchema<TPayload> = {
  id: string;
  hash: ccc.HexLike;
  parse: (payload: unknown) => TPayload;
};

export declare function readClaims(props: ReadClaimsProps): Promise<ReadClaimsResult>;

export declare function writeClaim<TPayload = unknown>(
  props: WriteClaimProps<TPayload>,
): Promise<WriteClaimResult>;

export declare function parseClaimPayload<TPayload>(
  claim: Claim,
  schema: ClaimSchema<TPayload>,
): TPayload;
```

The implementation may expose the Molecule-backed `ClaimDataV1` and `ClaimData` entity classes in
addition to the `Like` types above, following the package's existing codec pattern. Their encoded
field order must remain `issuer_id`, `nonce`, `issued_at`, `expires_at`, and `payload`.

## Read behavior

`readClaims` performs one complete, internally paginated query for the exact subject lock. It then
restricts results to the configured Claim Type `codeHash` and `hashType`, decodes the 65-byte Type
arguments, and applies optional issuer and schema filters. An issuer DID filter uses the configured
`didCkb` Script Info, or the client's `KnownScript.DidCkb` entry when no override is provided, so an
identifier from another DID deployment cannot match accidentally.

For `{ lock }`, the supplied complete lock is the subject. For `{ did }`, the SDK:

1. validates and decodes the `did:ckb` identifier;
2. constructs the complete identity Type Script;
3. hashes that Script to obtain the DID Lock arguments; and
4. constructs the subject lock from the configured DID Lock Script Info.

The DID convenience form fails before querying when `scripts.didLock` is absent. It never falls back
to the current wallet lock.

Every valid result includes the raw live Cell, the decoded payload, its canonical payload bytes,
the reconstructed issuer Type Script, the complete subject lock, and the derived hashes. The reader
recomputes `claimId` from the exact protocol preimage. Identical live IDs are returned once;
additional Cells are retained in `duplicateCells` so callers can inspect the anomaly without
counting it more than once.

An unknown schema hash is valid and returns `payload: unknown`. Invalid Molecule or DAG-CBOR data is
isolated in `invalid`; it does not reject otherwise valid results. Indexer, RPC, and invalid caller
configuration failures reject the complete operation because the SDK cannot claim that the query
was complete.

### Verification fields

`inclusion: "live"` means the configured CKB indexer returned the Cell as live under the exact
subject lock and Claim Type deployment. `issuerAuthorization: "validated-by-claim-type"` records
that creation was accepted by that configured Type Script. It is not a detached-signature result
and does not establish that an application should trust the issuer.

`issuerState` describes the issuer DID at read time. `deactivated` requires historical evidence that
the DID existed and was consumed; `missing` means the reader has neither a live state nor sufficient
history to make that stronger statement. `unavailable` is reserved for an operational failure and
must not be collapsed into `missing`.

### Time evaluation

The SDK never reads the local clock implicitly. With no `evaluationTime`, each claim reports
`not-evaluated`. When a caller supplies a checkpoint, the result is:

```text
not-yet-active  evaluationTime < issuedAt
active          issuedAt <= evaluationTime
                and (expiresAt is absent or evaluationTime < expiresAt)
expired         expiresAt is present and evaluationTime >= expiresAt
```

Expiry therefore begins exactly at `expiresAt`. This comparison says nothing about whether the
Claim Cell or issuer DID state existed at an earlier checkpoint; a historical decision needs
separate CKB state and inclusion evidence.

## Write behavior

`writeClaim` is a transaction builder, matching the existing CCC create and transfer helpers. It
returns a prepared transaction plus stable output metadata, but does not sign or broadcast. The
caller can inspect or compose the transaction, obtain every required signature, submit it with a
CCC client, and retain the resulting transaction hash.

The builder:

1. validates the DID, schema hash, nonce, timestamps, and payload;
2. encodes the payload as canonical DAG-CBOR and the claim as strict Molecule;
3. derives the Claim Type arguments from the issuer DID deployment and schema hash;
4. resolves exactly one current issuer DID Cell and its controller lock;
5. requires `issuerSigner` to control that exact lock and adds a plain, lock-only authorization
   input;
6. uses the supplied subject lock or derives DID Lock for a `did:ckb` subject;
7. calculates occupied capacity from the serialized output and data;
8. adds the configured Claim Type, issuer DID, and optional DID Lock dependencies, while signer
   preparation supplies the controller-lock dependency; and
9. uses `payerSigner` for additional capacity and fee inputs when one is supplied.

When issuer and payer differ, the builder preserves the capacity of the issuer's authorization
input in an output controlled by the same issuer lock. The payer funds the Claim output and fee.
This is an SDK construction policy, not an on-chain proof of economic attribution. If
`payerSigner` is omitted, the issuer fills both roles. When both are present, their clients must
target the same network.

A supplied transaction may already contain an issuer DID input/output pair, a matching DID Cell
dependency, or a newly created issuer DID output. The builder follows the Claim Type source
selection rules and rejects an ambiguous combination instead of adding a second source silently.

The output capacity defaults to the exact occupied capacity. A caller may request more, but a value
below the occupied capacity fails before inputs are collected. The complete encoded Claim data must
remain within the protocol's 16,384-byte limit.

## Payload typing

The base reader returns `Claim<unknown>` because a schema hash alone cannot make arbitrary decoded
CBOR type-safe. Known schemas provide a small parser object:

```ts
const githubAccount = parseClaimPayload(claim, {
  id: "vellum.social.github.v1",
  hash: githubSchemaHash,
  parse: parseGithubAccount,
});
```

`parseClaimPayload` first requires an exact schema-hash match, then calls the schema parser. It never
casts `unknown` to `TPayload` without validation. Schema registries and application-specific types
remain outside the base SDK.

## Examples

Read claims at a reproducible application checkpoint:

```ts
const result = await readClaims({
  client,
  scripts,
  filter: {
    subject: { did: builderDid },
    issuerDid: trustedIssuerDid,
    schemaHash: githubSchemaHash,
    evaluationTime: checkpointTimestamp,
  },
});
```

Build and submit a claim when the issuer also pays:

```ts
const built = await writeClaim({
  issuerSigner,
  scripts,
  input: {
    subject: { did: builderDid },
    issuerDid,
    schemaHash: githubSchemaHash,
    payload: githubPayload,
    issuedAt,
  },
});

const txHash = await issuerSigner.sendTransaction(built.tx);
```

The returned `claimId` is available before submission. The on-chain locator after submission is
`{ txHash, index: built.outputIndex }`.

## Error boundaries

Caller and transaction-construction errors reject with actionable messages. These include invalid
identifier or hash lengths, invalid timestamp ordering, oversized data, absent DID Lock
configuration, a missing or ambiguous issuer state, a signer that does not control the issuer,
insufficient capacity, and conflicting issuer sources in a supplied transaction.

Per-Cell decode failures are data-quality results and belong in `ReadClaimsResult.invalid`. Network
or indexer failures reject `readClaims`; returning a partial array as though the query completed
would be unsafe for scoring or authorization decisions.

## Non-goals

- No detached issuer signature or signature-verification helper.
- No `did:key` or `did:web` issuer fallback.
- No requirement that a subject use DID Lock.
- No implicit trust list, score, schema registry, or wall-clock policy.
- No historical-state claim based only on timestamp comparison.
- No automatic signing or transaction broadcast inside the builder.
