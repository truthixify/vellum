# Changelog

## 0.1.2

### Patch Changes

- 982cdf6: Let applications provide compatible CCC core and did-ckb packages so SDK values share one dependency graph.

## 0.1.1

### Patch Changes

- d759217: Expand the executable SDK examples with did:ckb identity resolution and a complete claim issuance
  flow that prepares, signs, integrity-checks, and submits the transaction.

## 0.1.0

### Minor Changes

- 01b4b69: Publish the first Vellum Claim Cell SDK release with canonical Molecule and DAG-CBOR codecs,
  complete live claim reads, schema-bound payload parsing, and unsigned single or batch transaction
  construction. The release includes explicit expiry evaluation, issuer-state verification, DID
  authorization, capacity and fee handling, package validation, and offline and Testnet coverage.
