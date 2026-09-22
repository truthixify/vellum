# Verification service

The dashboard deployment includes an API that turns platform verification results into Claim Cell
transactions. Platform adapters verify the external proof and return a schema-bound JSON payload.
The service then uses `@vellum/sdk` to build the Claim Cell transaction, signs it with the current
issuer DID controller, and submits it to CKB Testnet. Redis-backed coordination prevents challenge
replay, repeated subsidized issuance, and concurrent use of the issuer's funding Cell. There is no
detached claim signature.

GitHub and Discord use OAuth-specific routes because authorization codes must never pass through
the generic proof endpoint. Telegram and Bluesky still return a typed `501` response until their
verification adapters are implemented.

## Endpoints

`GET /api/issuer` returns the public issuer DID, secp256k1 controller public key and lock, Claim Type
deployment, payer, and submission mode. Consumers can resolve the DID on CKB Testnet and compare its
live controller lock with this metadata.

`POST /api/verify/github/challenge` accepts a selected `did:ckb` subject:

```json
{
  "version": "1",
  "subject": {
    "did": "did:ckb:fn7u37m7vwerr4ojysgdwwp4mescjtrp"
  }
}
```

The response contains a five-minute, domain-separated message and signed challenge. The dashboard
asks the connected wallet to sign that exact message, then sends the challenge and CCC signature to
`POST /api/verify/github/start`. The server verifies the signature, resolves the selected DID again,
and requires the signer-derived CKB lock to equal its live controller lock. A challenge can be used
only once.

A successful start response contains a GitHub authorization URL and sets an `HttpOnly`,
`SameSite=Lax` cookie that binds the subject to a random state value for five minutes. The API uses
S256 PKCE for the authorization-code exchange. Before exchanging the returned code, the callback
resolves the DID once more and requires its controller lock to match the hash bound into the signed
OAuth state.

GitHub returns to `GET /api/verify/github/callback`. The callback validates the state, clears its
cookie, exchanges the one-time authorization code, and reads the authenticated account without
requesting an OAuth scope. It also checks the account's public merged pull requests and formal
reviews against the versioned CKB repository registry. A token carrying any non-empty scope is
rejected. The callback revokes the OAuth credential before invoking claim issuance. A successful
callback redirects to `/verify/github` with only the public subject DID, transaction hash, Claim
ID, output index, and GitHub login. OAuth codes and tokens are never returned to the browser or
stored in a claim.

The claim uses schema `vellum.social.github.v1` with hash
`0x25980dec7f198c7b228a621c61b911b8a20c55b340f398e495c4be65aa399f3c` and the exact payload:

```json
{
  "user_id": 5830913,
  "login": "example",
  "profile_url": "https://github.com/example",
  "account_created_at": 1650000000,
  "verified_at": 1800000000
}
```

When qualifying work is found, the same transaction also issues
`vellum.contribution.github.v1` with hash
`0xa08a1f034af0f1ebc75a6847dde6a90ee0c3dde63f3ffe4eaed248ea9e7730a1`. The claim records the
verified account's eligible merged pull requests and substantive reviews from the preceding 365
days, using stable GitHub repository and artifact IDs. It expires after 30 days. The identity and
contribution Claim Cells are signed and broadcast atomically; an account with no qualifying
artifacts receives only the identity claim. The repository policy and score weights are documented
in [`reputation-scoring.md`](./reputation-scoring.md).

Discord uses the same `challenge` and signed `start` sequence under `/api/verify/discord`. The OAuth
request uses only `identify` and `guilds.members.read`. Discord returns to
`GET /api/verify/discord/callback`, where the service validates the state, exchanges the code, reads
the stable account identity, and checks membership only in explicitly configured CKB Discord
servers. The credential is revoked before claim issuance.

Every successful Discord verification issues `vellum.social.discord.v1`. When at least one
configured server membership is found, the same transaction also issues
`vellum.community.discord.v1`, including the configured community label, Discord join timestamp,
and any configured roles held by the member. The community claim expires after 30 days. Both Claim
Cells are signed and broadcast atomically in one CKB transaction.

Standard Discord web OAuth does not expose a member's channel-reading history or message activity.
The service therefore proves recognized server membership and age, not participation in unrelated
servers or private channels.

`POST /api/verify/:platform` is the common boundary for non-OAuth adapters and accepts at most 16
KiB of `application/json`:

```json
{
  "version": "1",
  "platform": "telegram",
  "subject": {
    "did": "did:ckb:fn7u37m7vwerr4ojysgdwwp4mescjtrp"
  },
  "proof": {}
}
```

`subject` may instead contain a complete CKB `lock` object with `codeHash`, `hashType`, and `args`.
The path and body platform must match. Unknown fields, malformed CKB values, non-JSON proof values,
and invalid timestamps are rejected before verification or issuance. Direct GitHub and Discord
requests are rejected and must use their OAuth start routes.

Errors always use the same envelope:

```json
{
  "ok": false,
  "version": "1",
  "error": {
    "code": "oauth_configuration_error",
    "message": "GitHub verification is not configured. Try again later."
  }
}
```

Callback failures redirect to the relevant verification page with `status=error&code=...`.
Rate-limit responses also include a public `retryAt` Unix timestamp so the dashboard can show when
another attempt is useful.

## Configuration

The Vercel dashboard project needs these environment variables:

- `VELLUM_ISSUER_PRIVATE_KEY`: the current issuer controller credential. It must be stored as an
  encrypted server-side variable and must never use a `VITE_` prefix.
- `CKB_RPC_URL`: optional CKB Testnet RPC endpoint. It defaults to `https://testnet.ckbapp.dev`.
- `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`: credentials for a dedicated GitHub OAuth app.
- `GITHUB_OAUTH_CALLBACK_URL`: the exact callback URL ending in
  `/api/verify/github/callback`. HTTPS is required outside loopback development.
- `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET`: credentials for a dedicated Discord application.
- `DISCORD_OAUTH_CALLBACK_URL`: the exact callback URL ending in
  `/api/verify/discord/callback`. HTTPS is required outside loopback development.
- `DISCORD_TRUSTED_COMMUNITIES`: a non-empty JSON array of recognized CKB servers and optional
  roles. Each entry has `guildId`, `name`, and a `roles` array containing `roleId` and `name`. The
  verifier stays unavailable when this allowlist is missing or empty so configuration mistakes do
  not appear as an absence of community history.
- `VELLUM_OAUTH_STATE_SECRET`: a random server-side secret of at least 32 bytes used to authenticate
  short-lived wallet challenges and OAuth state cookies, and to derive GitHub's PKCE verifier.
- `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`: server-side credentials from an Upstash
  Redis integration. They are required in deployed environments for challenge replay protection,
  weekly account and DID cooldowns, and the issuer transaction lease.

For example:

```json
[
  {
    "guildId": "657799690070523914",
    "name": "Nervos Network",
    "roles": []
  }
]
```

Discord requires the production redirect URL to be registered in the application's OAuth settings.
No bot token is used by this flow.

The repository's `.env.example` intentionally leaves the credential blank. Local credentials belong
in an ignored `.env.local` file. The service refuses issuance when the credential is absent,
malformed, or does not derive the controller public key, address, lock, and lock hash published by
`GET /api/issuer`. Errors returned to clients never include configuration values or underlying
credential errors.

The issuer pays Claim Cell capacity and transaction fees, and the service submits the transaction.
Platform adapters must complete proof verification and credential cleanup before calling the
issuer. One provider account and one subject DID can each receive at most one subsidized claim set
per provider every seven days. Tests replace the issuer adapter and never broadcast transactions.

## Controller rotation

1. Create and securely retain the replacement controller credential, then fund its CKB Testnet lock.
2. Rotate the issuer DID to that lock with a reviewed, wallet-signed transaction.
3. Update the public controller metadata and the encrypted `VELLUM_ISSUER_PRIVATE_KEY` together.
4. Run the complete check suite and deploy a new dashboard version.
5. Confirm `/api/issuer` matches the live DID state before enabling successful platform adapters.
6. Revoke the old deployment secret after the new deployment is healthy.

The issuance path fails closed when public metadata and the configured credential differ, which
prevents an outdated deployment from issuing after a rotation.

## Local verification

Run focused tests and the complete workspace gate with:

```bash
bun run --cwd apps/dashboard test
bun run check
```

Use `vercel dev` from `apps/dashboard` when exercising both Vite routes and `/api` functions in one
local deployment.
