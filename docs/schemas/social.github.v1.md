# `vellum.social.github.v1`

Records control of a GitHub account at a stated verification time.

- **Schema hash:** `0x25980dec7f198c7b228a621c61b911b8a20c55b340f398e495c4be65aa399f3c`
- **Encoding:** canonical DAG-CBOR
- **Canonical manifest:** [vellum.social.github.v1.json](./manifests/vellum.social.github.v1.json)

## Payload

| Field                | Type             | Required | Rules                                                                           |
| -------------------- | ---------------- | -------- | ------------------------------------------------------------------------------- |
| `user_id`            | positive integer | Yes      | Stable GitHub numeric account ID; maximum JavaScript safe integer               |
| `login`              | string           | Yes      | 1-100 ASCII letters, digits, or hyphens; starts and ends with a letter or digit |
| `profile_url`        | string           | Yes      | Exactly `https://github.com/{login}`; at most 256 characters                    |
| `account_created_at` | integer          | Yes      | Positive safe-integer Unix timestamp in seconds; no later than `verified_at`    |
| `verified_at`        | integer          | Yes      | Positive safe-integer Unix timestamp in seconds                                 |

```json
{
  "user_id": 9000000001,
  "login": "vellum-builder",
  "profile_url": "https://github.com/vellum-builder",
  "account_created_at": 1650000000,
  "verified_at": 1780000000
}
```

The payload contains no OAuth token, email address, or private profile data. The stable `user_id`
is the account identity; `login` is mutable display data captured at verification time.

This v1 manifest and hash are immutable. Any field or semantic change requires a new schema
version under the [registry versioning rules](./README.md#versioning).
