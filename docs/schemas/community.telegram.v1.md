# `vellum.community.telegram.v1`

Records current membership in explicitly configured Telegram communities.

- **Schema hash:** `0x8f8b0b59997ff96fde030314498c56008cb743006ae53b368339382640f8bd59`
- **Encoding:** canonical DAG-CBOR
- **Canonical manifest:** [vellum.community.telegram.v1.json](./manifests/vellum.community.telegram.v1.json)

## Payload

| Field         | Type    | Required | Rules                                                                     |
| ------------- | ------- | -------- | ------------------------------------------------------------------------- |
| `user_id`     | string  | Yes      | Canonical positive Telegram user ID, 1-20 digits                          |
| `verified_at` | integer | Yes      | Positive safe-integer Unix timestamp in seconds                           |
| `memberships` | array   | Yes      | 1-16 membership objects, unique and sorted by ascending numeric `chat_id` |

### Membership

| Field            | Type        | Required | Rules                                                           |
| ---------------- | ----------- | -------- | --------------------------------------------------------------- |
| `chat_id`        | string      | Yes      | Canonical negative Telegram chat ID, 2-21 characters            |
| `community_name` | string      | Yes      | Trimmed 1-100 character issuer label with no control characters |
| `community_type` | string enum | Yes      | `channel`, `group`, or `supergroup`                             |
| `member_role`    | string enum | Yes      | `administrator`, `member`, or `owner`                           |

```json
{
  "user_id": "1234123412341234123",
  "verified_at": 1800000000,
  "memberships": [
    {
      "chat_id": "-1000000000000000001",
      "community_name": "Example CKB Community",
      "community_type": "supergroup",
      "member_role": "member"
    }
  ]
}
```

Telegram's Bot API does not expose a membership join time, so this schema makes no community-tenure
claim. The payload contains no bot token, phone number, messages, or unrelated chats. Freshness and
expiry are carried by the Claim envelope rather than inferred from continued membership.

This v1 manifest and hash are immutable. Any field or semantic change requires a new schema
version under the [registry versioning rules](./README.md#versioning).
