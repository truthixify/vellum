# `klaveroq.milestone-settlement.v1`

Records that a Klaveroq milestone was approved and settled through a confirmed CKB transaction.

- **Schema hash:** `0x899820258835146d1de40525b120f67b24bd0e390bb0d3aba258460d524c8473`
- **Encoding:** canonical DAG-CBOR
- **Canonical manifest:** [klaveroq.milestone-settlement.v1.json](./manifests/klaveroq.milestone-settlement.v1.json)

## Payload

| Field                | Type    | Required | Rules                                                                                     |
| -------------------- | ------- | -------- | ----------------------------------------------------------------------------------------- |
| `engagement_id`      | string  | Yes      | Lowercase `0x`-prefixed 32-byte domain-separated hash of the Klaveroq job ID              |
| `milestone_id`       | string  | Yes      | Lowercase `0x`-prefixed 32-byte domain-separated hash of the Klaveroq milestone ID        |
| `delivery_id`        | string  | Yes      | Lowercase `0x`-prefixed 32-byte domain-separated hash of the approved proof submission ID |
| `milestone_sequence` | integer | Yes      | Milestone position from 1 through `2^32 - 1`                                              |
| `approval_method`    | string  | Yes      | `client` for direct client approval or `review_timeout` for an expired review window      |
| `settled_at`         | integer | Yes      | Positive safe-integer Unix timestamp from the settlement block                            |
| `settlement_tx_hash` | string  | Yes      | Lowercase `0x`-prefixed 32-byte confirmed CKB settlement transaction hash                 |

```json
{
  "engagement_id": "0x1111111111111111111111111111111111111111111111111111111111111111",
  "milestone_id": "0x2222222222222222222222222222222222222222222222222222222222222222",
  "delivery_id": "0x3333333333333333333333333333333333333333333333333333333333333333",
  "milestone_sequence": 2,
  "approval_method": "client",
  "settled_at": 2000000000,
  "settlement_tx_hash": "0x4444444444444444444444444444444444444444444444444444444444444444"
}
```

Klaveroq derives the three opaque references by hashing the private UUID with a field-specific,
versioned domain separator. UUID entropy prevents practical reversal while the separate domains
prevent a value from being correlated across identifier types. The engagement and milestone pair
is the stable settlement key. The delivery reference binds the claim to the reviewed submission
without publishing its note, links, or files.

Each reference is `CKB_HASH(UTF8("klaveroq.milestone-settlement.v1:<kind>:<lowercase UUID>"))`,
where `<kind>` is `engagement`, `milestone`, or `delivery` for the corresponding payload field.

The settlement transaction must be committed with Klaveroq's configured minimum confirmation
depth. `settled_at` comes from its CKB block timestamp, not the application clock. The payload does
not include job titles, descriptions, acceptance criteria, proof contents, participant details,
payment assets, or amounts.

The schema describes evidence but does not make an issuer trusted. Readers must independently
allowlist the Klaveroq issuer DID and verify its live controller policy. Klaveroq is responsible for
checking its authoritative agreement state and the referenced settlement before issuance.

This v1 manifest and hash are immutable. Any field or semantic change requires a new schema
version under the [registry versioning rules](./README.md#versioning).
