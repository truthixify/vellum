# Vellum

A reference dashboard for [`did:ckb`](https://github.com/web5fans/web5-wips/blob/master/01.md), the Decentralized Identifier method that lives on the Nervos CKB blockchain.

Claim a DID, write a profile to it, rotate the keys that control it, look up any DID on the network, migrate an existing `did:plc` identity onto CKB, and deactivate when you're done.

The SDK now lives in the `@ckb-ccc/identity` package on a fork of [ckb-devrel/ccc](https://github.com/ckb-devrel/ccc), and the dashboard consumes it as a regular dependency. Source for the package: [`truthixify/ccc` `feat/identity-package` branch](https://github.com/truthixify/ccc/tree/feat/identity-package/packages/identity). Releases are published as GitHub Release assets on the fork; the dashboard pins one of those tarball URLs in its `package.json`.

## Status

| Surface | State |
|---|---|
| `/` landing page | live |
| `/claim` create flow | live, end-to-end on testnet and mainnet |
| `/my` dashboard | live, with reverse-lookup, document body, lock script card, full operation history |
| `/edit` document editor | live, every field editable, real on-chain update |
| `/resolve` public lookup | live, resolves any `did:ckb` |
| `/deactivate` burn flow | live, with 24h UI cool-down per DID |
| `/docs/*` | live |
| `/migrate` did:plc migration | preview only; SDK + UI scaffolding in progress |
| Lock-script rotation | SDK supports it via `buildUpdateTx({ newLock })`; UI lands in a follow-up |

## Stack

- TanStack Router (file-based routing, SPA mode, no SSR)
- React 19, Vite 7, Tailwind v4 (CSS-first config)
- shadcn/ui primitives + Vellum-specific components (`Manifest`, `IdTab`, `Brackets`, `Avatar`, `VButton`, `WalletButton`)
- `@ckb-ccc/connector-react` for wallet integration (UTXO Global, JoyID, MetaMask CKB, etc.)
- `@ckb-ccc/core` for transactions, signers, the CKB client, molecule codecs, and the type-id hash
- `@ipld/dag-cbor` for the on-chain document encoding

The deployed `did-ckb` Type Script:

| Network | code_hash | tx_hash |
|---|---|---|
| Mainnet | `0x4a06164dc34dccade5afe3e847a97b6db743e79f5477fa3295acf02849c5984a` | `0xe2f74c56cdc610d2b9fe898a96a80118845f5278605d7f9ad535dad69ae015bf` |
| Testnet | `0x510150477b10d6ab551a509b71265f3164e9fd4137fcb5a4322f49f03092c7c5` | `0x0e7a830e2d5ebd05cd45a55f93f94559edea0ef1237b7233f49f7facfb3d6a6c` |

Both `hash_type: type`, `index: 0x0`, `dep_type: code`. Source of truth is the upstream [`web5fans/did-ckb`](https://github.com/web5fans/did-ckb) README.

## Develop

```bash
cd dashboard
bun install
bun run dev
```

Vite serves on `http://localhost:8080`. Hot module replacement is on by default.

```bash
bun run build          # production build, output in dashboard/dist
bun run preview        # serve the production build locally
bun run lint           # eslint
bun run format         # prettier
bunx tsc --noEmit      # type-check the whole project
```

The dashboard defaults to **CKB testnet** so you can experiment without spending mainnet CKB. The wallet dropdown lets the holder switch to mainnet at any time.

## Deploy

The project deploys cleanly as a Vercel Static Site.

- **Root directory:** `dashboard`
- **Build command:** `bun install && bun run build`
- **Output directory:** `dist`
- **Framework preset:** Vite (or "Other"; Vercel picks up `package.json` either way)

`dashboard/vercel.json` already contains the SPA rewrite (everything that doesn't match a real file is routed to `/index.html` so the client router can handle the path).

## Project layout

```
.
├── design.md                 the brand + design system brief
├── README.md                 you are here
├── dashboard/                the SPA
│   ├── src/
│   │   ├── components/
│   │   │   ├── ui/           shadcn/ui primitives (copied in, not imported)
│   │   │   └── vellum/       Vellum-specific components (Manifest, Avatar, VButton, WalletButton)
│   │   ├── hooks/            useCopy, useDocumentTitle
│   │   ├── lib/
│   │   │   ├── ccc-provider.tsx
│   │   │   ├── utils.ts
│   │   │   └── validation.ts
│   │   │   # the did:ckb SDK lives upstream in @ckb-ccc/identity; see
│   │   │   # https://github.com/truthixify/ccc/tree/feat/identity-package/packages/identity
│   │   ├── routes/           TanStack Router file routes
│   │   └── main.tsx          SPA entry, router + CCC provider
│   ├── public/               static assets (favicon, og image, robots.txt)
│   ├── vite.config.ts        vanilla Vite + TanStack Router + Tailwind
│   ├── vercel.json           SPA fallback for Vercel
│   └── package.json
└── tmp/                      research clones (did-ckb, web5-wips), gitignored
```

## SDK conventions

The `did-ckb` module exports a small public surface anyone can build against. Key entry points:

```ts
import {
  // Constants
  DID_CKB_MAINNET, DID_CKB_TESTNET, deploymentForClient,

  // Identifier
  computeDidArgs, argsToDid, didToArgs, isDidCkb,

  // Document
  buildDocument, encodeDocument, decodeDocument, extractProfile,
  defaultAvatarUrl, isDefaultAvatar,
  PROFILE_SERVICE_KEY, PROFILE_SERVICE_TYPE,

  // Transactions (need a Signer)
  buildCreateTx, buildUpdateTx, buildDeactivateTx,

  // Resolver (read-only, needs a Client)
  findDidCell, resolveDid, listDidsByLock, getDidHistory,
} from "@/lib/did-ckb";
```

### The profile convention

DID Documents follow the `did:plc`-compatible shape from WIP-01: `verificationMethods`, `alsoKnownAs`, `services`. Vellum carries the human-friendly profile inline under `services.profile`:

```json
{
  "verificationMethods": { "atproto": "did:key:..." },
  "alsoKnownAs": ["at://alice.test"],
  "services": {
    "profile": {
      "type": "VellumProfile",
      "endpoint": "inline",
      "displayName": "Margot Weil",
      "avatar": "https://api.dicebear.com/9.x/pixel-art/png?seed=did:ckb:...",
      "bio": "Conservation lab tech."
    }
  }
}
```

When the holder doesn't provide an avatar, the SDK fills in a DiceBear pixel-art URL seeded on the DID itself. Stored verbatim in the on-chain document so any resolver (Vellum or otherwise) picks it up.

### Capacity model

A DID Metadata Cell on chain holds, at minimum, the storage rent for its contents: lock script + type script + cell framing + data. The SDK computes this exactly and adds a **200 CKB reserve** so the holder can grow the document on a future update without re-funding the cell. The exact figure depends on profile size; expect 300 to 600 CKB total. Recoverable on deactivation.

## License

MIT.
