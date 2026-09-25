# packages

Shared libraries consumed by apps in this workspace. Each subfolder is a Bun/Node package (or Rust crate for on-chain code).

## Contents

- `ui/` - shared Vellum design tokens and source-only React primitives used by both Vite apps.
- `schemas/` — canonical claim payload schemas (JSON specs, TypeScript types, schema-hash helpers). Consumed by the dashboard, the scoring service, and any external issuer that wants to match Vellum's exact hashes.
- `scoring/` - versioned, deterministic reputation policies and evidence selection.
- `sdk/` - the public `@usevellum/sdk` package with typed Claim Cell codecs, readers, and transaction
  builders for Vellum and other CKB applications.
- `claim-cell-script/` - Rust source for the Claim Type and reusable DID Lock. Not a JS package; it
  has its own Cargo toolchain.

## Naming

Private workspace packages use the `@vellum/*` scope. The public Claim SDK is published as
`@usevellum/sdk`.
