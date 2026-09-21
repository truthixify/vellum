# Reputation scoring

Vellum computes reputation from live, validated Claim Cells. The score is a reproducible view of
public evidence, not a second reputation record: the service keeps no reputation database and does
not issue a score claim. Given the same accepted claims, policy version, and evaluation time, the
result is identical.

The active Testnet policy is `vellum.reputation.v2`. Policy v1 remains exported for consumers that
need to interpret older results; its meaning has not changed.

## Score model

The score is an integer from 0 to 1000. Category caps are fixed and missing evidence remains zero;
the result is never normalized around the categories a subject happens to have.

| Category     |  Maximum | Evidence scored in v2                                 |
| ------------ | -------: | ----------------------------------------------------- |
| Technical    |      300 | None                                                  |
| Contribution |      300 | None                                                  |
| Community    |      200 | Recognized CKB Discord community membership age       |
| Tenure       |      100 | Best verified GitHub or Discord account age           |
| Recency      |      100 | Most recent accepted GitHub or Discord identity proof |
| **Overall**  | **1000** | Sum of category scores                                |

Account ownership alone does not prove technical work or ecosystem contribution. Those categories
stay at zero until a future policy names evidence that can substantiate them.

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

The rule IDs are `github-account-tenure.v2` and `discord-account-tenure.v2`.

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

The rule IDs are `github-verification-recency.v2` and `discord-verification-recency.v2`.

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

The rule ID is `discord-ckb-membership-tenure.v2`. Community claims expire after exactly 30 days,
so the server must verify current membership again before stale evidence can contribute.

## Trust and evidence selection

Policy v2 trusts issuer `did:ckb:hlvxrdt3e7iwvuxdmbvejp6hc4yoo3no` for these schemas:

| Schema                        | Hash                                                                 |
| ----------------------------- | -------------------------------------------------------------------- |
| `vellum.social.github.v1`     | `0x25980dec7f198c7b228a621c61b911b8a20c55b340f398e495c4be65aa399f3c` |
| `vellum.social.discord.v1`    | `0x1d0169167b6c34b7818ba6932974679f8fd5284e4d5d79319da12f7d79df8b69` |
| `vellum.community.discord.v1` | `0x3cba5b1c2967fee27bbde52d5e609137aa0d2cccaf68e1d8722e9b943e78f550` |

The service scans every live Claim Cell for the subject before applying the trust policy. It does
not ask the SDK to hide other issuers or schemas, so present but rejected evidence remains visible.

Selection is deterministic:

1. Identical claim IDs count once. Every duplicate Cell is reported as `duplicate-claim`.
2. For one provider user ID, the greatest `issued_at` wins. Equal timestamps use the
   lexicographically smaller claim ID.
3. Only one account per provider is accepted, and GitHub and Discord cannot stack tenure or recency.
4. Discord community evidence requires the accepted Discord identity claim for the same user ID.
5. Only the newest active community claim per Discord user contributes.

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
evidence, excluded evidence, and `policyVersion: "vellum.reputation.v2"`. Discord community evidence
also includes the matching identity Claim reference, configured community names, join timestamps,
and recognized roles. An incomplete chain read returns HTTP `503`, `status: "unavailable"`, and no
score fields.

## Interpretation

A social identity claim proves that the Vellum issuer verified control of that account at a stated
time. A Discord community claim additionally records current membership facts returned for the
configured CKB servers. Neither proves uniqueness, technical skill, or a contribution. Consumers
should inspect the evidence and choose thresholds appropriate to their own use; governance
eligibility is not defined by this policy.

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
