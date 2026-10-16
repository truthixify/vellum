# `ckboost.quest.v1`

Records a completed CKBoost quest after the contributor claims the approved reward on CKB.

- **Schema hash:** `0x6f0fe424320c73627ac544d6666841623c2b15b88ffc93818dc9f78752dd8fae`
- **Encoding:** canonical DAG-CBOR
- **Canonical manifest:** [ckboost.quest.v1.json](./manifests/ckboost.quest.v1.json)

## Payload

| Field                  | Type    | Required | Rules                                                               |
| ---------------------- | ------- | -------- | ------------------------------------------------------------------- |
| `campaign_type_id`     | string  | Yes      | Lowercase `0x`-prefixed 32-byte CKBoost campaign Type ID            |
| `campaign_title`       | string  | Yes      | Trimmed 1-160 character display snapshot with no control characters |
| `quest_id`             | integer | Yes      | Unsigned 32-bit quest ID, scoped to the campaign                    |
| `quest_title`          | string  | Yes      | Trimmed 1-160 character display snapshot with no control characters |
| `ckboost_user_type_id` | string  | Yes      | Lowercase `0x`-prefixed 32-byte CKBoost user Type ID                |
| `completed_at`         | integer | Yes      | Positive safe-integer Unix timestamp of reward-claim confirmation   |
| `approval_tx_hash`     | string  | Yes      | Lowercase `0x`-prefixed 32-byte staff-approval transaction hash     |
| `reward_claim_tx_hash` | string  | Yes      | Lowercase `0x`-prefixed 32-byte final reward-claim transaction hash |
| `points_awarded`       | string  | Yes      | Canonical unsigned decimal `Uint128`, from `0` through `2^128 - 1`  |

```json
{
  "campaign_type_id": "0x1111111111111111111111111111111111111111111111111111111111111111",
  "campaign_title": "Build on CKB",
  "quest_id": 7,
  "quest_title": "Ship a CKB integration",
  "ckboost_user_type_id": "0x2222222222222222222222222222222222222222222222222222222222222222",
  "completed_at": 2000000000,
  "approval_tx_hash": "0x3333333333333333333333333333333333333333333333333333333333333333",
  "reward_claim_tx_hash": "0x4444444444444444444444444444444444444444444444444444444444444444",
  "points_awarded": "250"
}
```

The campaign Type ID, quest ID, and CKBoost user Type ID form the stable completion key. Campaign
and quest titles are display snapshots and must not replace those identifiers during verification.
The approval and reward-claim hashes must be different confirmed transactions. The final claim
transaction is the completion event; `completed_at` is Unix seconds derived from its confirmation
block timestamp.

The schema describes evidence but does not make an issuer trusted. Readers must independently
allowlist the CKBoost issuer DID and verify its live controller policy. CKBoost is responsible for
confirming the referenced transaction provenance before issuance; readers that require independent
application-state verification must additionally decode those transactions under CKBoost's
protocol rules.

This v1 manifest and hash are immutable. Any field or semantic change requires a new schema
version under the [registry versioning rules](./README.md#versioning).
