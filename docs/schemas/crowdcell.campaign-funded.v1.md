# `crowdcell.campaign-funded.v1`

Records that a CrowdCell campaign reached its funding goal and was finalized successfully on CKB.

- **Schema hash:** `0x54fbc3c9c3e51e50ba6663464969df5210667b6ea4c0c75bd8b52a42bd55f0e8`
- **Encoding:** canonical DAG-CBOR
- **Canonical manifest:** [crowdcell.campaign-funded.v1.json](./manifests/crowdcell.campaign-funded.v1.json)

## Payload

| Field                       | Type    | Required | Rules                                                                          |
| --------------------------- | ------- | -------- | ------------------------------------------------------------------------------ |
| `campaign_type_id`          | string  | Yes      | Lowercase `0x`-prefixed 32-byte CrowdCell campaign Type ID                     |
| `campaign_title`            | string  | Yes      | Trimmed 1-200 character immutable campaign title                               |
| `campaign_creation_tx_hash` | string  | Yes      | Lowercase `0x`-prefixed 32-byte campaign creation transaction hash             |
| `finalization_tx_hash`      | string  | Yes      | Lowercase `0x`-prefixed 32-byte successful finalization transaction            |
| `funding_goal`              | string  | Yes      | Canonical positive unsigned `Uint64` decimal shannon amount                    |
| `total_pledged`             | string  | Yes      | Canonical positive unsigned `Uint64` decimal shannon amount, at least the goal |
| `funded_at`                 | integer | Yes      | Positive safe-integer Unix timestamp from the finalization block               |

```json
{
  "campaign_type_id": "0x1111111111111111111111111111111111111111111111111111111111111111",
  "campaign_title": "CKB Builders Toolkit",
  "campaign_creation_tx_hash": "0x2222222222222222222222222222222222222222222222222222222222222222",
  "finalization_tx_hash": "0x3333333333333333333333333333333333333333333333333333333333333333",
  "funding_goal": "100000000000",
  "total_pledged": "125000000000",
  "funded_at": 2000000000
}
```

The campaign Type ID is the stable campaign key. The campaign Cell out point changes whenever a
pledge updates its on-chain accumulator, so a moving out point must not be used for deduplication.
The creation transaction records where that Type ID first appeared, while the finalization
transaction proves the transition to the on-chain `Success` status. The two transaction hashes
must be distinct.

`funding_goal` and `total_pledged` use shannons and remain decimal strings so every `Uint64` value
is represented exactly. CrowdCell must read both amounts from the finalized campaign Cell and
require `total_pledged >= funding_goal`. `funded_at` comes from the finalization block timestamp,
not the application clock. The title is immutable campaign metadata and is informational; the Type
ID remains authoritative.

The payload excludes campaign descriptions, individual pledges, backer identities, derived backer
counts, and bot or wallet addresses. The Claim Cell subject is the creator's selected `did:ckb`.
Before issuance, CrowdCell must verify that the DID controller authorized an input in the campaign
creation transaction and that the campaign creator lock matches that controller.

The schema describes evidence but does not make an issuer trusted or assign reputation points.
Readers must independently allowlist the CrowdCell issuer DID and verify its live controller policy.

This v1 manifest and hash are immutable. Any field or semantic change requires a new schema
version under the [registry versioning rules](./README.md#versioning).
