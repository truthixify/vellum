# @vellum/schemas

Canonical claim payload schemas for Vellum, plus TypeScript types and schema-hash helpers.

The package currently includes `vellum.social.github.v1`. Its manifest is serialized with RFC 8785
JSON Canonicalization Scheme and identified by `CKB_HASH(JCS(manifest))`. The runtime parser rejects
unknown fields and keeps provider credentials out of the payload.

## What lives here

- `src/social/<platform>.v<n>.ts` for each social schema
- `src/profile/v<n>.ts` for the self-issued profile
- `src/index.ts` re-exports and a registry map keyed by schema id
- `src/hash.ts` for canonical JSON plus BLAKE2b-256 hash derivation

## GitHub account claim

`vellum.social.github.v1` records GitHub's stable numeric user ID, current login and profile URL,
the account creation time, and the time Vellum verified the account. Timestamps are Unix seconds.
The OAuth access token is not part of the claim and must not be retained by issuers.

## Consumers

- The dashboard for form generation and renderers
- The scoring service for building claim payloads before signing
- External issuers who want the exact same hashes Vellum uses
