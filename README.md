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

> **Where things stand:** Vellum's identity tools are live, and the reputation extension is now in
> implementation. Claim Cell contracts are being tested locally but are not deployed yet. Reputation
> scores, claims, activity, and governance data shown in the current interfaces are previews, not live
> records.

## Why Vellum

A quest completed on CKBoost, work shipped on GitHub, attendance at a community event, and a grant
delivered are all useful signals. Today, each one belongs to the platform that recorded it. Other
applications cannot reliably verify it, and the person who earned it cannot take it elsewhere.

Vellum is designed to turn those signals into Claim Cells authorized by an issuer's `did:ckb` and
held under a builder-controlled CKB lock. Every claim identifies its issuer and schema, while its
output lock identifies the subject. That makes the evidence portable without pretending that every
issuer is equally trustworthy: the reader still decides whose claims to accept and how to use them.

The planned reputation record lives in CKB Cells, not in a private Vellum database. If the Vellum
interface disappears, another application can read the same record. The builder controls the Cells
attached to their identity and can remove a claim they no longer want to keep. Issuers pay the CKB
capacity needed to create the claims they make.

CKBoost is the first intended product integration. Quest completions will become issuer-authorized
claims that can appear on a public builder profile and contribute to a transparent score. The same
pattern can support event attendance, grant delivery, community roles, and governance eligibility
without requiring those products to share one backend.

## What exists today

| Part                | Status                          | What that means                                                                                                 |
| ------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `did:ckb` identity  | Live on CKB Testnet and Mainnet | People can establish and manage a durable identity through wallet-signed transactions.                          |
| Vellum website      | Live                            | The public site explains the project and includes a Testnet DID resolver.                                       |
| Vellum dashboard    | Live                            | The dashboard provides the wallet-connected identity experience and defaults to Testnet. Mainnet is selectable. |
| Reputation protocol | In implementation               | Claim Type and DID Lock are implemented and under review; SDK, schemas, scoring, and deployment remain.         |
| Reputation products | Design preview                  | The preview screens show the intended experience but are not connected to live reputation data.                 |

The published [`@ckb-ccc/did-ckb`](https://www.npmjs.com/package/@ckb-ccc/did-ckb) package provides
the identity operations used by Vellum. The planned reputation work will extend that shared SDK so
other CKB applications can read and write claims without depending on the Vellum interface.

## What comes next

The public roadmap moves from the primitive to real use:

1. Deploy the Claim Cell contracts on Testnet, add claim APIs to the shared SDK, publish the schemas,
   and build the first verifiable social signals and scoring method.
2. Turn those claims into public builder profiles and connect CKBoost quest completions as a real
   participation signal.
3. Show how other projects can use the record through claim issuance tools and a small governance
   gating reference.

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
│   ├── dashboard/                  identity dashboard and reputation previews
│   └── site/                       public website, docs, and Testnet resolver
├── docs/                            protocol and integration documentation
└── packages/
    ├── claim-cell-script/          Rust Claim Type, DID Lock, and local VM tests
    ├── schemas/                    placeholder for canonical claim schemas
    └── ui/                         shared design tokens and React components
```

Both applications are React 19 and Vite 7 SPAs in a Bun workspace. The dashboard uses TanStack
Router, Tailwind CSS 4, and CCC's connector packages. Shared Vellum components live in `@vellum/ui`.
The claim scripts are tested locally with `ckb-testtool` but are not deployed. The schema package is
still a placeholder for the canonical manifests and reader-facing registry.

## Run locally

The workspace is pinned to Bun 1.3.9.

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

The test command is wired into the gate, but there are no automated test files yet. New behavior
should arrive with focused tests rather than treating an empty test run as coverage.

## Deployment

The public site and dashboard deploy independently to Vercel from `apps/site` and `apps/dashboard`.
Each app produces `dist` and includes an SPA rewrite for direct visits to client-side routes.

### did:ckb contracts

Vellum currently uses the upstream did:ckb Identity Type Script. These addresses do not represent
the planned Claim Cell script.

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

## References

- [`did:ckb` method specification](https://github.com/web5fans/web5-wips/blob/master/01.md)
- [`web5fans/did-ckb`](https://github.com/web5fans/did-ckb)
- [Common Chains Connector](https://github.com/ckb-devrel/ccc)
