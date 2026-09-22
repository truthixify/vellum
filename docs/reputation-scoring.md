# Reputation scoring

Vellum computes reputation from live, validated Claim Cells. The score is a reproducible view of
public evidence, not a second reputation record: the service keeps no reputation database and does
not issue a score claim. Given the same accepted claims, policy version, and evaluation time, the
result is identical.

The active Testnet policy is `vellum.reputation.v5`. Policies v1 through v4 remain exported for
consumers that need to interpret older results; their meaning has not changed.

## Score model

The score is an integer from 0 to 1000. Category caps are fixed and missing evidence remains zero;
the result is never normalized around the categories a subject happens to have.

| Category     |  Maximum | Evidence scored in v5                                                     |
| ------------ | -------: | ------------------------------------------------------------------------- |
| Technical    |      300 | Accepted code-bearing GitHub work                                         |
| Contribution |      300 | Accepted GitHub pull requests and substantive reviews                     |
| Community    |      200 | Strongest recognized Discord or Telegram community evidence               |
| Tenure       |      100 | Best verified GitHub or Discord account age                               |
| Recency      |      100 | Most recent accepted GitHub, Discord, Telegram, or Bluesky identity proof |
| **Overall**  | **1000** | Sum of category scores                                                    |

Account ownership alone does not prove technical work or ecosystem contribution. Those categories
stay at zero unless an active GitHub contribution claim contains qualifying artifacts.

### Identity tenure

Account age is measured from the provider account creation time to the explicit evaluation time.
GitHub and Discord use the same bands. When both are present, only the highest qualifying result
contributes.

| Account age        | Points |
| ------------------ | -----: |
| Less than 30 days  |      0 |
| At least 30 days   |     20 |
| At least 180 days  |     40 |
| At least 365 days  |     60 |
| At least 730 days  |     80 |
| At least 1460 days |    100 |

The rule IDs are `github-account-tenure.v5` and `discord-account-tenure.v5`. Telegram and Bluesky
claims do not contain a provider-backed account creation timestamp, so neither contributes tenure
points.

### Verification recency

Verification age is measured from `verified_at` to the evaluation time. An exact boundary enters
the next lower band. Only the highest qualifying result contributes.

| Verification age          | Points |
| ------------------------- | -----: |
| Less than 30 days         |    100 |
| 30 to less than 90 days   |     75 |
| 90 to less than 180 days  |     50 |
| 180 to less than 365 days |     25 |
| At least 365 days         |      0 |

The rule IDs are `github-verification-recency.v5`, `discord-verification-recency.v5`,
`telegram-verification-recency.v5`, and `bluesky-verification-recency.v5`.

### GitHub ecosystem contributions

`vellum.contribution.github.v1` records accepted public work from the 365 days before verification.
The claim expires after exactly 30 days, so contribution evidence must be checked again regularly.
The associated `vellum.social.github.v1` claim is still required and must identify the same stable
GitHub user ID. A verified account with no qualifying work receives no Technical or Contribution
points.

Repository eligibility comes from `ckb.public-contributions.v1`, a versioned registry keyed by
GitHub's stable repository node IDs. Names are display snapshots, so a rename does not change the
repository's identity. The registry contains 69 repositories:

- `ckb-devrel`: `ccc`, `offckb`, `create-ccc-app`, `known-scripts`, `ccc-locks`,
  `CKB-Developer-Resource`, `ssri-server`, `ccc-schedule-send`, and `nervdao`
- `nervosnetwork`: `ckb`, `ckb-vm`, `ckb-std`, `ckb-testtool`, `ckb-system-scripts`,
  `ckb-c-stdlib`, `ckb-cli`, `ckb-light-client`, `ckb-sdk-rust`, `ckb-sdk-go`, `ckb-sdk-java`,
  `ckb-sdk-ruby`, `neuron`, `molecule`, `sparse-merkle-tree`, `rfcs`, `docs.nervos.org`, `fiber`,
  `fiber-docs`, `fiber-py-integration-test`, `fiber-dashboard`, `fiber-scripts`, `fiber-sphinx`,
  `omnilock`, `anyone-can-pay`, `quantum-resistant-lock-script`, `ckb-py-integration-test`,
  `ckb-vm-contrib`, `ckb-standalone-debugger`, `ckb-script-templates`, `ckb-explorer`,
  `ckb-explorer-frontend`, `ckb-tui`, `ckb-discovery`, `ckb-sync`, `ckb-rpc-resources`,
  `ckb-vm-fuzzing-test`, `ckb-contract-tests`, `ckb-treasury-lab`, `CkbGuardian`, `ckb-js-vm`,
  `ckb-production-scripts`, `ckb-miscellaneous-scripts`, `capsule`, `ckb-light-test`,
  `force-bridge`, `force-bridge-btc`, `force-bridge-eth`, `tentacle`, and `ckb-auth`
- `ckb-js`: `ckb-sdk-js`, `lumos`, `kuai`, `ckit`, and `nexus`
- `RGBPlusPlus`: `rgbpp-sdk`, `btc-assets-api`, `rgbpp-explorer`, `ckb-bitcoin-spv`, and
  `ckb-bitcoin-spv-contracts`

The canonical IDs and current names live in
[`github-repositories.ts`](../apps/dashboard/server/verification/github-repositories.ts). Adding or
removing a repository requires a reviewed registry change. Forks are rejected unless their stable
repository ID has an explicit `allowFork` entry. The approved forks are `ckb-devrel/nervdao`,
`nervosnetwork/tentacle`, `nervosnetwork/ckb-auth`, and the five listed `RGBPlusPlus` repositories.
Keyword matches, repository ownership, stars, and activity outside the registry do not establish
eligibility.

Two artifact types qualify:

1. A pull request authored by the verified account and merged into an eligible repository.
2. One `APPROVED` or `CHANGES_REQUESTED` review by the verified account on another person's pull
   request that was later merged into an eligible repository.

Open or unmerged pull requests, comments, issues, repeated reviews of one pull request, self-review,
and direct activity in an unapproved repository award nothing. If the same pull request appears in
both searches, authorship takes precedence and it cannot stack as a review.

An artifact is Technical when at least one changed path is code, a test, a contract schema, build
configuration, CI configuration, or another executable project file. Documentation and other
non-code-only changes remain ecosystem contributions without Technical points. Line counts do not
affect points.

| Accepted artifact       | Technical | Contribution | Rule IDs                                                     |
| ----------------------- | --------: | -----------: | ------------------------------------------------------------ |
| Technical merged PR     |        60 |           30 | `github-merged-technical-pr.v5`, `github-merged-pr.v5`       |
| Non-technical merged PR |         0 |           30 | `github-merged-pr.v5`                                        |
| Technical formal review |        15 |           10 | `github-technical-review.v5`, `github-substantive-review.v5` |
| Other formal review     |         0 |           10 | `github-substantive-review.v5`                               |

Up to the 20 most recent qualifying artifacts are recorded, sorted by occurrence time and then
stable artifact ID. Fewer are retained when necessary to keep the exact encoded Claim data within
16 KiB. `eligible_artifact_count` discloses when qualifying artifacts were omitted by either bound.
Category caps are applied in the recorded order, and an artifact shows no points after the relevant
cap is full. Each record includes the repository node ID and current name, pull request and review
node IDs, pull number, title, URL, merge commit, merge time, activity time, changed-file count, and
classification.

Only OAuth accounts whose GitHub account type is `User` are accepted; GitHub bot identities are
rejected before contribution collection.

### CKB community history

Discord community evidence lists only the servers configured as recognized CKB communities. The
oldest current membership determines the category score; recognized role names remain visible
evidence but do not award arbitrary points.

| Membership age     | Points |
| ------------------ | -----: |
| Less than 30 days  |      0 |
| At least 30 days   |     40 |
| At least 180 days  |     80 |
| At least 365 days  |    120 |
| At least 730 days  |    160 |
| At least 1460 days |    200 |

The rule ID is `discord-ckb-membership-tenure.v5`. Community claims expire after exactly 30 days,
so the server must verify current membership again before stale evidence can contribute.

Telegram's Bot API proves current membership in configured chats but does not expose when a member
joined. An active `vellum.community.telegram.v1` claim therefore contributes a conservative fixed
40 points under `telegram-ckb-membership.v5`. It records the configured community name, chat type,
and current member role and expires after exactly 30 days.

Discord and Telegram community points do not stack. The source with more points contributes; equal
points use the more recently issued claim and then a stable provider-name tie-break. The other
valid community claim remains visible accepted evidence with no direct contribution.

## Trust and evidence selection

Policy v5 trusts issuer `did:ckb:hlvxrdt3e7iwvuxdmbvejp6hc4yoo3no` for these schemas:

| Schema                          | Hash                                                                 |
| ------------------------------- | -------------------------------------------------------------------- |
| `vellum.social.github.v1`       | `0x25980dec7f198c7b228a621c61b911b8a20c55b340f398e495c4be65aa399f3c` |
| `vellum.contribution.github.v1` | `0xa08a1f034af0f1ebc75a6847dde6a90ee0c3dde63f3ffe4eaed248ea9e7730a1` |
| `vellum.social.discord.v1`      | `0x1d0169167b6c34b7818ba6932974679f8fd5284e4d5d79319da12f7d79df8b69` |
| `vellum.community.discord.v1`   | `0x3cba5b1c2967fee27bbde52d5e609137aa0d2cccaf68e1d8722e9b943e78f550` |
| `vellum.social.telegram.v1`     | `0xe8b7f0ba94a55a5676ab205d9e1a997e1953d1e5cb6b89fd295ad5d69356467f` |
| `vellum.community.telegram.v1`  | `0x8f8b0b59997ff96fde030314498c56008cb743006ae53b368339382640f8bd59` |
| `vellum.social.bluesky.v1`      | `0x60bfe9263501d3d17513463b9a3163793690dcf2b614ecc17d7dd52688a083f6` |

The service scans every live Claim Cell for the subject before applying the trust policy. It does
not ask the SDK to hide other issuers or schemas, so present but rejected evidence remains visible.

Selection is deterministic:

1. Identical claim IDs count once. Every duplicate Cell is reported as `duplicate-claim`.
2. For one provider identity, the greatest `issued_at` wins. Bluesky uses its stable AT Protocol
   DID; the other providers use their stable account IDs. Equal timestamps use the
   lexicographically smaller claim ID.
3. Only one account per provider is accepted. Provider identity claims cannot stack tenure or
   recency.
4. Discord and Telegram community evidence each require the accepted identity claim for the same
   provider user ID.
5. Only the newest active community claim per provider user is accepted, and only the strongest
   community source contributes points.
6. GitHub contribution evidence requires the accepted GitHub identity claim for the same user ID.
7. Only the newest active contribution claim per GitHub user contributes; artifact and pull request
   IDs are unique within that claim.

Expired claims are inactive when `evaluatedAt >= expiresAt`. Claims issued after the checkpoint,
malformed payloads, untrusted issuers, unsupported schemas, and claims from missing, ambiguous, or
deactivated issuers do not contribute and appear in `excludedEvidence` with a stable reason.

If the subject scan cannot be completed, or the current state of an otherwise trusted issuer is
unavailable, the entire result is `unavailable`. Vellum does not return a partial score as though it
were complete.

## API

The dashboard deployment exposes:

```text
GET /api/reputation/<did:ckb>
```

The endpoint is public, read-only, CORS-readable, Testnet-only, and does not require a connected
wallet. The server selects the current Unix time and returns it as `evaluatedAt`; callers cannot ask
the current-live-Cell endpoint to imply a historical chain snapshot.

An available response returns HTTP `200` with the aggregate, all five categories, accepted
evidence, excluded evidence, and `policyVersion: "vellum.reputation.v5"`. Discord community evidence
includes the matching identity Claim reference, configured community names, join timestamps, and
recognized roles. Telegram community evidence includes its matching identity Claim reference,
configured community names, chat types, and current roles. GitHub contribution evidence includes
its matching identity Claim reference, the registry version, evidence window, artifact details,
rule IDs, and points. Bluesky evidence includes the stable AT Protocol DID and current handle. An
incomplete chain read returns HTTP `503`, `status: "unavailable"`, and no score fields.

## Interpretation

A social identity claim proves that the Vellum issuer verified control of that account at a stated
time. The Bluesky claim binds a current handle to the stable AT Protocol DID returned by the
provider. Discord and Telegram community claims additionally record current membership facts returned
for explicitly configured CKB communities. A GitHub contribution claim records public artifacts
accepted by maintainers of repositories named by the policy; it does not prove identity uniqueness
or make a universal judgment about skill. Consumers should inspect the evidence and choose
thresholds appropriate to their own use; governance eligibility is not defined by this policy.

## Verification

Run the deterministic package and server tests with:

```bash
bun run --cwd packages/scoring test
bun run --cwd apps/dashboard test
```

Run the opt-in live Testnet check with:

```bash
bun run --cwd apps/dashboard test:reputation:testnet
```
