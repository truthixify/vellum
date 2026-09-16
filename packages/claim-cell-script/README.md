# Claim Cell scripts

This package contains the Rust contracts, shared Molecule types, and reproducible checks for
Vellum Claim Cells and the reusable DID Lock.

- [Claim Cell protocol](../../docs/claim-cell.md)
- [Canonical Molecule schema](./molecules/claim.mol)

Claim Type and DID Lock are separate contracts with independent deployment identities. The contracts
are tested locally with `ckb-testtool`; they have not been deployed to CKB Testnet.

## Checks

Run these commands from this directory:

```bash
make prepare
make fmt
make check
make clippy
make test
make size
```

`make build` creates release binaries in `build/release`. The test harness deploys those binaries
into `ckb-testtool` and covers issuer resolution from inputs, outputs, and cell deps, controller
authorization, arbitrary subject locks, destruction, malformed data, duplicate claims, and DID Lock
rotation and recursion boundaries.

The VM fixtures use `ckb-testtool`'s `ALWAYS_SUCCESS` lock as a deterministic stand-in. Real wallet,
multisig, and `did:ckb` controller authorization remains the responsibility of the lock scripts
deployed alongside a Claim Type.

Binary size and cycle usage are optimization and deployment inputs, not evidence of Testnet
deployment or production security review. The Claim Type remains above the earlier 30 KB soft size
goal; reducing it further is a pre-deployment optimization task.

## Local measurements

These measurements were recorded with the release profile and `ckb-testtool` 1.1.1 on the current
workspace. They are reproducibility baselines, not protocol limits.

| Artifact or path                           |    Measurement |
| ------------------------------------------ | -------------: |
| `claim-cell` binary                        |   38,368 bytes |
| `did-lock` binary                          |   23,208 bytes |
| Claim creation with issuer replacement     | 137,517 cycles |
| Claim destruction                          |  12,603 cycles |
| Claim creation from a live cell dep        | 116,864 cycles |
| Claim creation with a new issuer DID       | 118,972 cycles |
| DID Lock authorization from a cell dep     |  36,466 cycles |
| DID Lock authorization with identity input |  34,931 cycles |
