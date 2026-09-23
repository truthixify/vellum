# `vellum.contribution.github.v1`

Records a bounded set of eligible GitHub pull-request and review artifacts from the published CKB
repository registry.

- **Schema hash:** `0xa08a1f034af0f1ebc75a6847dde6a90ee0c3dde63f3ffe4eaed248ea9e7730a1`
- **Encoding:** canonical DAG-CBOR
- **Canonical manifest:** [vellum.contribution.github.v1.json](./manifests/vellum.contribution.github.v1.json)

## Payload

| Field                     | Type             | Required | Rules                                                                           |
| ------------------------- | ---------------- | -------- | ------------------------------------------------------------------------------- |
| `user_id`                 | positive integer | Yes      | Stable GitHub numeric account ID; maximum JavaScript safe integer               |
| `login`                   | string           | Yes      | 1-100 ASCII letters, digits, or hyphens; starts and ends with a letter or digit |
| `verified_at`             | integer          | Yes      | Positive safe-integer Unix timestamp in seconds                                 |
| `window_started_at`       | integer          | Yes      | Positive safe integer exactly equal to `verified_at - 31536000`                 |
| `repository_registry`     | string           | Yes      | Exactly `ckb.public-contributions.v1`                                           |
| `eligible_artifact_count` | positive integer | Yes      | Safe-integer total before payload-size truncation; at least `artifacts.length`  |
| `artifacts`               | array            | Yes      | 1-20 unique artifacts in canonical order                                        |

### Artifact

Every artifact object contains all of these fields and rejects additional properties.

| Field              | Type             | Rules                                                                                                                                               |
| ------------------ | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `artifact_id`      | string           | 4-128 ASCII letters, digits, `_`, `=`, or `-`; unique in the payload                                                                                |
| `pull_request_id`  | string           | 4-128 ASCII letters, digits, `_`, `=`, or `-`; unique in the payload                                                                                |
| `repository_id`    | string           | 4-128 ASCII letters, digits, `_`, `=`, or `-`                                                                                                       |
| `repository`       | string           | 3-140 character `owner/name`; owner is 1-40 letters, digits, or hyphens and starts and ends alphanumeric; name is 1-100 and also allows `_` and `.` |
| `number`           | positive integer | Safe-integer pull-request number                                                                                                                    |
| `title`            | string           | Trimmed display text, 1-256 characters, excluding control characters                                                                                |
| `url`              | string           | Exactly `https://github.com/{repository}/pull/{number}`; at most 300 characters                                                                     |
| `kind`             | string enum      | `merged_pull_request` or `pull_request_review`                                                                                                      |
| `classification`   | string enum      | `technical` or `ecosystem`                                                                                                                          |
| `changed_files`    | integer          | 1-3,000                                                                                                                                             |
| `merge_commit_sha` | string           | 40 lowercase hexadecimal characters                                                                                                                 |
| `merged_at`        | integer          | Positive safe-integer Unix timestamp in seconds                                                                                                     |
| `occurred_at`      | integer          | Positive safe-integer Unix timestamp in seconds                                                                                                     |

Artifacts are sorted by `occurred_at` descending, then `artifact_id` ascending. Their timestamps
must satisfy `window_started_at <= occurred_at <= merged_at <= verified_at`. A merged pull request
uses the same artifact and pull-request ID and has `occurred_at == merged_at`; a review uses a
distinct artifact ID.

```json
{
  "user_id": 9000000001,
  "login": "vellum-builder",
  "verified_at": 2000000000,
  "window_started_at": 1968464000,
  "repository_registry": "ckb.public-contributions.v1",
  "eligible_artifact_count": 1,
  "artifacts": [
    {
      "artifact_id": "PR_example0001",
      "changed_files": 17,
      "classification": "technical",
      "kind": "merged_pull_request",
      "merge_commit_sha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "merged_at": 1999999900,
      "number": 42,
      "occurred_at": 1999999900,
      "pull_request_id": "PR_example0001",
      "repository": "example-org/ckb-toolkit",
      "repository_id": "R_example0001",
      "title": "Add a CKB integration",
      "url": "https://github.com/example-org/ckb-toolkit/pull/42"
    }
  ]
}
```

The payload contains public artifact references only. It contains no OAuth credentials, email
addresses, private-repository activity, or activity outside the selected repository registry.

This v1 manifest and hash are immutable. Any field, classification, registry-binding, or semantic
change requires a new schema version under the [registry versioning rules](./README.md#versioning).
