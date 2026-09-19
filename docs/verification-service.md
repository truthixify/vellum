# Verification service

The dashboard deployment includes a stateless API that turns platform verification results into
Claim Cell transactions. Platform adapters verify the external proof and return a schema-bound JSON
payload. The service then uses `@vellum/sdk` to build the Claim Cell transaction, signs it with the
current issuer DID controller, and submits it to CKB Testnet. There is no detached claim signature.

GitHub uses an OAuth-specific route because an authorization code must never pass through the
generic proof endpoint. Discord, Telegram, and Bluesky still return a typed `501` response until
their verification adapters are implemented.

## Endpoints

`GET /api/issuer` returns the public issuer DID, secp256k1 controller public key and lock, Claim Type
deployment, payer, and submission mode. Consumers can resolve the DID on CKB Testnet and compare its
live controller lock with this metadata.

`POST /api/verify/github/start` accepts a selected `did:ckb` subject:

```json
{
  "version": "1",
  "subject": {
    "did": "did:ckb:fn7u37m7vwerr4ojysgdwwp4mescjtrp"
  }
}
```

The response contains a GitHub authorization URL. It also sets an `HttpOnly`, `SameSite=Lax`
cookie that binds the subject to a random state value for five minutes. The dashboard only offers
Testnet identities indexed under the connected wallet. The API validates the selected DID and the
state binding, but does not introduce a separate wallet-signature challenge.

GitHub returns to `GET /api/verify/github/callback`. The callback validates the state, clears its
cookie, exchanges the one-time authorization code, reads the authenticated account with the
`read:user` scope, and revokes the OAuth credential before invoking claim issuance. A successful
callback redirects to `/verify/github` with only the public subject DID, transaction hash, Claim ID,
output index, and GitHub login. OAuth codes and tokens are never returned to the browser or stored
in the claim.

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

`POST /api/verify/:platform` is the common boundary for non-OAuth adapters and accepts at most 16
KiB of `application/json`:

```json
{
  "version": "1",
  "platform": "discord",
  "subject": {
    "did": "did:ckb:fn7u37m7vwerr4ojysgdwwp4mescjtrp"
  },
  "proof": {}
}
```

`subject` may instead contain a complete CKB `lock` object with `codeHash`, `hashType`, and `args`.
The path and body platform must match. Unknown fields, malformed CKB values, non-JSON proof values,
and invalid timestamps are rejected before verification or issuance. Direct GitHub requests are
rejected and must use the OAuth start route.

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

Callback failures redirect to `/verify/github?status=error&code=...`. Rate-limit responses also
include a public `retryAt` Unix timestamp so the dashboard can show when another attempt is useful.

## Configuration

The Vercel dashboard project needs these environment variables:

- `VELLUM_ISSUER_PRIVATE_KEY`: the current issuer controller credential. It must be stored as an
  encrypted server-side variable and must never use a `VITE_` prefix.
- `CKB_RPC_URL`: optional CKB Testnet RPC endpoint. It defaults to `https://testnet.ckbapp.dev`.
- `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`: credentials for a dedicated GitHub OAuth app.
- `GITHUB_OAUTH_CALLBACK_URL`: the exact callback URL ending in
  `/api/verify/github/callback`. HTTPS is required outside loopback development.
- `VELLUM_OAUTH_STATE_SECRET`: a random server-side secret of at least 32 bytes used to authenticate
  the short-lived OAuth state cookie.

The repository's `.env.example` intentionally leaves the credential blank. Local credentials belong
in an ignored `.env.local` file. The service refuses issuance when the credential is absent,
malformed, or does not derive the controller public key, address, lock, and lock hash published by
`GET /api/issuer`. Errors returned to clients never include configuration values or underlying
credential errors.

The issuer pays Claim Cell capacity and transaction fees, and the service submits the transaction.
Platform adapters must complete proof verification and credential cleanup before calling the
issuer. Tests replace the issuer adapter and never broadcast transactions.

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
