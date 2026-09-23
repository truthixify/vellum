# `vellum.social.telegram.v1`

Records control of a Telegram account at a stated verification time.

- **Schema hash:** `0xe8b7f0ba94a55a5676ab205d9e1a997e1953d1e5cb6b89fd295ad5d69356467f`
- **Encoding:** canonical DAG-CBOR
- **Canonical manifest:** [vellum.social.telegram.v1.json](./manifests/vellum.social.telegram.v1.json)

## Payload

| Field          | Type    | Required | Rules                                                    |
| -------------- | ------- | -------- | -------------------------------------------------------- |
| `user_id`      | string  | Yes      | Canonical positive Telegram user ID, 1-20 digits         |
| `display_name` | string  | Yes      | Trimmed, 1-128 characters, with no control characters    |
| `username`     | string  | No       | 1-32 ASCII letters, digits, or underscores               |
| `profile_url`  | string  | No       | Exactly `https://t.me/{username}`; at most 64 characters |
| `verified_at`  | integer | Yes      | Positive safe-integer Unix timestamp in seconds          |

`username` and `profile_url` must either both be present or both be absent. Telegram does not expose
account creation time, so this schema makes no account-tenure claim.

```json
{
  "user_id": "1234123412341234123",
  "display_name": "Vellum Builder",
  "username": "vellum_builder",
  "profile_url": "https://t.me/vellum_builder",
  "verified_at": 1780000000
}
```

The payload contains no ID token, bot token, phone number, access token, or permission for the bot
to message the account.

This v1 manifest and hash are immutable. Any field or semantic change requires a new schema
version under the [registry versioning rules](./README.md#versioning).
