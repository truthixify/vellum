# packages

Shared libraries consumed by apps in this workspace. Each subfolder is a Bun/Node package (or Rust crate for on-chain code).

## Contents

- `schemas/` — canonical claim payload schemas (JSON specs, TypeScript types, schema-hash helpers). Consumed by the dashboard, the scoring service, and any external issuer that wants to match Vellum's exact hashes.
- `claim-cell-script/` — Rust source for the on-chain Claim Cell type script. Not a JS package; has its own Cargo toolchain.

## Naming

Workspace packages use the `@vellum/*` scope (e.g., `@vellum/schemas`). The npm scope needs registering only if a package is published.
