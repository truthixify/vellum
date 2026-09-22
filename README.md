# Vellum

[![CI](https://github.com/truthixify/vellum/actions/workflows/ci.yml/badge.svg)](https://github.com/truthixify/vellum/actions/workflows/ci.yml)

**Your reputation should travel with you.**

Vellum takes its name from a material used for records meant to last. The project is built on the
same idea: your identity and record of work should belong to you, not whichever platform happens to
display them.

It starts with [`did:ckb`](https://github.com/web5fans/web5-wips/blob/master/01.md), an identifier a
person controls on Nervos CKB instead of an account a platform controls for them.

The identity foundation exists today. The next step is to let communities and products attach
issuer-authorized records of real activity to that identity, so a builder's work can be verified and
carried between apps instead of disappearing into separate databases.

[Website](https://usevellum.xyz) | [Dashboard](https://dashboard.usevellum.xyz) |
[Public roadmap](https://github.com/users/truthixify/projects/2)

> **Where things stand:** Vellum's identity tools, Claim contracts, GitHub and Discord verification,
> and a deterministic reputation policy are live on CKB Testnet. Telegram verification is ready for
> deployment once its bot and OpenID Connect settings are installed. GitHub claims carry accepted
> work from important CKB repositories into the Technical and Contribution categories, while
> Discord and Telegram provide explicitly recognized community evidence. The dashboard shows each
> score together with the evidence and rules that produced it.

## Why Vellum

A quest completed on CKBoost, work shipped on GitHub, attendance at a community event, and a grant
delivered are all useful signals. Today, each one belongs to the platform that recorded it. Other
applications cannot reliably verify it, and the person who earned it cannot take it elsewhere.

Vellum is designed to turn those signals into Claim Cells authorized by an issuer's `did:ckb` and
held under a builder-controlled CKB lock. Every claim identifies its issuer and schema, while its
output lock identifies the subject. That makes the evidence portable without pretending that every
issuer is equally trustworthy: the reader still decides whose claims to accept and how to use them.

The evidence behind reputation lives in CKB Cells, not in a private Vellum database. If the Vellum
interface disappears, another application can read the same claims and apply the published policy.
The builder controls the Cells attached to their identity and can remove a claim they no longer
want to keep. Issuers pay the CKB capacity needed to create the claims they make.

CKBoost is the first intended product integration. Quest completions will become issuer-authorized
claims that can appear on a public builder profile and contribute to a transparent score. The same
pattern can support event attendance, grant delivery, community roles, and governance eligibility
without requiring those products to share one backend.

## What exists today

| Part                 | Status                          | What that means                                                                                                                                                                            |
| -------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `did:ckb` identity   | Live on CKB Testnet and Mainnet | People can establish and manage a durable identity through wallet-signed transactions.                                                                                                     |
| Vellum website       | Live                            | The public site explains the project and includes a Testnet DID resolver.                                                                                                                  |
| Vellum dashboard     | Live                            | The dashboard provides the wallet-connected identity experience and defaults to Testnet. Mainnet is selectable.                                                                            |
| Reputation protocol  | Live on CKB Testnet             | Claim contracts, the core SDK, GitHub and Discord verification, contribution evidence, and the versioned scoring API are available; Telegram verification awaits deployment configuration. |
| Reputation dashboard | Live on CKB Testnet             | Scores, categories, contributing evidence, exclusions, and share cards come from the scoring service.                                                                                      |

The published [`@ckb-ccc/did-ckb`](https://www.npmjs.com/package/@ckb-ccc/did-ckb) package provides
the identity operations used by Vellum. The Vellum SDK builds on those primitives with Claim Cell
codecs, live reads, and unsigned transaction construction that other CKB applications can use
without depending on the Vellum interface.

## What comes next

The public roadmap moves from the primitive to real use:

1. Turn contribution claims into richer public builder profiles and connect CKBoost quest
   completions as a real
   participation signal.
2. Show how other projects can use the record through claim issuance tools and a small governance
   gating reference.
3. Expand the reviewed issuer and repository ecosystem without weakening the evidence model.

The work is deliberately testnet-first. A formal audit and promotion of the reputation protocol to
Mainnet are separate decisions, not implied by completing this roadmap.

## Design principles

- **Portable, not platform-bound.** The record should outlast any one interface, API, or company.
- **Evidence before scores.** Profiles expose the claims behind a score, including who issued them.
- **Reader-chosen trust.** Anyone may issue a claim; every consumer chooses the issuers and policies
  it trusts.
- **Holder control.** The person named by a claim controls whether that Cell remains part of their
  public record.
- **Open infrastructure.** The core protocol has no Vellum token, subscription, or protocol fee.

Here, "lasting" does not mean a platform keeps your data forever. It means the record is yours,
independently verifiable, and not tied to the application currently displaying it.

## Repository

```text
.
├── apps/
│   ├── dashboard/                  identity dashboard, verification API, and reputation service
│   └── site/                       public website, docs, and Testnet resolver
├── docs/                            protocol and integration documentation
└── packages/
    ├── claim-cell-script/          Rust Claim Type, DID Lock, and local VM tests
    ├── schemas/                    canonical claim manifests, hashes, and payload parsers
    ├── scoring/                    deterministic scoring policies and evidence selection
    ├── sdk/                        typed Claim Cell codecs and APIs
    └── ui/                         shared design tokens and React components
```

Both applications are React 19 and Vite 7 SPAs in a Bun workspace. The dashboard uses TanStack
Router, Tailwind CSS 4, and CCC's connector packages. Shared Vellum components live in `@vellum/ui`.
The claim scripts are tested locally with `ckb-testtool` and deployed on CKB Testnet. The schema
package pins canonical manifests and validates payloads used by verification adapters and readers.

## Run locally

The workspace is pinned to Bun 1.3.14.

```bash
bun install
```

Run the two applications in separate terminals:

```bash
bun run dev:site       # http://localhost:8081
bun run dev:dashboard  # http://localhost:8080
```

The site accepts `VITE_DASHBOARD_URL` and the dashboard accepts `VITE_SITE_URL` when their linked
origins need to be overridden.

## Quality checks

```bash
bun run check
```

The complete gate checks formatting, linting, TypeScript, tests, and production builds. Husky runs
staged-file checks before a commit, validates commit messages, and runs the complete gate before a
push.

The test command covers the existing application, protocol, and deployment checks. New behavior
should arrive with focused tests for both successful and rejected paths.

## Deployment

The public site and dashboard deploy independently to Vercel from `apps/site` and `apps/dashboard`.
Each app produces `dist` and includes an SPA rewrite for direct visits to client-side routes. The
dashboard deployment also serves the stateless verification API described in
[`docs/verification-service.md`](./docs/verification-service.md) and the read-only reputation API
described in [`docs/reputation-scoring.md`](./docs/reputation-scoring.md).

### Claim contracts

The Claim Type and DID Lock use separate, independently upgradable Type ID code cells on CKB
Testnet. [`deployments/testnet.json`](./deployments/testnet.json) is the canonical machine-readable
record; [`deployments/testnet.toml`](./deployments/testnet.toml) is the CKB CLI deployment config.

Both current code cells were published by
[transaction `0xaf693346...e2686c`](https://testnet.explorer.nervos.org/transaction/0xaf693346282063a5d51f79d180fc807cdba1b8ac9d7af30085ff0aa190e2686c):

| Contract   | Output index | `code_hash`                                                          | `data_hash`                                                          |
| ---------- | ------------ | -------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Claim Type | `0x0`        | `0xfb2757e524b3f83161d8b85b8b3e00186e2019ff04f5dfe833c5a72731e13157` | `0xb3bc4b7c775e65135fb03c690ee91193a85265643a4e7f2273d8a4259b900984` |
| DID Lock   | `0x1`        | `0xe1562cc57b4bd91619ada2f7e74d63805ea7038a7b6de0b18a529d51aa883d2d` | `0x40ff6cd22ee270a48881c869e6838d2aa5734e42b9704626c35cb3c56efe0b63` |

Both locators use `hash_type: type` and `dep_type: code`. This is upgradable Testnet infrastructure,
not a security audit or a Mainnet release.

Build both release binaries and prepare a future deployment or upgrade transaction with CKB CLI
2.0.0:

```bash
bun run prepare:testnet-deployment
bun run view:testnet-deployment
```

The generated `deployments/info.json` remains local because it is the one-time transaction envelope.
Committed migration snapshots preserve the Type ID history needed for future upgrades. Review the
explained transaction before signing. Signing and `ckb-cli deploy apply-txs` are intentionally manual
because they authorize and broadcast the Type ID deployment.

Verify the committed cells, Type ID locators, hashes, capacities, and complete binary bytes against
a fresh release build:

```bash
bun run verify:testnet-deployment
```

### did:ckb contracts

Vellum currently uses the upstream did:ckb Identity Type Script. These deployments are separate
from Vellum's Claim Type and DID Lock listed above.

| Network | `code_hash`                                                          | Deployment transaction                                               |
| ------- | -------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Mainnet | `0x4a06164dc34dccade5afe3e847a97b6db743e79f5477fa3295acf02849c5984a` | `0xe2f74c56cdc610d2b9fe898a96a80118845f5278605d7f9ad535dad69ae015bf` |
| Testnet | `0x510150477b10d6ab551a509b71265f3164e9fd4137fcb5a4322f49f03092c7c5` | `0x0e7a830e2d5ebd05cd45a55f93f94559edea0ef1237b7233f49f7facfb3d6a6c` |

Both use `hash_type: type`, output index `0x0`, and `dep_type: code`. The upstream
[`web5fans/did-ckb`](https://github.com/web5fans/did-ckb) repository remains the source of truth for
deployment details and protocol behavior.

## Working on Vellum

Repository issues are grouped into GitHub milestones and tracked on the public
[Vellum Reputation Extension project](https://github.com/users/truthixify/projects/2). Each issue is
developed on a focused branch and delivered through one pull request. The milestones and Project
board show the larger delivery picture.

## License

Vellum is available under the [MIT License](./LICENSE).

## References

- [`did:ckb` method specification](https://github.com/web5fans/web5-wips/blob/master/01.md)
- [`web5fans/did-ckb`](https://github.com/web5fans/did-ckb)
- [Common Chains Connector](https://github.com/ckb-devrel/ccc)
