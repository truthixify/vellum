# claim-cell-script

On-chain type script for the Vellum Claim Cell. Rust source compiled to a CKB script binary via the CKB script build toolchain (`ckb-std`, `ckb-script-templates`).

Not a JS package; the root Bun workspace ignores it because it has no `package.json`.

## Deployment

Testnet and mainnet deployment addresses (type-id) live in `deployments/` once the script is deployed. The dashboard reads that file for the CellDep, no hardcoded strings.

## Build

```
cd packages/claim-cell-script
cargo build --release --target riscv64imac-unknown-none-elf
```
