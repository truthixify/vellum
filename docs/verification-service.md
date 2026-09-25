# Verification service

The dashboard deployment includes an API that turns platform verification results into Claim Cell
transactions. Platform adapters verify the external proof and return a schema-bound JSON payload.
The service then uses `@usevellum/sdk` to build the Claim Cell transaction, signs it with the current
issuer DID controller, and submits it to CKB Testnet. Redis-backed coordination prevents challenge
replay, repeated subsidized issuance, and concurrent use of the issuer's funding Cell. There is no
detached claim signature.

GitHub, Discord, and Telegram use OAuth-specific routes because authorization codes must never pass
through the generic proof endpoint. Bluesky uses a dedicated wallet-bound submission route because
its MVP verifies a handle with a user-created app password.

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

Telegram uses the same wallet challenge and signed start sequence under
`/api/verify/telegram`. The authorization request uses Telegram OpenID Connect with the `openid`
and `profile` scopes, Authorization Code flow, and S256 PKCE. Telegram returns to
`GET /api/verify/telegram/callback`, where the service validates the one-time subject-bound state,
exchanges the code server-side, and verifies the ID token against Telegram's published signing
keys, issuer, audience, timestamps, and supported signing algorithms.

Every successful Telegram verification issues `vellum.social.telegram.v1`. The claim contains the
stable Telegram user ID, display name, verification time, and the public username and profile URL
when the account has one. The access credential is never returned to the browser or stored.

The service also checks the account against each explicitly configured Nervos group or channel by
calling the Telegram Bot API. It first confirms that the configured Vellum bot is an administrator
in that chat; without that guarantee, membership verification fails closed. When at least one
current membership is found, the same transaction issues `vellum.community.telegram.v1` with the
configured community label, chat type, and the member's current role. The community claim expires
after 30 days. Telegram does not expose a member join timestamp through this API, so the claim and
score do not imply membership age.

Bluesky exposes `GET /api/verify/bluesky/start` for the public form contract,
`POST /api/verify/bluesky/challenge` for the five-minute wallet challenge, and
`POST /api/verify/bluesky/submit` for the signed proof, handle, and dedicated app password. The
server authenticates against Bluesky, resolves the current handle independently, and requires both
results to name the same stable AT Protocol DID. It closes the temporary provider session before
claim issuance and never returns, logs, or records the app password or session tokens. The app
password itself remains valid at Bluesky until the user revokes it.

Successful verification issues `vellum.social.bluesky.v1` with hash
`0x60bfe9263501d3d17513463b9a3163793690dcf2b614ecc17d7dd52688a083f6` and the exact payload shape:

```json
{
  "did": "did:plc:ewvi7nxzyoun6zhxrhs64oiz",
  "handle": "example.bsky.social",
  "profile_url": "https://bsky.app/profile/did:plc:ewvi7nxzyoun6zhxrhs64oiz",
  "verified_at": 1800000000
}
```

The stable DID, rather than the mutable handle, identifies a Bluesky account across verification
runs. The claim makes no assertion about account creation time, followers, posts, or community
membership.

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
and invalid timestamps are rejected before verification or issuance. Direct GitHub, Discord,
Telegram, and Bluesky requests are rejected in favor of their dedicated routes.

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

OAuth callback failures redirect to the relevant verification page with `status=error&code=...`.
Bluesky submission failures return the same safe error envelope directly. Rate-limit responses also
include a public `retryAt` Unix timestamp so the dashboard can show when another attempt is useful.

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
- `TELEGRAM_CLIENT_ID` and `TELEGRAM_CLIENT_SECRET`: OpenID Connect credentials shown by BotFather
  for the Vellum bot's Login Widget configuration.
- `TELEGRAM_BOT_TOKEN`: the Vellum bot token used only by the server to query configured chat
  membership. The bot must be an administrator in every configured chat.
- `TELEGRAM_OAUTH_CALLBACK_URL`: the exact callback URL ending in
  `/api/verify/telegram/callback`. HTTPS is required outside loopback development and the URL must
  be registered with BotFather.
- `TELEGRAM_TRUSTED_COMMUNITIES`: a non-empty JSON array of recognized Nervos chats. Each entry has
  a negative numeric `chatId`, a public `name`, and `type` set to `channel`, `group`, or
  `supergroup`. Missing, empty, duplicate, or malformed configuration keeps verification
  unavailable.
- `VELLUM_OAUTH_STATE_SECRET`: a random server-side secret of at least 32 bytes used to authenticate
  short-lived wallet challenges and OAuth state cookies, and to derive GitHub and Telegram PKCE
  verifiers. Bluesky reuses it for its wallet-bound challenge and needs no provider application
  secret.
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

For Telegram, a trusted-chat allowlist looks like:

```json
[
  {
    "chatId": "-1001234567890",
    "name": "Nervos Network",
    "type": "supergroup"
  }
]
```

Replace the example ID with the chat's exact Bot API ID. Register the production callback URL in
BotFather and add the same Vellum bot as an administrator in every listed chat before enabling the
flow.

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
