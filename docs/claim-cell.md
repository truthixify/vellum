# Claim Cell protocol

Claim Cells are on-chain assertions issued by a `did:ckb` identity to a subject-controlled CKB
lock. The Claim Type validates fresh authorization from the issuer DID's current controller when a
claim is created. The output lock controls later removal.

The Rust implementation and local `ckb-testtool` harness live in
[`packages/claim-cell-script`](../packages/claim-cell-script/). The contracts are deployed as
separate Type ID code cells on CKB Testnet, with canonical locators in
[`deployments/testnet.json`](../deployments/testnet.json). This document is the accepted protocol
shared by the on-chain scripts, `@ckb-ccc/did-ckb`, issuers, and readers. The words MUST, MUST NOT,
SHOULD, SHOULD NOT, and MAY are normative.

The protocol proves that a DID controller authorized a structurally valid claim creation
transaction. It does not decide whether an issuer is trustworthy, whether a payload is true, or how
a claim affects a score.

## Protocol summary

- Claim Type and DID Lock are separate scripts with independent deployments and upgrade policies.
- Claim Type accepts any CKB output lock. Vellum uses DID Lock by default so a `did:ckb` holder can
  rotate the controller of a DID without stranding Cells held under that DID.
- V1 issuers are `did:ckb` identities. Each claim creation requires a live issuer DID Cell and a
  transaction input controlled by that DID's current lock.
- Claim data does not contain a detached issuer signature. The issuer's input lock authorizes the
  complete CKB transaction, and consensus records that authorization.
- Schemas use full 32-byte CKB hashes of canonical JSON manifests.
- Payloads use canonical DAG-CBOR. Claim Type treats payload bytes as opaque; readers enforce their
  schema.
- Claim Cells are immutable. A transaction MAY consume old claims and create freshly authorized
  replacements atomically, but no continuity or transfer is implied between them.
- Issuers generate a new nonce for every creation. Readers deduplicate identical live claim IDs.
- Timestamps are issuer assertions. Claim Type checks ordering; readers evaluate time explicitly.
- Issuers fund capacity by SDK convention. Consensus can prove issuer authorization but cannot
  identify which input economically funded an arbitrary output.

## Hashes and script identity

This document uses the standard CKB hash throughout:

```text
CKB_HASH(bytes) = BLAKE2b-256(
  personalization = ASCII("ckb-default-hash"),
  input = bytes
)
```

A script hash is `CKB_HASH(MOLECULE(script))`, using the canonical packed CKB `Script` encoding.
It commits to `code_hash`, `hash_type`, and `args`.

The protocol does not require Claim Type or DID Lock to use a particular `hash_type`. A deployment
MAY choose `data`, `data1`, or `data2` to pin code bytes, or `type` to reference an upgradable Type
ID code Cell. SDK configuration and deployment records MUST identify the complete script locator.

Vellum's Testnet deployments use Type ID code Cells while the protocol is being implemented and
reviewed. Every release MUST publish the code Cell outpoint and data hash. A future Mainnet
deployment and its upgrade policy require a separate review.

An upgrade behind `hash_type: type` MUST preserve removal of existing Cells and decoding of every
accepted data version unless a reviewed migration is already available. Claim Type and DID Lock
MUST be assessed and released independently; upgrading one does not authorize changing the other.

## Claim Cell format

```text
Claim Cell
  capacity  enough for the complete serialized Cell
  lock      any subject-controlled CKB lock; Vellum defaults to DID Lock
  type      Claim Type configured for one issuer DID deployment and schema
  data      Molecule-encoded ClaimData
```

[`claim.mol`](../packages/claim-cell-script/molecules/claim.mol) is the canonical data schema used
by the Rust contract and TypeScript SDK.

### Claim Type arguments

```text
offset  size  value
0       32    issuer_did_code_hash
32      1     issuer_did_hash_type
33      32    schema_hash
```

The total length MUST be 65 bytes. `issuer_did_hash_type` is the packed CKB `Script.hash_type` byte
and MUST be a value supported by the active CKB hard fork. Together with the 20-byte `issuer_id` in
claim data, the first two fields reconstruct the exact issuer DID Type Script:

```text
issuer_did_type = Script {
  code_hash: issuer_did_code_hash,
  hash_type: issuer_did_hash_type,
  args: issuer_id,
}
```

Binding the DID deployment prevents an identifier from another deployment or network from being
treated as the configured `did:ckb` issuer.

### Claim data

`ClaimData` is a versioned Molecule union. Item ID `0` contains `ClaimV1`:

- `issuer_id`: the raw 20-byte method-specific identifier of the issuer's `did:ckb`;
- `nonce`: 32 cryptographically random bytes that the issuer MUST NOT reuse;
- `issued_at`: an issuer-asserted Unix timestamp in seconds, encoded as unsigned little-endian;
- `expires_at`: an optional timestamp encoded the same way; and
- `payload`: canonical DAG-CBOR bytes governed by the schema in Claim Type arguments.

Claim Cell data MUST be no larger than 16,384 bytes, and `payload` MUST contain at least one byte.
Claim Type MUST use strict Molecule decoding and reject trailing bytes. SDKs and readers are
responsible for strict DAG-CBOR and schema validation.

The subject is the Claim Cell's output lock, and the schema is in Claim Type arguments. Neither is
duplicated in claim data.

## Schema identity

A schema is a JSON manifest containing its stable name, version, field definitions, and payload
rules. Its identity is:

```text
schema_hash = CKB_HASH(JCS(schema_manifest))
```

`JCS` is the RFC 8785 canonical UTF-8 representation. The manifest is not stored in every Cell.
Readers resolve known hashes through a schema registry and may expose an unknown schema as raw
authorized data. Changing a manifest produces a new hash, and an incompatible change MUST also use
a new human-readable version. The schema package defines the manifest shape and publication
process.

## Claim identity

V1 has no protocol-level detached signature preimage. An issuer authorizes the complete creation
transaction through the current controller lock of its DID. The signature or other proof used by
that lock follows the lock's own rules and is not duplicated in Claim data.

Readers derive a stable content identifier as follows:

```text
domain_tag        = ASCII("VELLUM_CLAIM_V1\0")
claim_type_hash   = CKB_HASH(MOLECULE(claim_type_script))
subject_lock_hash = CKB_HASH(MOLECULE(subject_lock_script))
claim_id          = CKB_HASH(
  domain_tag || claim_type_hash || subject_lock_hash || MOLECULE(claim_data)
)
```

`domain_tag` is exactly 16 bytes:
`0x56454c4c554d5f434c41494d5f563100`.

The Claim Type hash binds the ID to the Claim deployment, its own hash type, the issuer DID
deployment, and the schema. The output lock hash binds it to the subject without storing a second
subject field. The nonce distinguishes separate claims whose other fields are identical.

Claim bytes alone are not a portable detached signature. Verification relies on the Claim Cell's
inclusion in CKB under the configured Claim Type. A historical verifier also needs the creating
transaction and the required CKB inclusion proof.

## Issuer authorization

For every new Claim output, Claim Type MUST reconstruct `issuer_did_type` from its arguments and the
output's `issuer_id`, then select exactly one issuer DID state using these rules:

1. If a matching DID Cell is present in transaction inputs, exactly one matching input and exactly
   one matching output MUST exist. The input Cell is the authorization state. Requiring the output
   prevents issuance while deactivating the issuer DID.
2. Otherwise, if a matching DID Cell is present in cell deps, exactly one matching cell dep MUST
   exist and no matching output may exist. The cell dep is the authorization state.
3. Otherwise, exactly one matching DID Cell MUST be present in transaction outputs. This permits
   creation of an issuer DID and its first claims in one transaction. The output Cell is the
   authorization state.
4. Any other combination, including an ambiguous matching state, MUST fail.

An exact match compares the complete Type Script, not only its arguments. When an input DID Cell is
also listed as a cell dep, the input rule takes precedence and the duplicate cell-dep view is
ignored.

Claim Type MUST compute the selected DID Cell's controller lock hash and require at least one
transaction input with that exact lock hash. All transaction input lock groups are independently
validated by CKB. The issuer DID Cell itself satisfies this requirement when it is an input.

This is fresh authorization for the complete transaction: an old creation transaction cannot be
replayed because its inputs have already been consumed. Issuer policies MUST accept only DID
controller locks whose authorization commits to the transaction outputs. A permissive controller
such as an always-success lock does not establish a trustworthy issuer merely because Claim Type
accepted it.

Controller rotation does not change `issuer_id`, so later claims continue to identify the same
issuer. Deactivation does not erase the historical fact that an earlier transaction was authorized.
Readers MUST expose the issuer's current resolution status; trust policies decide whether claims
from a subsequently deactivated issuer remain acceptable.

## Claim Type validation

Claim Type arguments MUST use the exact 65-byte layout above. The script validates every group
output as a fresh claim, whether or not the group also has inputs.

For every group output, Claim Type MUST:

1. Enforce the data limit and strict Molecule decoding with no trailing bytes.
2. Accept only known `ClaimData` union variants.
3. Require a non-empty payload.
4. Require `issued_at > 0` and, when present, `expires_at > issued_at`.
5. Resolve the configured issuer DID and require fresh controller authorization as specified above.
6. Compute the output's subject lock hash and claim ID.
7. Reject duplicate claim IDs among outputs in the current group.

A group with inputs and no outputs is destruction and succeeds at the Type level because each input
lock separately authorizes consumption. A group with both inputs and outputs is allowed, but every
output is independently authorized as a new claim. Consuming an old claim does not permit its data,
issuer, schema, or subject to be carried into an output without fresh issuer authorization.

The Type Script cannot prove who economically funded a transaction. SDKs SHOULD select
issuer-controlled inputs for capacity and fees, and user interfaces MUST disclose when another
party is paying.

## DID Lock

DID Lock is a separate, reusable lock script. It is not specific to Claim Cells and MUST be deployed
independently from Claim Type.

Its arguments are exactly one 32-byte `identity_type_hash`:

```text
identity_type_hash = CKB_HASH(MOLECULE(identity_type_script))
```

For Vellum, `identity_type_script` is the subject's complete `did:ckb` Type Script. Keeping only its
hash in DID Lock arguments avoids duplicating the DID deployment and 20-byte identifier in every
Cell. Other protocols MAY use DID Lock with another stable identity Cell Type if they accept that
Type's lifecycle and authorization rules.

When authorizing a spend, DID Lock MUST:

1. Find Cells whose Type Script hash equals `identity_type_hash`, preferring transaction inputs over
   cell deps.
2. Reject no match and reject matching Cells whose controller locks differ.
3. Read the controller lock from the selected identity Cell state.
4. Reject a controller whose `code_hash` and `hash_type` equal the current DID Lock deployment under
   any arguments, preventing direct self-recursion.
5. Require at least one transaction input with the exact controller lock hash.

When the identity Cell is an input, that Cell itself satisfies the controller-input requirement.
This permits a DID update or deactivation transaction to consume associated Cells at the same time.
Otherwise, the live identity Cell is supplied as a cell dep and a separate controller-owned input
provides authorization.

No lock can detect every cycle formed through other proxy-lock deployments. Vellum SDKs and issuer
trust policies MUST reject known controller-lock dependency cycles rather than treating this direct
self-recursion check as a complete proof.

The DID Lock arguments stay stable when the DID Metadata Cell rotates its controller lock. If the
DID is deactivated without consuming Cells held under DID Lock, those Cells can no longer be spent
and their capacity is stranded. DID deactivation flows SHOULD therefore consume all known dependent
Cells in the same transaction.

## Subject locks

Claim Type does not require DID Lock and does not interpret a subject identity. The Claim output
lock is the subject boundary:

- a standard wallet lock makes that wallet the subject and controller;
- a multisig or custom lock uses its own authorization rules; and
- Vellum's DID Lock makes a stable `did:ckb` identity the subject while following controller
  rotation.

Readers identify a subject by the complete lock script supplied by the application. Vellum derives
the expected DID Lock from a `did:ckb` Type Script and queries that exact lock across all configured
Claim schemas. Claim Type does not prove that an arbitrary output lock corresponds to a
human-readable identity; the application constructing and interpreting the claim owns that mapping.

## Reader behavior

A conforming reader MUST:

1. Use explicitly configured Claim Type, issuer DID, and optional DID Lock deployments for its
   network.
2. Query the exact subject lock to discover claims across configured schemas.
3. Isolate malformed or unknown Cells instead of failing the complete result set.
4. Decode Claim Type arguments and claim data, then recompute the issuer DID Type Script, subject
   lock hash, and claim ID.
5. Deduplicate identical live claim IDs before scoring or counting.
6. Resolve the issuer DID and expose its current active, deactivated, missing, or ambiguous state.
7. Validate canonical DAG-CBOR and the registered schema before interpreting payloads.
8. Expose issuer DID, subject lock, schema hash, outpoint, timestamps, claim ID, and verification
   state.
9. Evaluate claim time at an explicit application-selected timestamp.

Consumers decide which issuer DIDs they trust through an explicit registry. On-chain authorization
alone does not establish that a DID represents a particular product or organization.

### Evaluation time

For an application-selected Unix timestamp `evaluation_time`, readers MUST apply this boundary:

```text
active_at(evaluation_time) =
  issued_at <= evaluation_time
  AND (expires_at is absent OR evaluation_time < expires_at)
```

A claim is therefore inactive before `issued_at` and expired exactly when
`evaluation_time == expires_at`. A convenience API MAY default to the reader's current clock, but it
MUST document that source and MUST expose the explicit timestamp form for reproducible evaluation.

An application that makes an authorization decision MUST define and authenticate its checkpoint.
For example, governance software may derive the timestamp from the block header containing a vote
intent and reuse that checkpoint during aggregation. Comparing timestamps does not prove that the
Claim Cell or DID state existed at an earlier time; historical eligibility requires separate CKB
state and inclusion evidence.

## Removal and replay

Removing a Claim Cell consumes its outpoint. The removed outpoint is permanently dead, but removal
does not create a protocol tombstone and does not forbid the issuer from making a new assertion.

Every creation requires a fresh issuer-controller input. Because CKB inputs can be consumed only
once, an unrelated relayer cannot recreate a removed claim from reusable signed bytes. An issuer may
deliberately issue the same assertion again, but MUST use a new nonce and a new transaction. The
subject may remove the new Cell under its output lock.

Claim Type cannot search chain history and therefore cannot enforce nonce uniqueness across
transactions. A repeated nonce is an issuer-policy violation; readers still deduplicate identical
live claim IDs.

Readers use live Cells for current-state queries and MUST NOT describe absence as permanent
issuer-level revocation. Historical readers use outpoints and transaction inclusion to distinguish
an original Cell, its removal, and a later issuance.

## Testnet limits

- Claim data has no detached signature that can be verified without CKB transaction evidence.
- Issuer authorization depends on the semantics of the issuer DID's controller lock. Reader trust
  policy remains essential.
- Claim Type has no trusted wall clock. It validates timestamp ordering but not whether an issuer's
  asserted time matches chain time.
- Removal is not a permanent subject veto against future issuer-authorized claims.
- DID Lock follows controller rotation, but dependent capacity is stranded if the identity is
  deactivated without consuming those Cells.
- Claim Type does not interpret schema manifests or DAG-CBOR. Readers reject authentic but
  schema-invalid claims.
- Vellum's initial Type ID deployments are upgradable Testnet infrastructure. Mainnet code-pinning
  and upgrade governance are unresolved by design.

These limits must remain visible in SDK, UI, scoring, and governance behavior and require
reconsideration before Mainnet.

## Current implementation

The Rust Claim Type and DID Lock contracts are built and exercised locally with `ckb-testtool`.
Their release binaries and measured VM paths are documented in the package
[`README`](../packages/claim-cell-script/README.md). The current package build is validated with
`data1` and `type` script locators under CKB-VM version 1; a legacy `data` deployment requires a
separately validated VM-0-compatible toolchain. The release binaries are deployed in separate Type
ID code cells on CKB Testnet. The repository verifier rebuilds both binaries and checks their complete
bytes, hashes, capacities, Type ID scripts, and upgrade locks against the live cells recorded in
[`deployments/testnet.json`](../deployments/testnet.json).

## Implementation and review

Rust and TypeScript tests MUST share vectors for Claim Type arguments, Molecule bytes, schema hashes,
claim IDs, arbitrary subject locks, DID Lock arguments, issuer DID resolution from inputs, outputs,
and cell deps, controller rotation, issuer deactivation, missing controller authorization, relayer
replay attempts, recursive DID Lock controllers, duplicate outputs, malformed data, timestamp
ordering, explicit expiry boundaries, atomic replacement, and subject DID deactivation.

The implementation must publish release binary sizes and cycle counts for Claim creation,
destruction, atomic replacement, and DID Lock authorization.

External CKB review must cover the separate script topology, issuer-controller authorization, source
selection, output-lock subject binding, hash-type deployment choice, replay semantics, exact argument
and data layouts, and Testnet limits. Review discussion is tracked in
[`truthixify/vellum#9`](https://github.com/truthixify/vellum/issues/9).

## References

- [`did:ckb` method specification](https://github.com/web5fans/web5-wips/blob/master/01.md)
- [`web5fans/did-ckb`](https://github.com/web5fans/did-ckb)
- [Molecule encoding specification](https://github.com/nervosnetwork/molecule/blob/master/docs/encoding_spec.md)
- [JSON Canonicalization Scheme](https://www.rfc-editor.org/rfc/rfc8785)
- [DAG-CBOR specification](https://ipld.io/specs/codecs/dag-cbor/spec/)
- [CKB transaction structure and script groups](https://github.com/nervosnetwork/rfcs/blob/master/rfcs/0022-transaction-structure/0022-transaction-structure.md)
- [CKB contract guidelines](https://github.com/nervosnetwork/ckb-contract-guidelines)
