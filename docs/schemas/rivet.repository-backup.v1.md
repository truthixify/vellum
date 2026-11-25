# `rivet.repository-backup.v1`

Records one confirmed public repository backup anchored by Rivet on CKB.

- **Schema hash:** `0x53165e4ecfb86396f39b777bd7dca5b15994ae5ae2c330f0a4e49b733ab1b780`
- **Encoding:** canonical DAG-CBOR
- **Canonical manifest:** [rivet.repository-backup.v1.json](./manifests/rivet.repository-backup.v1.json)

## Payload

| Field                   | Type    | Required | Rules                                                                    |
| ----------------------- | ------- | -------- | ------------------------------------------------------------------------ |
| `github_user_id`        | string  | Yes      | Canonical positive decimal GitHub account ID, up to 30 digits            |
| `github_repository_id`  | string  | Yes      | Canonical positive decimal GitHub repository ID, up to 30 digits         |
| `repository`            | string  | Yes      | Public `owner/name` repository label, 3-201 characters                   |
| `snapshot_tx_hash`      | string  | Yes      | Lowercase `0x`-prefixed 32-byte confirmed backup transaction hash        |
| `snapshot_output_index` | integer | Yes      | Referenced backup anchor output index, from `0` through `Uint32` maximum |
| `anchor_version`        | integer | Yes      | Exact value `2`, identifying Rivet's referenced backup anchor format     |
| `commit_count`          | integer | Yes      | Positive `Uint32` commit count read from the referenced anchor           |
| `backed_up_at`          | integer | Yes      | Positive safe-integer Unix timestamp from the anchor transaction block   |

```json
{
  "github_user_id": "9000000001",
  "github_repository_id": "9000000002",
  "repository": "vellum-builder/portable-reputation",
  "snapshot_tx_hash": "0x1111111111111111111111111111111111111111111111111111111111111111",
  "snapshot_output_index": 0,
  "anchor_version": 2,
  "commit_count": 248,
  "backed_up_at": 2000000000
}
```

The GitHub repository ID is the stable deduplication key. `github_user_id` identifies the
authenticated Rivet account that requested the backup; it does not assert that account owns the
repository or authored its commits. The repository label is informational and may change after a
rename. Rivet must verify that the repository is public, its immutable GitHub ID matches the stored
record, and the selected subject DID is live and linked to the verified Rivet account before
issuance.

The referenced transaction must be committed with the issuer's required confirmation depth. Its
output at `snapshot_output_index` must contain a Rivet v2 backup anchor whose commit count matches
the payload. `backed_up_at` comes from the transaction's block header, not an application clock.

This claim records that Rivet confirmed and anchored one public repository snapshot. It does not
certify commit authorship, repository quality, current IPFS availability, ownership of intellectual
property, or the absence of a newer backup. The payload deliberately excludes the encrypted bundle
CID, encryption key, IV, recovery file, private repository data, and other recovery material.

The schema describes evidence but does not make an issuer trusted or assign reputation points.
Readers must independently allowlist the Rivet issuer DID and decide whether this evidence is
relevant to their policy.

This v1 manifest and hash are immutable. Any field or semantic change requires a new schema version
under the [registry versioning rules](./README.md#versioning).
