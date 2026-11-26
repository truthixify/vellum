# `kweela.level-achieved.v1`

Records that a Kweela account permanently achieved a level under a named level policy.

- **Schema hash:** `0x380a2dcb476db5ca1db95f282b6dfe40462054b1a0e27bb44551fba94324bb00`
- **Encoding:** canonical DAG-CBOR
- **Canonical manifest:** [kweela.level-achieved.v1.json](./manifests/kweela.level-achieved.v1.json)

## Payload

| Field                  | Type    | Required | Rules                                                                  |
| ---------------------- | ------- | -------- | ---------------------------------------------------------------------- |
| `account_id`           | string  | Yes      | Canonical lowercase 36-character UUID for the Kweela account           |
| `profile_slug`         | string  | Yes      | Lowercase 1-64 character public Kweela profile slug                    |
| `level`                | integer | Yes      | Permanently achieved level from 1 through `2^32 - 1`                   |
| `level_policy_version` | string  | Yes      | Lowercase 1-64 character identifier for the applied Kweela policy      |
| `achieved_at`          | integer | Yes      | Positive safe-integer Unix timestamp recorded by the authoritative API |

```json
{
  "account_id": "123e4567-e89b-12d3-a456-426614174000",
  "profile_slug": "legacy",
  "level": 5,
  "level_policy_version": "kweela.levels.v1",
  "achieved_at": 2000000000
}
```

`account_id` and `level` form the stable achievement key. `profile_slug` provides a public Kweela
profile reference and records the slug at issuance, while the UUID remains the authoritative
account identifier. `level_policy_version` makes the level semantics explicit if Kweela changes
its progression rules later.

Kweela must derive every field from its API rather than accepting level data from a client. Before
issuance, the API must revalidate that the selected `did:ckb` is still controlled by the linked
wallet and that the account has reached the level. It must prevent duplicate issuance for the same
account-and-level pair across concurrent requests, retries, and chain reconciliation.

The payload excludes XP, mutable reputation totals, likes, follows, posts, replies, raw activity,
private account data, and issuer credentials. The schema records a durable level achievement; it
does not reproduce Kweela's reversible activity metrics.

The schema describes evidence but does not make an issuer trusted or assign reputation points.
Readers must independently allowlist the Kweela issuer DID and verify its live controller policy.

This v1 manifest and hash are immutable. Any field or semantic change requires a new schema
version under the [registry versioning rules](./README.md#versioning).
