# @vellum/schemas

Canonical claim payload schemas for Vellum, plus TypeScript types and schema-hash helpers.

## What lives here

- `src/social/<platform>.v<n>.ts` for each social schema
- `src/profile/v<n>.ts` for the self-issued profile
- `src/index.ts` re-exports and a registry map keyed by schema id
- `src/hash.ts` for canonical JSON plus BLAKE2b-256 hash derivation

## Consumers

- The dashboard for form generation and renderers
- The scoring service for building claim payloads before signing
- External issuers who want the exact same hashes Vellum uses
