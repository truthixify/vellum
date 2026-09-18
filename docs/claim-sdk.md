# Claim SDK API

This document defines the public Claim Cell API for the Vellum SDK. It maps directly to the
[Claim Cell protocol](./claim-cell.md) and follows the existing CCC convention of accepting one
properties object and returning transaction builders without signing or broadcasting them.

Vellum owns the Claim Cell codec, reader, transaction builder, and application policy.
`@ckb-ccc/did-ckb` remains an identity dependency for DID parsing and identity primitives; Claim
Cell APIs do not become part of that package.

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
  /** Issuer-asserted Unix timestamp in seconds. */
  issuedAt: ccc.NumLike;
  /** Optional expiry as a Unix timestamp in seconds. */
  expiresAt?: ccc.NumLike | null;
  payload: TPayload;
};

export type ClaimDataLike<TPayload = unknown> =
  | {
      type?: "v1" | null;
      value: ClaimDataV1Like<TPayload>;
    }
  | {
      inner: {
        type?: "v1" | null;
        value: ClaimDataV1Like<TPayload>;
      };
    };

export type ClaimTimeEvaluation =
  | {
      status: "not-evaluated";
    }
  | {
      status: "not-yet-active" | "active" | "expired";
      /** Application-selected Unix timestamp in seconds. */
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
  /** Issuer-asserted Unix timestamp in seconds. */
  issuedAt: ccc.Num;
  /** Optional expiry as a Unix timestamp in seconds. */
  expiresAt?: ccc.Num;
  payload: TPayload;
  payloadBytes: ccc.Hex;
  cell: ccc.Cell;
  duplicateCells: readonly ccc.Cell[];
  verification: {
    inclusion: "live";
    issuerAuthorization: "accepted-by-configured-claim-type";
    time: ClaimTimeEvaluation;
  };
};

export type ClaimFilter = {
  subject: ClaimSubjectLike;
  issuerDid?: string;
  schemaHash?: ccc.HexLike;
  /** Unix timestamp in seconds. No current-clock default is applied when omitted. */
  evaluationTime?: ccc.NumLike;
  /** CKB indexer chain order; defaults to "asc". */
  order?: "asc" | "desc";
  /** Indexer page size, not a cap on the complete result. */
  pageSize?: number;
};

export type ClaimReadFailureCode =
  | "unsupported-issuer-deployment"
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
  /** Issuer-asserted Unix timestamp in seconds. */
  issuedAt: ccc.NumLike;
  /** Optional expiry as a Unix timestamp in seconds. */
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
  /** Signers required by pre-existing input lock groups in tx. */
  additionalSigners?: readonly ccc.Signer[];
  scripts: ClaimScriptConfigLike;
  input: WriteClaimInput<TPayload>;
  tx?: ccc.TransactionLike;
};

export type ClaimIssuerSource =
  | {
      kind: "input";
      inputIndex: number;
      outputIndex: number;
    }
  | {
      kind: "cell-dep";
      cellDepIndex: number;
    }
  | {
      kind: "output";
      outputIndex: number;
    };

export type WriteClaimResult = {
  tx: ccc.Transaction;
  claimId: ccc.Hex;
  outputIndex: number;
  issuerSource: ClaimIssuerSource;
  controllerInputIndex: number;
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

The Vellum SDK exports the Molecule-backed `ClaimDataV1` and `ClaimData` entity classes in addition
to the `Like` types above, following CCC's entity codec pattern. Their encoded field order must
remain `issuer_id`, `nonce`, `issued_at`, `expires_at`, and `payload`.

## Read behavior

`readClaims` first resolves the configured `didCkb` Script Info, or the client's
`KnownScript.DidCkb` entry when no override is provided. It then performs one complete, internally
paginated on-chain query for the exact subject lock and configured Claim Type `codeHash` and
`hashType`. The query must bypass any client cache that could merge results out of chain order.

For every returned Cell, the reader decodes the 65-byte Type arguments and requires the issuer DID
`codeHash` and `hashType` in the first 33 bytes to equal the resolved `didCkb` deployment. This check
applies whether or not `filter.issuerDid` is present. A Cell from another issuer DID deployment is
placed in `invalid` with `unsupported-issuer-deployment`; it is never returned as a claim under the
configured deployment. The reader applies optional issuer-ID and schema filters only after this
deployment check.

For `{ lock }`, the supplied complete lock is the subject. For `{ did }`, the SDK:

1. validates and decodes the `did:ckb` identifier;
2. constructs the complete identity Type Script;
3. hashes that Script to obtain the DID Lock arguments; and
4. constructs the subject lock from the configured DID Lock Script Info.

The DID convenience form fails before querying when `scripts.didLock` is absent. It never falls back
to the current wallet lock. Reading only derives the expected lock; it does not require the subject
DID to remain live, so a caller can still inspect Cells stranded by subject deactivation.

Every valid result includes the raw live Cell, the decoded payload, its canonical payload bytes,
the reconstructed issuer Type Script, the complete subject lock, and the derived hashes. The reader
recomputes `claimId` from the exact protocol preimage. Identical live IDs are returned once;
additional Cells are retained in `duplicateCells` so callers can inspect the anomaly without
counting it more than once.

`order` defaults to `"asc"`. Ascending order is oldest to newest and descending order is newest to
oldest according to the CKB indexer's chain order. The reader preserves the order of the uncached
indexer pages; matching outputs from the same transaction follow their outpoint output index in the
requested direction. For duplicate IDs, `cell` is the first occurrence in that order and
`duplicateCells` contains the remaining occurrences in the same order.

An unknown schema hash is valid and returns `payload: unknown`. Invalid Molecule or DAG-CBOR data is
isolated in `invalid`; it does not reject otherwise valid results. Invalid caller configuration or a
failure while scanning the subject's Claim Cells rejects the complete operation because the SDK
cannot claim that the query was complete. A failure limited to resolving an issuer after that scan
returns the affected claims with `issuerState.status: "unavailable"`.

### Verification fields

`inclusion: "live"` means the configured CKB indexer returned the Cell as live under the exact
subject lock and Claim Type deployment. `issuerAuthorization: "accepted-by-configured-claim-type"`
means that the configured Type Script identity accepted the Cell's creation. With a `type` hash,
that identity can refer to code that has been upgraded since creation, so the field does not prove
which binary executed historically. It is not a detached-signature result and does not establish
that an application should trust the issuer.

`issuerState` describes the issuer DID at read time. For each distinct issuer Type Script, the
reader first performs an exact live-Cell lookup. Exactly one Cell is `active`; more than one is
`ambiguous`. When no live Cell exists, the reader exhausts an ascending, grouped
`client.findTransactionsByType` query for that exact Script and fetches the referenced committed
transactions needed to connect each matching output to a later input.

`deactivated` requires a complete, coherent single-state history whose final transition consumes
the issuer Cell without creating a replacement. `missing` requires a successfully completed history
query with no matching issuer output at any point. An unsupported history query, pagination or
network failure, unavailable referenced transaction, or inconsistent state chain produces
`unavailable` with a reason; it must never be treated as `missing`. Authorization consumers must
treat `unavailable` as a fail-closed state rather than accepting it as evidence of an active issuer.

### Time evaluation

Every SDK timestamp is a Unix timestamp in seconds. JavaScript `Date.now()` and CKB block-header
timestamps exposed by CCC are milliseconds; callers must divide those values by 1,000 with an
intentional rounding policy before passing them to this API, for example
`Math.floor(Date.now() / 1_000)`.

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
returns a final prepared and balanced transaction plus stable output metadata, but does not sign or
broadcast. The caller can inspect it, obtain every required signature, submit it with a CCC client,
and retain the resulting transaction hash. Mutating the returned transaction invalidates its fee and
witness-size assumptions; a caller that composes further changes must prepare every signer again and
repeat fee completion before signing.

The builder:

1. resolves the configured `didCkb` Script Info and validates the DID, schema hash, nonce,
   timestamps, and payload;
2. encodes the payload as canonical DAG-CBOR and the claim as strict Molecule;
3. derives the issuer Type Script and Claim Type arguments from only the resolved `didCkb`
   deployment, decoded issuer ID, and schema hash;
4. selects one issuer authorization state using the same input, cell-dep, and output precedence as
   Claim Type;
5. derives the controller from that selected state and requires `issuerSigner` to control the exact
   lock;
6. uses the supplied subject lock or validates and anchors a DID state before deriving DID Lock for
   a `did:ckb` subject;
7. calculates occupied capacity from the serialized output and data;
8. adds required code dependencies and any identity Cell used as a liveness anchor;
9. validates signer coverage for every input lock group; and
10. prepares every distinct supplied signer before using `payerSigner` for additional capacity,
    fees, and change.

The `did:ckb` identifier carries the issuer's 20-byte ID, not a deployment. `writeClaim` binds that
ID exclusively to the resolved `scripts.didCkb` override or the client's `KnownScript.DidCkb`
entry. It never infers the issuer deployment from a Cell already present in `tx`. Every issuer
input, output, cell dep, and Claim Type argument is matched or built from that exact configured
`codeHash` and `hashType`, so a transaction built by `writeClaim` cannot later be rejected by
`readClaims` as `unsupported-issuer-deployment` under the same configuration.

### Issuer source selection

The builder inspects the supplied transaction before fetching or adding an issuer state:

1. If it contains a matching issuer DID input, exactly one matching input and one matching output
   must exist. The input Cell is selected, its lock is the authorizing controller, and matching cell
   deps are ignored as required by Claim Type precedence.
2. Otherwise, if it contains a matching issuer DID cell dep, exactly one matching cell dep and no
   matching output may exist. The cell dep is selected and its lock is the controller.
3. Otherwise, if it contains a matching issuer DID output, exactly one matching output must exist.
   The output is selected and its lock is the controller.
4. Otherwise, the builder resolves exactly one live issuer DID Cell, adds it as a cell dep, and
   selects it. A missing or ambiguous live state fails.

The builder then finds or adds an input with the selected controller's exact lock.
`controllerInputIndex` identifies that input. For the input source, the issuer DID input itself
satisfies authorization. For the cell-dep and output sources, a newly added authorization input must
be plain, lock-only, and have empty data.

The returned issuer-source and controller-input indices refer to the final prepared transaction.
Signer preparation may prepend dependencies or inputs, so the builder tracks the selected Cells by
identity and recalculates their positions before returning.

This order matters during controller rotation: an issuer DID input authorizes with its input lock,
not the new lock on the matching output. It also allows a DID and its first claims to be created in
one transaction without requiring a pre-existing live DID Cell.

### Existing Claim outputs

Before appending the new output, the builder inspects every existing output in `tx` whose complete
Type Script equals the new Claim Type Script. It strictly decodes each output's Claim data and
requires its `issuer_id` to equal the ID decoded from `input.issuerDid`; a different issuer fails
because this call prepares authorization for only one issuer. Valid distinct claims remain in the
transaction and share the selected issuer authorization source.

The builder computes IDs for those existing outputs from their exact Type Script, lock, and data,
then computes the new output's ID. A malformed existing output or any repeated ID, whether between
existing outputs or against the new output, fails before signer preparation or capacity collection.
Outputs outside the new output's complete Claim Type Script group remain the caller's composition
responsibility described under Dependencies.

### DID subject state

A direct `{ lock }` subject is used as supplied and has no DID lifecycle check. For a `{ did }`
subject, the builder derives the exact identity Type Script and selects a state before creating the
DID Lock output:

1. If the supplied transaction contains a matching identity input, exactly one matching input and
   one matching output must exist. The output is the selected post-transaction state. A missing
   output is a deactivation and fails; duplicate matching states also fail.
2. Otherwise, if it contains a matching identity output, exactly one must exist and it is selected
   as a same-transaction identity creation. A competing matching cell dep fails.
3. Otherwise, if it contains the exact identity Cell as a direct cell dep, exactly one must exist and
   it is selected.
4. Otherwise, the builder resolves exactly one live identity Cell and adds that Cell as a direct
   cell dep. A missing or ambiguous live state fails.

For every source, the selected identity controller must not use the configured DID Lock's
`codeHash` and `hashType` under any arguments. Rejecting that known direct recursion prevents the SDK
from creating a Claim Cell that the current DID Lock rules could never spend. Other proxy-lock
cycles cannot be proven absent by this check and remain an application trust-policy concern.

The live subject Cell dep is intentionally retained as a liveness anchor even though its Type Script
does not execute. If that identity is consumed before the transaction commits, the transaction can
no longer resolve the dep instead of creating a newly stranded Claim Cell.

### Dependencies

Claim Type executes for every new Claim output, so its code dependency is always present. An issuer
DID Cell selected as data through a cell dep does not execute its Type Script. A DID Lock used only
on a new output does not execute its Lock Script. Neither case adds the corresponding code
dependency, although a subject identity Cell selected from live state remains present as the
liveness anchor described above.

The configured DID Type dependency is added when the transaction contains a matching issuer or
subject identity input or output. The DID Lock dependency is added when a transaction input uses the
configured DID Lock, such as an atomic claim replacement. CCC signer preparation supplies
dependencies and witnesses for controller and payer input locks. Existing dependencies are
deduplicated.

For scripts already present in a supplied transaction, the caller must provide any non-lock-script
dependencies and non-lock witnesses that their validation requires. The builder preserves those
fields and includes their bytes in fee calculation, but cannot infer arbitrary Type Script rules.

### Payer and signing

When issuer and payer differ, the builder mirrors any plain authorization input it adds with an
equal-capacity output controlled by the same issuer lock. Pre-existing inputs and outputs in a
supplied transaction are left unchanged. The payer supplies any additional capacity and the fee,
and payer change is locked to the payer's recommended address. Existing excess input capacity may
still contribute because CKB balances capacity transaction-wide. This is an SDK construction policy,
not an on-chain proof of economic attribution. If `payerSigner` is omitted, the issuer fills both
roles. When both are present, their clients must target the same network.

`issuerSigner`, `payerSigner`, and every `additionalSigners` entry must use clients for the same
network. Before fee completion, the builder requires every input lock group already present in the
transaction to match at least one address returned by a supplied signer's `getAddressObjs()`.
Configured DID Lock groups are the only exception: the builder instead validates their
identity-state and controller-input authorization path and supplies the DID Lock dependency. An
uncovered or unsupported lock group fails rather than returning a transaction with incomplete
witness sizing.

For a pre-existing DID Lock input, the builder adds the required identity state when it can derive
the complete identity Type Script from the requested subject. Otherwise, the supplied transaction
must already contain a coherent matching identity input or cell dep. In either case, the transaction
must contain the exact controller input and a supplied signer must cover that controller lock. The
builder rejects a DID Lock group whose identity state or controller authorization cannot be proven
from the completed transaction.

The builder explicitly prepares each distinct issuer or additional signer other than the effective
payer, then calls CCC's fee completion with that payer. Fee completion prepares the payer while
collecting inputs and calculating final transaction size. The explicit preparation and later signing
lists are deduplicated only by signer object identity. Separate signer objects are never deduplicated
merely because they report the same lock Script; multisig participants may share a lock group while
contributing different signatures. The returned transaction is prepared, balanced, and unsigned.

Callers sign the prepared transaction with `signOnlyTransaction` once per distinct signer object.
Each signer must preserve witness groups it does not control. After every required lock group is
signed, the caller broadcasts with `client.sendTransaction`; calling one signer's `sendTransaction`
is not sufficient when more than one signer is required.

The caller must capture `built.tx.hash()` before signing and require the same hash after every
signature. Witness changes do not affect the CKB transaction hash; a mismatch means a signer changed
the prepared raw transaction and the result must not be broadcast.

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

const preparedHash = built.tx.hash();
const signed = await issuerSigner.signOnlyTransaction(built.tx);
if (signed.hash() !== preparedHash) {
  throw new Error("Signer changed the prepared transaction");
}
const txHash = await issuerSigner.client.sendTransaction(signed);
```

The returned `claimId` is available before submission. The on-chain locator after submission is
`{ txHash, index: built.outputIndex }`.

When another signer pays or a supplied transaction already has input lock groups, every distinct
signer object prepares and signs before broadcast:

```ts
const additionalSigners = [existingInputSigner];
const built = await writeClaim({
  issuerSigner,
  payerSigner,
  additionalSigners,
  scripts,
  input,
  tx: composedTx,
});

const signers = new Set([issuerSigner, ...additionalSigners]);
if (payerSigner) {
  signers.add(payerSigner);
}
let signed = built.tx;
const preparedHash = built.tx.hash();
for (const signer of signers) {
  signed = await signer.signOnlyTransaction(signed);
  if (signed.hash() !== preparedHash) {
    throw new Error("Signer changed the prepared transaction");
  }
}
const txHash = await issuerSigner.client.sendTransaction(signed);
```

## Error boundaries

Caller and transaction-construction errors reject with actionable messages. These include invalid
identifier or hash lengths, invalid timestamp ordering, oversized data, absent DID Lock
configuration, a missing or ambiguous issuer or DID-subject state, subject deactivation or direct
DID Lock recursion, a malformed, differently issued, or ID-duplicate Claim output in the target
group, a signer that does not control the issuer, an uncovered input lock group, signers connected
to different networks, insufficient capacity, and conflicting identity sources in a supplied
transaction.

Per-Cell decode failures are data-quality results and belong in `ReadClaimsResult.invalid`. A network
or indexer failure during the subject scan rejects `readClaims`; returning a partial array as though
the query completed would be unsafe. A later issuer-resolution failure is represented explicitly as
`unavailable`, allowing display callers to retain the claim while authorization callers fail
closed.

## Non-goals

- No detached issuer signature or signature-verification helper.
- No `did:key` or `did:web` issuer fallback.
- No requirement that a subject use DID Lock.
- No implicit trust list, score, schema registry, or wall-clock policy.
- No historical-state claim based only on timestamp comparison.
- No proof of the historical code binary behind an upgradable Type Script identity.
- No automatic signing or transaction broadcast inside the builder.
