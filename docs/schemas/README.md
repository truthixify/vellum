# Claim schema registry

This directory publishes the immutable v1 payload specifications used by Vellum's account
verifiers. A schema defines the meaning and validation of the DAG-CBOR payload inside a Claim
Cell. It does not establish issuer trust: readers must still choose trusted issuer DIDs and verify
the Claim Cell's inclusion and current issuer authorization.

## Published schemas

| Schema ID                       | Schema hash                                                          | Specification                                       | Canonical manifest                                     |
| ------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------ |
| `vellum.social.github.v1`       | `0x25980dec7f198c7b228a621c61b911b8a20c55b340f398e495c4be65aa399f3c` | [GitHub identity](./social.github.v1.md)            | [JSON](./manifests/vellum.social.github.v1.json)       |
| `vellum.contribution.github.v1` | `0xa08a1f034af0f1ebc75a6847dde6a90ee0c3dde63f3ffe4eaed248ea9e7730a1` | [GitHub contributions](./contribution.github.v1.md) | [JSON](./manifests/vellum.contribution.github.v1.json) |
| `vellum.social.discord.v1`      | `0x1d0169167b6c34b7818ba6932974679f8fd5284e4d5d79319da12f7d79df8b69` | [Discord identity](./social.discord.v1.md)          | [JSON](./manifests/vellum.social.discord.v1.json)      |
| `vellum.community.discord.v1`   | `0x3cba5b1c2967fee27bbde52d5e609137aa0d2cccaf68e1d8722e9b943e78f550` | [Discord communities](./community.discord.v1.md)    | [JSON](./manifests/vellum.community.discord.v1.json)   |
| `vellum.social.telegram.v1`     | `0xe8b7f0ba94a55a5676ab205d9e1a997e1953d1e5cb6b89fd295ad5d69356467f` | [Telegram identity](./social.telegram.v1.md)        | [JSON](./manifests/vellum.social.telegram.v1.json)     |
| `vellum.community.telegram.v1`  | `0x8f8b0b59997ff96fde030314498c56008cb743006ae53b368339382640f8bd59` | [Telegram communities](./community.telegram.v1.md)  | [JSON](./manifests/vellum.community.telegram.v1.json)  |
| `vellum.social.bluesky.v1`      | `0x60bfe9263501d3d17513463b9a3163793690dcf2b614ecc17d7dd52688a083f6` | [Bluesky identity](./social.bluesky.v1.md)          | [JSON](./manifests/vellum.social.bluesky.v1.json)      |

The same entries are exported as `vellumSchemaRegistry` from `@vellum/schemas`. Verification
adapters use the registry definitions when constructing and validating claims.

All identities, provider IDs, community IDs, repository names, and timestamps in the examples are
synthetic. They are not copied from verifier configuration or live accounts.

## Serialization and hashing

The JSON manifest describes a payload schema. Its schema hash is:

```text
CKB_HASH(UTF8(JCS(schema_manifest)))
```

`JCS` is the RFC 8785 JSON Canonicalization Scheme. `CKB_HASH` is BLAKE2b-256 with the
`ckb-default-hash` personalization used by CKB. Formatting and property order in the published JSON
file do not affect the hash. Manifest values do.

Claim payloads are encoded separately as canonical DAG-CBOR. The JSON examples in these pages show
the equivalent data model; they are not the on-chain byte representation. Objects reject unlisted
properties unless a specification explicitly says otherwise.

Run the registry verification to parse every example, recompute every pinned hash, and compare every
published JSON manifest with the implementation:

```bash
bun test packages/schemas/src/registry.test.ts
```

## Versioning

Published v1 IDs, manifests, hashes, field semantics, and validation constraints are immutable. A
payload-shape or semantic change requires a new schema ID such as `.v2`, a new manifest, and a new
hash. Readers may support multiple versions during a migration, but must never interpret one
version using another version's rules.

Documentation may be clarified without changing the corresponding manifest or the meaning of a v1
field. The registry test rejects manifest drift.
