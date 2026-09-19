# Verification service

The dashboard deployment includes a stateless API that turns platform verification results into
Claim Cell transactions. Platform adapters verify the external proof and return a schema-bound JSON
payload. The service then uses `@vellum/sdk` to build the Claim Cell transaction, signs it with the
current issuer DID controller, and submits it to CKB Testnet. There is no detached claim signature.

The initial service exposes the common contract and dispatch boundary. GitHub, Discord, Telegram,
and Bluesky return a typed `501` response until their verification adapters are implemented.

## Endpoints

`GET /api/issuer` returns the public issuer DID, secp256k1 controller public key and lock, Claim Type
deployment, payer, and submission mode. Consumers can resolve the DID on CKB Testnet and compare its
live controller lock with this metadata.

`POST /api/verify/:platform` accepts at most 16 KiB of `application/json`:

```json
{
  "version": "1",
  "platform": "github",
  "subject": {
    "did": "did:ckb:fn7u37m7vwerr4ojysgdwwp4mescjtrp"
  },
  "proof": {}
}
```

`subject` may instead contain a complete CKB `lock` object with `codeHash`, `hashType`, and `args`.
The path and body platform must match. Unknown fields, malformed CKB values, non-JSON proof values,
and invalid timestamps are rejected before verification or issuance.

A successful platform adapter returns a schema identity, canonical JSON payload, and explicit
issuance time. The service response binds that typed claim to the subject and includes the submitted
transaction hash, Claim ID, and output index:

```json
{
  "ok": true,
  "version": "1",
  "platform": "github",
  "subject": { "did": "did:ckb:fn7u37m7vwerr4ojysgdwwp4mescjtrp" },
  "claim": {
    "schema": {
      "id": "vellum.social.github.v1",
      "hash": "0x0000000000000000000000000000000000000000000000000000000000000000"
    },
    "payload": { "login": "example" },
    "issuedAt": 1700000000
  },
  "issuance": {
    "status": "submitted",
    "network": "ckb_testnet",
    "payer": "issuer",
    "transactionHash": "0x0000000000000000000000000000000000000000000000000000000000000000",
    "claimId": "0x0000000000000000000000000000000000000000000000000000000000000000",
    "outputIndex": 0
  }
}
```

Errors always use the same envelope:

```json
{
  "ok": false,
  "version": "1",
  "error": {
    "code": "not_implemented",
    "message": "github verification is not available yet."
  }
}
```

## Configuration

The Vercel dashboard project needs these environment variables:

- `VELLUM_ISSUER_PRIVATE_KEY`: the current issuer controller credential. It must be stored as an
  encrypted server-side variable and must never use a `VITE_` prefix.
- `CKB_RPC_URL`: optional CKB Testnet RPC endpoint. It defaults to `https://testnet.ckbapp.dev`.

The repository's `.env.example` intentionally leaves the credential blank. Local credentials belong
in an ignored `.env.local` file. The service refuses issuance when the credential is absent,
malformed, or does not derive the controller public key, address, lock, and lock hash published by
`GET /api/issuer`. Errors returned to clients never include configuration values or underlying
credential errors.

The issuer pays Claim Cell capacity and transaction fees, and the service submits the transaction.
Platform adapters must complete proof verification before calling the issuer. Tests replace the
issuer adapter and never broadcast transactions.

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
