# `vellum.social.discord.v1`

Records control of a Discord account at a stated verification time.

- **Schema hash:** `0x1d0169167b6c34b7818ba6932974679f8fd5284e4d5d79319da12f7d79df8b69`
- **Encoding:** canonical DAG-CBOR
- **Canonical manifest:** [vellum.social.discord.v1.json](./manifests/vellum.social.discord.v1.json)

## Payload

| Field                | Type    | Required | Rules                                                                 |
| -------------------- | ------- | -------- | --------------------------------------------------------------------- |
| `user_id`            | string  | Yes      | Canonical 17-20 digit Discord snowflake                               |
| `username`           | string  | Yes      | 1-32 characters; excludes control characters and spaces               |
| `profile_url`        | string  | Yes      | Exactly `https://discord.com/users/{user_id}`; at most 256 characters |
| `account_created_at` | integer | Yes      | Positive safe-integer Unix seconds derived from the `user_id`         |
| `verified_at`        | integer | Yes      | Positive safe-integer Unix seconds; no earlier than account creation  |

```json
{
  "user_id": "1174109840998400000",
  "username": "vellum-builder",
  "profile_url": "https://discord.com/users/1174109840998400000",
  "account_created_at": 1700000000,
  "verified_at": 1800000000
}
```

The payload contains no OAuth token, email address, server list, messages, or channel history. The
stable snowflake identifies the account; `username` is mutable display data captured at
verification time.

This v1 manifest and hash are immutable. Any field or semantic change requires a new schema
version under the [registry versioning rules](./README.md#versioning).
