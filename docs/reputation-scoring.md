# Reputation scoring

Vellum computes reputation from live, validated Claim Cells. The score is a reproducible view of
public evidence, not a second reputation record: the service keeps no reputation database and does
not issue a score claim. Given the same accepted claims, policy version, and evaluation time, the
result is identical.

The active policy is `vellum.reputation.v1`. It runs on CKB Testnet and currently understands the
GitHub account schema. Later schemas must arrive through a new reviewed policy version rather than
changing the meaning of this one.

## Score model

The score is an integer from 0 to 1000. Category caps are fixed and missing evidence remains zero;
the result is never normalized around the categories a subject happens to have.

| Category     |  Maximum | Evidence scored in v1    |
| ------------ | -------: | ------------------------ |
| Technical    |      300 | None                     |
| Contribution |      300 | None                     |
| Community    |      200 | None                     |
| Tenure       |      100 | Verified GitHub account  |
| Recency      |      100 | GitHub verification time |
| **Overall**  | **1000** | Sum of category scores   |

GitHub account ownership does not award technical, contribution, or community points. Those
categories stay at zero until a future policy names a schema whose evidence actually supports the
category.

### GitHub tenure

Account age is measured from `account_created_at` to the explicit evaluation time.

| Account age        | Points |
| ------------------ | -----: |
| Less than 30 days  |      0 |
| At least 30 days   |     20 |
| At least 180 days  |     40 |
| At least 365 days  |     60 |
| At least 730 days  |     80 |
| At least 1460 days |    100 |

The contribution is identified by rule `github-account-tenure.v1`.

### GitHub recency

Verification age is measured from `verified_at` to the explicit evaluation time. An exact boundary
enters the next lower band.

| Verification age          | Points |
| ------------------------- | -----: |
| Less than 30 days         |    100 |
| 30 to less than 90 days   |     75 |
| 90 to less than 180 days  |     50 |
| 180 to less than 365 days |     25 |
| At least 365 days         |      0 |

The contribution is identified by rule `github-verification-recency.v1`.

## Trust and evidence selection

Policy v1 accepts one source:

- issuer: `did:ckb:hlvxrdt3e7iwvuxdmbvejp6hc4yoo3no`;
- schema: `vellum.social.github.v1`;
- schema hash: `0x25980dec7f198c7b228a621c61b911b8a20c55b340f398e495c4be65aa399f3c`.

The service scans all live Claim Cells for the subject before applying that trust policy. It does
not ask the SDK to hide other issuers or schemas. This lets the result report evidence that was
present but excluded.

Selection is deterministic:

1. Identical claim IDs count once. Every duplicate Cell is reported as `duplicate-claim`.
2. Among otherwise eligible claims for one GitHub user ID, the greatest `issued_at` wins. Equal
   timestamps use the lexicographically smaller claim ID.
3. If a subject has claims for multiple GitHub user IDs, only the newest remaining account claim
   contributes. The others are reported as `additional-account` and cannot stack points.

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

An available response has HTTP status `200`:

```json
{
  "ok": true,
  "version": "1",
  "network": "ckb_testnet",
  "subject": "did:ckb:4kiidiczwthgxj7dltzkzopgbwu3v6jc",
  "status": "available",
  "policyVersion": "vellum.reputation.v1",
  "evaluatedAt": 1800000000,
  "overall": { "score": 200, "maximum": 1000 },
  "categories": [
    { "id": "technical", "score": 0, "maximum": 300 },
    { "id": "contribution", "score": 0, "maximum": 300 },
    { "id": "community", "score": 0, "maximum": 200 },
    { "id": "tenure", "score": 100, "maximum": 100 },
    { "id": "recency", "score": 100, "maximum": 100 }
  ],
  "evidence": [
    {
      "claim": {
        "claimId": "0x1111111111111111111111111111111111111111111111111111111111111111",
        "transactionHash": "0x2222222222222222222222222222222222222222222222222222222222222222",
        "outputIndex": 0
      },
      "issuerDid": "did:ckb:hlvxrdt3e7iwvuxdmbvejp6hc4yoo3no",
      "schemaId": "vellum.social.github.v1",
      "schemaHash": "0x25980dec7f198c7b228a621c61b911b8a20c55b340f398e495c4be65aa399f3c",
      "issuedAt": 1799500000,
      "account": {
        "platform": "github",
        "id": 5830913,
        "handle": "example",
        "profileUrl": "https://github.com/example",
        "createdAt": 1600000000,
        "verifiedAt": 1799500000
      },
      "contributions": [
        { "category": "tenure", "points": 100, "ruleId": "github-account-tenure.v1" },
        { "category": "recency", "points": 100, "ruleId": "github-verification-recency.v1" }
      ]
    }
  ],
  "excludedEvidence": []
}
```

Each real `evidence` entry includes the Claim ID, transaction hash, output index, issuer, schema,
public account fields, and the exact rule contributions. An incomplete chain read returns HTTP
status `503`, `status: "unavailable"`, and no score fields.

## Interpretation

A GitHub claim proves that the Vellum issuer verified control of that account at a stated time.
Account age makes casual account farming more expensive, but it is not proof that one account maps
to one person. Consumers should inspect the evidence and choose thresholds appropriate to their own
use; governance eligibility is not defined by this policy.

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
