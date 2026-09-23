# `vellum.community.discord.v1`

Records current membership in explicitly configured Discord communities and the configured roles
recognized by the issuer.

- **Schema hash:** `0x3cba5b1c2967fee27bbde52d5e609137aa0d2cccaf68e1d8722e9b943e78f550`
- **Encoding:** canonical DAG-CBOR
- **Canonical manifest:** [vellum.community.discord.v1.json](./manifests/vellum.community.discord.v1.json)

## Payload

| Field         | Type    | Required | Rules                                                                      |
| ------------- | ------- | -------- | -------------------------------------------------------------------------- |
| `user_id`     | string  | Yes      | Canonical 17-20 digit Discord snowflake                                    |
| `verified_at` | integer | Yes      | Positive safe-integer Unix timestamp in seconds                            |
| `memberships` | array   | Yes      | 1-16 membership objects, unique and sorted by ascending numeric `guild_id` |

### Membership

| Field              | Type    | Required | Rules                                                                            |
| ------------------ | ------- | -------- | -------------------------------------------------------------------------------- |
| `guild_id`         | string  | Yes      | Canonical 17-20 digit Discord snowflake                                          |
| `community_name`   | string  | Yes      | Trimmed issuer-configured label, 1-100 characters, excluding control characters  |
| `joined_at`        | integer | Yes      | Positive safe-integer Unix timestamp; between account creation and `verified_at` |
| `recognized_roles` | array   | Yes      | 0-32 role objects, unique and sorted by ascending numeric `role_id`              |

Each role contains required `role_id` and `role_name` strings. `role_id` is a canonical 17-20 digit
Discord snowflake. `role_name` is a trimmed issuer-configured label of 1-100 characters and cannot
contain control characters.

```json
{
  "user_id": "1174109840998400000",
  "verified_at": 1800000000,
  "memberships": [
    {
      "guild_id": "1174109840998400001",
      "community_name": "Example CKB Community",
      "joined_at": 1710000000,
      "recognized_roles": [
        {
          "role_id": "1174109840998400002",
          "role_name": "Builder"
        },
        {
          "role_id": "1174109840998400003",
          "role_name": "Contributor"
        }
      ]
    }
  ]
}
```

The payload covers only allowlisted communities. It contains no OAuth token, unrelated server
list, messages, or channel history. Freshness and expiry are carried by the Claim envelope rather
than inferred from continued membership.

This v1 manifest and hash are immutable. Any field or semantic change requires a new schema
version under the [registry versioning rules](./README.md#versioning).
