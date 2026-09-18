# packages

Shared libraries consumed by apps in this workspace. Each subfolder is a Bun/Node package (or Rust crate for on-chain code).

## Contents

- `ui/` - shared Vellum design tokens and source-only React primitives used by both Vite apps.
- `schemas/` — canonical claim payload schemas (JSON specs, TypeScript types, schema-hash helpers). Consumed by the dashboard, the scoring service, and any external issuer that wants to match Vellum's exact hashes.
- `sdk/` - typed Claim Cell codecs and read/write APIs for Vellum and other CKB applications.
- `claim-cell-script/` - Rust source for the Claim Type and reusable DID Lock. Not a JS package; it
  has its own Cargo toolchain.

## Naming

Workspace packages use the `@vellum/*` scope (e.g., `@vellum/schemas`). The npm scope needs registering only if a package is published.
