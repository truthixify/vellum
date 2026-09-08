# Claim Cell protocol

Claim Cells are signed statements about a `did:ckb` subject. The on-chain script makes claims
immutable, verifies their issuer, and lets the subject remove them even after rotating the lock that
controls their DID.

The script has not been implemented or deployed. This document is the review draft for the protocol
shared by the on-chain script, `@ckb-ccc/did-ckb`, issuers, and readers. Rust implementation starts
after external CKB review. The words MUST, MUST NOT, SHOULD, SHOULD NOT, and MAY are normative.

The script proves that a key signed a structurally valid statement. It does not decide whether an
issuer is trustworthy, whether a payload is true, or how a claim affects a score.

## Protocol summary

- One type-ID-deployed binary serves as both the Claim Type and Claim Lock. A mode byte, fixed
  argument length, and invocation-position check select the behavior.
- The Claim Lock follows the subject DID's current controller lock. Copying that controller directly
  would strand claims after key rotation.
- Issuers are self-certifying `did:key` identities backed by compressed secp256k1 or P-256 keys.
- Schemas use full 32-byte CKB hashes of canonical JSON manifests.
- Payloads use canonical DAG-CBOR. The Type Script treats payload bytes as opaque; readers enforce
  their schema.
- Claims cannot be updated. Replacement means a new Claim Cell.
- Issuers generate a nonce for each statement. Readers deduplicate replays by claim ID.
- Timestamps are issuer assertions. The Type Script checks ordering, while readers enforce expiry.
- Issuers fund capacity by SDK convention. Consensus cannot identify who economically funded an
  arbitrary input.

## Cell format

```text
Claim Cell
  capacity  enough for the complete serialized cell
  lock      Claim Lock mode for the subject DID
  type      Claim Type mode for one schema and did:ckb deployment
  data      Molecule-encoded ClaimData
```

[`claim.mol`](../packages/claim-cell-script/molecules/claim.mol) is the canonical schema used by the
Rust contract and TypeScript SDK.

### Claim Type arguments

```text
offset  size  value
0       1     mode = 0x01
1       32    did_type_code_hash
33      32    schema_hash
```

The total length MUST be 65 bytes. `did_type_code_hash` identifies the did:ckb Identity Type Script
for the active network and assumes `hash_type: type`. Binding the DID deployment prevents a claim
configured for one network from being interpreted under another. Readers MUST use the canonical
did:ckb code hash for their selected network.

### Claim Lock arguments

```text
offset  size  value
0       1     mode = 0x00
1       32    did_type_code_hash
33      20    subject_id
```

The total length MUST be 53 bytes. `subject_id` is the raw 20-byte method-specific identifier from
the subject's `did:ckb` string.

The Claim Lock uses the same `code_hash` as the Claim Type, and both scripts MUST use
`hash_type: type`. Readers and SDK transaction builders MUST reject any other Claim script hash
type.

A type-ID deployment keeps the code hash stable when the code Cell changes; it does not pin the
binary bytes. Every release MUST publish the code Cell outpoint and data hash. Updates MUST preserve
validation and removal behavior for previously accepted claim versions unless a reviewed migration
path already exists. Mainnet upgrade governance is outside this Testnet protocol.

### Claim data

`ClaimData` is a versioned Molecule union. Item ID `0` contains `ClaimV1`, whose statement contains:

- `issuer_key`: a tagged, compressed secp256k1 or P-256 public key;
- `subject_id`: the raw 20-byte did:ckb identifier;
- `schema_hash`: the exact 32-byte hash in the Claim Type arguments;
- `nonce`: 32 cryptographically random bytes that the issuer does not reuse;
- `issued_at`: an issuer-asserted Unix timestamp in seconds, encoded as unsigned little-endian;
- `expires_at`: an optional timestamp encoded the same way; and
- `payload`: canonical DAG-CBOR bytes governed by the referenced schema.

`ClaimV1.signature` is a 64-byte compact ECDSA signature. Claim Cell data MUST be no larger than
16,384 bytes, and the payload MUST contain at least one byte. SDKs and readers are responsible for
strict DAG-CBOR and schema validation.

## Schema identity

A schema is a JSON manifest containing its stable name, version, field definitions, and payload
rules. Its identity is:

```text
schema_hash = CKB_BLAKE2B_256(JCS(schema_manifest))
```

`JCS` is the RFC 8785 canonical UTF-8 representation. `CKB_BLAKE2B_256` is BLAKE2b-256 with the
16-byte personalization string `ckb-default-hash`.

The full hash appears in both the Claim Type arguments and `ClaimStatementV1`; a mismatch is
invalid. The manifest is not stored in every Cell. Readers resolve known hashes through a schema
registry and may expose an unknown schema as raw signed data. Changing a manifest produces a new
hash, and an incompatible change MUST also use a new human-readable version. The schema package
defines the manifest shape and publication process.

## Issuer keys

| Molecule union index | Curve             | Public key              | did:key multicodec prefix |
| -------------------- | ----------------- | ----------------------- | ------------------------- |
| `0`                  | secp256k1         | 33-byte compressed SEC1 | `0xe7 0x01`               |
| `1`                  | P-256 / secp256r1 | 33-byte compressed SEC1 | `0x80 0x24`               |

The SDK derives the issuer DID by prefixing the compressed public key with its multicodec bytes and
encoding the result as base58btc with the `z` multibase prefix. The Type Script MUST reject a key
that is not a valid compressed point on its declared curve.

`did:web`, keys selected from a `did:ckb` document, Ed25519, and multisig require a new claim version
and are not supported here.

## Signature format

The signature covers the complete statement and exact Claim Type Script:

```text
domain_tag = ASCII("VELLUM_CLAIM_V1\0")
type_hash  = CKB_BLAKE2B_256(MOLECULE(claim_type_script))
preimage   = domain_tag || type_hash || MOLECULE(statement)
claim_id   = CKB_BLAKE2B_256(preimage)
signature  = ECDSA_PREHASH_SIGN(issuer_private_key, claim_id)
```

`domain_tag` is exactly 16 bytes:
`0x56454c4c554d5f434c41494d5f563100`.

`type_hash` binds the signature to the Claim deployment, hash type, did:ckb deployment, and schema.
Both curves use compact `r || s` encoding with one 32-byte big-endian scalar per component. Signing
and verification operate directly on `claim_id` and MUST NOT apply another hash. Signers MUST
produce low-S signatures, and the Type Script MUST reject high-S signatures.

`claim_id` is the stable content identifier exposed by readers. Signature bytes are not part of it.

## Claim Type validation

Type mode requires the `0x01` tag and exactly 65 argument bytes. The complete current script MUST
occupy the type field, and not the lock field, of every Cell in its group.

### Creation

Creation has no group inputs and at least one group output. For every group output, the script MUST:

1. Enforce the data limit and strict Molecule decoding with no trailing bytes.
2. Accept only known `ClaimData` and `IssuerKey` union variants.
3. Match `statement.schema_hash` to the current Type arguments.
4. Match `statement.subject_id` to the output Claim Lock arguments.
5. Require the output lock to use the current Claim code hash and hash type with canonical 53-byte
   Claim Lock arguments.
6. Require a matching subject DID Cell to remain after the transaction. A matching output satisfies
   this rule. A matching cell dep satisfies it only when no matching input is consumed.
7. Require `issued_at > 0` and, when present, `expires_at > issued_at`.
8. Validate the issuer key, recompute `claim_id`, and verify the low-S signature.
9. Reject duplicate claim IDs among outputs in the current group.

A matching DID Cell has `code_hash = did_type_code_hash`, `hash_type = type`, and
`args = subject_id`. Creation does not require subject authorization, so an issuer or relayer can
create and fund a claim for an existing DID.

CKB allows one Cell to appear as both an input and a cell dep. A cell dep alone therefore does not
prove post-transaction existence when the DID is also consumed. A DID update has a matching output
and remains valid; a deactivated DID without one cannot receive a new claim.

### Destruction and mutation

Destruction has at least one group input and no group outputs. The Claim Type accepts it because the
Claim Lock authorizes every consumed Cell.

A group containing both inputs and outputs MUST fail. Claims cannot be updated or transferred in
place. Replacing a claim under the same Type arguments requires a separate creation transaction.

## Claim Lock authorization

Lock mode requires the `0x00` tag and exactly 53 argument bytes. The complete current script MUST
occupy the lock field, and not the type field, of every Cell in its group. These checks prevent one
mode from being invoked in the other script role.

For the subject in its arguments, the Claim Lock MUST:

1. Find every matching DID Cell in transaction inputs and cell deps.
2. Reject no match or matching Cells with different controller locks.
3. Read the current controller lock from the matching DID Cell.
4. Reject a controller using the Claim deployment's own `code_hash` and `hash_type` under any
   arguments.
5. Require at least one transaction input with that exact controller lock.

The fourth rule prevents circular authorization. The controller input belongs to a separate lock
group whose script CKB executes independently. A DID Cell consumed in the same transaction also
satisfies the fifth rule because its controller lock is validated as an input lock group.

This indirection keeps claims attached to the stable DID identifier while the DID Metadata Cell
rotates its controller lock.

## Reader behavior

A conforming reader MUST:

1. Select the canonical Claim and did:ckb deployments for its network.
2. Query the exact Claim Lock to discover every schema for a subject.
3. Isolate malformed or unknown Cells instead of failing the complete result set.
4. Recompute the Type script hash, schema binding, claim ID, and issuer signature.
5. Deduplicate identical claim IDs before scoring or counting.
6. Exclude expired claims using its documented time source by default.
7. Treat an unresolved or deactivated subject DID as inactive.
8. Validate DAG-CBOR and the registered schema before interpreting payloads.
9. Expose issuer identity, schema hash, outpoint, timestamps, and verification state.

Consumers decide which issuer keys they trust through an explicit registry. On-chain signature
verification alone does not establish that a key represents a particular product or organization.

## Replay and time

The Type Script cannot search all live Cells, so it cannot reject a replay created in a later
transaction. The nonce and claim ID make exact replays detectable, and readers MUST count matching
claim IDs once. A relayer replaying a claim pays more capacity, gains no issuing authority, and
locks that capacity to the subject.

`issued_at` and `expires_at` are issuer assertions. The Type Script can compare them but has no
trustworthy implicit wall clock. Readers enforce expiry with a documented time source.

## Testnet limits

- Issuers cannot spend subject-owned claims. Expiry and newer signed statements provide freshness;
  issuer revocation is deferred.
- Claim removal requires a live DID or the DID input in the same transaction. Deactivation SHOULD
  consume the subject's Claim Cells; claims left behind become inactive but their capacity is
  stranded.
- Only secp256k1 and P-256 `did:key` issuers are supported.
- The Type Script does not interpret schema manifests or DAG-CBOR. Readers reject authentic but
  schema-invalid claims.
- Global replay prevention is reader-side rather than consensus-enforced.

These limits must remain visible in SDK, UI, and scoring behavior and require reconsideration before
Mainnet.

## Implementation and review

Rust and TypeScript tests MUST share vectors for both curves, Molecule bytes, argument construction,
schema hashes, signature preimages, claim IDs, controller rotation, wrong-role invocation, recursive
controllers, duplicate outputs, malformed data, timestamp ordering, mutation, and DID deactivation.
The implementation must publish release binary size and cycle counts for creation, destruction, and
authorization.

External CKB review must cover the dual-role dispatch, controller-input authorization, type-ID
upgrade boundary, post-transaction DID existence rule, CKB source selection, prehash ECDSA behavior,
schema hashing, argument layout, and Testnet limits. Review discussion is tracked in
[`truthixify/vellum#9`](https://github.com/truthixify/vellum/issues/9).

## References

- [`did:ckb` method specification](https://github.com/web5fans/web5-wips/blob/master/01.md)
- [`web5fans/did-ckb`](https://github.com/web5fans/did-ckb)
- [Molecule encoding specification](https://github.com/nervosnetwork/molecule/blob/master/docs/encoding_spec.md)
- [JSON Canonicalization Scheme](https://www.rfc-editor.org/rfc/rfc8785)
- [DAG-CBOR specification](https://ipld.io/specs/codecs/dag-cbor/spec/)
- [`did:key` method specification](https://w3c-ccg.github.io/did-key-spec/)
- [CKB transaction structure and script groups](https://github.com/nervosnetwork/rfcs/blob/master/rfcs/0022-transaction-structure/0022-transaction-structure.md)
- [CKB contract guidelines](https://github.com/nervosnetwork/ckb-contract-guidelines)
