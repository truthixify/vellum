# `vellum.social.bluesky.v1`

Records control of a Bluesky account using its stable AT Protocol DID and current handle.

- **Schema hash:** `0x60bfe9263501d3d17513463b9a3163793690dcf2b614ecc17d7dd52688a083f6`
- **Encoding:** canonical DAG-CBOR
- **Canonical manifest:** [vellum.social.bluesky.v1.json](./manifests/vellum.social.bluesky.v1.json)

## Payload

| Field         | Type    | Required | Rules                                                                                                                                          |
| ------------- | ------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `did`         | string  | Yes      | 13-2,048 characters; `did:plc:` plus 24 lowercase base32 characters, or `did:web:` plus letters, digits, `.`, `_`, `:`, `%`, or `-`            |
| `handle`      | string  | Yes      | 3-253 lowercase DNS-style characters; labels use letters, digits, or `-`, start and end alphanumeric, and the final label starts with a letter |
| `profile_url` | string  | Yes      | Exactly `https://bsky.app/profile/{did}`; at most 2,080 characters                                                                             |
| `verified_at` | integer | Yes      | Positive safe-integer Unix timestamp in seconds                                                                                                |

```json
{
  "did": "did:plc:aaaaaaaaaaaaaaaaaaaaaaaa",
  "handle": "builder.example.com",
  "profile_url": "https://bsky.app/profile/did:plc:aaaaaaaaaaaaaaaaaaaaaaaa",
  "verified_at": 1790000000
}
```

The DID is the stable account identity. The handle is mutable and records the value that resolved to
the authenticated DID at `verified_at`. The payload contains no app password, access token, refresh
token, or provider session data.

This v1 manifest and hash are immutable. Any field or semantic change requires a new schema
version under the [registry versioning rules](./README.md#versioning).
