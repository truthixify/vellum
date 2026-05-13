# Vellum: Design System Brief

A reference dashboard for `did:ckb`, the Decentralized Identifier method on the Nervos CKB blockchain. Light mode only. Build the surfaces listed in §8 using the visual system in §2 to §7.

---

## 0. What Vellum is

Vellum lets a person claim a DID, write a profile to it, rotate the keys that control it, look up any DID on the network, migrate an existing `did:plc` identity onto CKB, and deactivate when they're done. It is the canonical home for managing a did:ckb identity.

One persona: **the holder**. Tech-comfortable, owns a CKB wallet, wants a portable on-chain identity.

Facts that color every design call:

- Creating a DID costs roughly 600 CKB of locked capacity. Recoverable on deactivation. The UI must be honest about this and frame it as storage rent for a piece of state the user owns.
- The DID is not the wallet. The Lock Script (key material) can be rotated without changing the DID. The UI must never let the user conflate the two.
- DIDs are slow. Operations are CKB transactions, seconds to a minute to confirm. The UI does meaningful work during the pending window (preview, stamp animations). No spinners.
- Profile data is small. Display name, avatar, short bio, a few handles, a few services. Fits in one Cell.
- The DID document is the only source of truth. What Vellum shows is rendered from the on-chain Cell.

---

## 1. Brand

**Name:** Vellum.
**Tagline:** *Your identity, on paper that lasts.*

Vellum is the material historic identity documents were written on. Permanent, expensive, single-owner. That metaphor drives everything: a DID Cell is a ledger page, not an app card.

**Tone:** quiet, precise, considered. The voice of a public records clerk who takes the job seriously. Not crypto-bro, not enterprise-stiff, not cute. No exclamation marks, no emoji, no "let's go." When the user does something irreversible, the copy gets heavier and slower, not louder.

---

## 2. Visual direction

**The aesthetic in one phrase: a private ledger, kept carefully.**

Think old library catalogue cards, embossed letterhead, vellum charters, the back of a passport, conservation lab tags. Crisp, owned, slow to change, with enough warmth that it doesn't feel like a tax form.

### Five rules

1. **Light mode primary.** Cream/paper background. No dark mode.
2. **Squared corners only.** `border-radius: 0` on everything. Circles are fine (status dots, monogram bullets) because a circle is not a rounded rectangle.
3. **Layered borders.** Primary cards have an outer 2px ink border, a 6 to 8px paper inset, a 0.5px hairline, then internal hairline rules. This is the ledger-page pattern.
4. **Type-as-decoration.** Mono caps stamps, page footers, document numbers, registration brackets, ID labels. Every primary card has a form-footer mono caps line at the bottom.
5. **One brand accent, three quiet state signals.** Verdant is the brand. Amber means pending. Cobalt is a secondary accent for resolution and migration. Alarm is contested/failed. Color is information, never decoration.

**Not doing:** glassmorphism, neon-on-black, gradients, drop shadows on cards, rounded corners, 3D blobs, isometric illustrations, crypto coins, emoji in product surfaces, blockchain iconography cliches (chains, blocks, sparkle stars, robot heads), avatar photos (default avatar is a monogram in a square), serif type, script type.

---

## 3. Color system

| Token | Hex | Role |
|---|---|---|
| `paper` | `#FBF8EE` | Primary background, surface fills |
| `ink` | `#0E0E0C` | Primary type, all borders, dark fills |
| `verdant` | `#1A6E4A` | Brand accent, primary CTA fill, `ACTIVE` state, registration brackets that frame critical values |
| `cobalt` | `#1F3DCB` | Secondary accent. Body links. `MIGRATING` state (the 72-hour did:plc window). Resolver color. |
| `amber` | `#D08A1A` | `PENDING` state. Transactions in flight, drafts not yet submitted. |
| `alarm` | `#C53B2E` | `CONTESTED` and `FAILED` states. Destructive-action confirmations. |
| `muted` | `#6F6A5C` | Secondary text, mono labels, form-footer lines, `DEACTIVATED` state. |
| `hairline` | `#E6DFC9` | Soft inner dividers. |

### Rules

- Paper is the only surface background. Sections never get colored fills except as full-bleed status bands at the top of cards.
- Ink does the structural work: type, borders, button fills, dividers.
- Verdant is the primary CTA fill, the `ACTIVE` band, and the L-bracket marks that frame critical values.
- Cobalt is for the resolver surface, body links, and the `MIGRATING` band.
- Amber/alarm/muted are state signals only. Never as body text.
- One state color per card. If a DID is contested and pending, contested wins.
- For hover/pressed tints stay within the family (verdant hover lifts ~6%, press deepens ~8%). No new hues.

---

## 4. Typography

**Sans (display + body):** pick one from Söhne, Geist, Inter Display, GT America, Aeonik, or PP Neue Montreal.
**Monospace:** Berkeley Mono, JetBrains Mono, IBM Plex Mono, or Geist Mono.
No third family. No serif. No script.

| Use | Size | Weight |
|---|---|---|
| Hero headline | 56 to 80px | 500 |
| Page title (`<h1>`) | 36 to 44px | 500 |
| Card title | 22 to 26px | 500 |
| Body | 16px | 400 |
| Small body | 14px | 400 |
| Mono label | 11px | 500, letter-spacing 1.4 |
| Mono small caps | 10px | 500, letter-spacing 1.6 |
| Mono inline (DIDs, addresses) | 13 to 14px | 500 |
| Big values (capacity, block height, the DID itself) | 48 to 80px | 500 |

Two weights only: 400 and 500. Never 600 or 700.

**Casing:** sentence case for body and titles. ALL CAPS only for mono labels, status bands, form footers, stamps (with letter-spacing 1.2 to 1.6). Never title case.

**Always mono:** DIDs, CKB addresses, tx hashes, block heights, CKB capacity inline (`614.00 CKB`), timestamps, status labels (`ACTIVE`, `PENDING`, etc.), form footers, schema field names (`verificationMethods`, `services.profile`, `alsoKnownAs`), page numbers, anything that reads as record-keeping chrome.

**Body rules:** 16px, line-height 1.6, max measure 64ch. Links are cobalt with a 1px cobalt underline that thickens to 2px on hover.

---

## 5. Layout and structure

**Grid:** 12-column. 80px gutter desktop wide, 24 to 32px tablet, 16px mobile. Max width 1100px on marketing surfaces, 1320px on app surfaces.

**Spacing scale:** 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96 / 128.

### The manifest pattern (the spine of the product)

```
[ ID tab, verdant fill, paper text, mono caps, sticks out top ]
+--------------------------------------------------------+   outer ink 2px
|  +--------------------------------------------------+  |
|  | [STATUS BAND, full-bleed colored fill]           |  |   ink 0.5px hairline
|  |--------------------------------------------------|  |
|  |  Title in display sans                           |  |
|  |  MONO METADATA SUBTITLE                          |  |
|  |--------------------------------------------------|  |
|  |  META STRIP (mono caps labels + values)          |  |
|  |--------------------------------------------------|  |
|  |  [HERO VALUE framed in verdant L-brackets] [CTA] |  |
|  |--------------------------------------------------|  |
|  | FORM FOOTER MONO CAPS              PAGE 01 / 01  |  |
|  +--------------------------------------------------+  |
+--------------------------------------------------------+
   offset block (12px right + down, ink or verdant) on the single focal card per page
```

Components:

- **Outer ink border:** 2px solid, squared.
- **Paper inset:** 6 to 8px gap before the inner hairline. The paper showing through is the second layer.
- **Inner hairline:** 0.5px ink.
- **Status band:** full-bleed colored fill at the top. State color. Mono caps text. Pulse dot for pending, stamp for active, static dot for deactivated.
- **Internal hairlines:** 0.5px ink, separating sections.
- **ID tab:** verdant rectangle, 28px above the card, paper mono caps text. Carries `VL · did:ckb:qq2m72…u4nba` or similar.
- **Offset block (the "lift"):** solid block same size as card, offset 12px right + down, behind the card. Use ink or verdant. **Only on the single focal card per page.** Never on every card in a list.
- **Verdant L-brackets:** four L-shapes at the corners (1.5px stroke, do not form a closed rectangle) framing a critical value. Registration mark.
- **Form footer:** mono caps `VELLUM · [DOCUMENT TYPE] · MIT` left, page/document ID right.

**Variations:**
- **Slim row** (multi-DID listing): outer 1px border, 4px state stripe down the left edge, no ID tab, no offset, no internal hairlines.
- **Hero/focal card**: full pattern with offset block.
- **Mini card** (toast, feed line): outer 1px, status pill, content, no form footer.

---

## 6. Components

### Buttons (all squared, 1px pressed-shift on active)

- **Primary:** ink fill, paper text. Hover: verdant fill. Disabled: muted, 0.5 opacity.
- **Verdant accent:** verdant fill, paper text. The single most important action per surface (Claim DID, Sign and Submit). One per surface.
- **Secondary:** paper fill, 1px ink border, ink text. Hover: full invert (ink fill, paper text).
- **Destructive:** alarm fill, paper text. For Deactivate, Discard Draft. Always paired with a copy-heavy confirm.
- **Ghost:** no fill, ink text with 1px ink underline. Hover: cobalt text + cobalt underline.
- **Icon-only:** 32x32 squared, ink border. Hover: ink fill, paper glyph.

### Inputs

- **Text:** paper fill, 1px ink border, ink text. Focus: 2px verdant outset. Placeholder: muted.
- **Textarea:** same, multi-line. Bio max 240 chars, mono caps label above + counter below.
- **DID input:** wider, mono font, paste affordance, inline `RESOLVE` verdant button.
- **Address input:** same treatment, inline state icon (verdant tick / amber question / alarm cross).
- **Select:** paper fill, ink border, mono chevron. Open: ink hover-row inversion.
- **File upload (avatar):** 160x160 ink-bordered drop zone, verdant L-brackets at corners, mono caps `DROP IMAGE OR CLICK`. Drag-over: verdant border, brackets thicken.
- **Toggle:** squared rectangle, not a pill. Off: paper + ink border. On: ink fill, paper indicator block.
- **Checkbox / Radio:** 16x16 squared (yes, even radios), ink border. Checked/selected: ink fill, paper inner mark.

### Cards

- **DID Manifest card** (full pattern): the canonical document card. Home surface, resolver result, migration source.
- **DID Row** (slim): used in lists. State stripe left, mono caps ID, display name, mono meta strip, small action.
- **Lock Script card:** paired with the DID Manifest. Smaller. ID tab reads `LOCK SCRIPT`, hero value is `code_hash` + args in mono.
- **Tx card:** row in tx history. Slim manifest, status stripe by outcome, mono tx hash, block height, action label, timestamp.
- **Notification card:** slim, status pill left, body, timestamp, mark-read right.
- **Empty card:** paper fill, ink border, mono caps headline, body sentence, Vellum glyph in verdant line-art centered, one primary CTA.

### Status bands (squared, mono caps, with state dot or stamp)

- `ACTIVE`: verdant fill, paper text, static dot.
- `PENDING`: amber fill, paper text, pulsing dot. While tx is unconfirmed.
- `MIGRATING`: cobalt fill, paper text, pulsing dot. During did:plc 72-hour window.
- `CONTESTED`: alarm fill, paper text, pulsing dot. Multiple live Cells for same identifier.
- `DEACTIVATED`: muted fill, paper text, no dot.
- `DRAFT`: paper fill, ink border, ink text. In editor before signing.

### Tags / pills (squared, 20px tall, 1px border, mono caps)

- `method`: paper fill, ink border. `DID:CKB`, `DID:PLC`.
- `kind`: paper fill, ink border. `VERIFICATION METHOD`, `SERVICE`, `HANDLE`.
- `curve`: paper fill, ink border. `SECP256K1`, `SECP256R1`.
- `network`: paper fill, ink border. `MAINNET`, `TESTNET`.
- `local-id`: cobalt fill, paper text. `MIGRATED FROM PLC`.
- `warning`: alarm fill, paper text. `CONTESTED`.

### Tables

Paper fill, no internal vertical lines. Header: ink fill, paper mono caps text, letter-spacing 1.6. Rows: 0.5px hairline divider, mono right-aligned for numerics, left-aligned for hashes. Hover row: paper darkens, no color change. Verdant L-brackets can frame the key cell per row.

### DID hero block (the biggest visual moment)

- Manifest pattern, full size, offset block in verdant.
- ID tab: `VL · DID:CKB`.
- Status band reflects current state.
- **Hero metric: the full DID in 56 to 72px mono, framed in verdant L-brackets.** The DID is the hero. Bigger than the display name. The point of the product is that this string is yours.
- Below: display name in 36px display sans, mono caps subtitle `CREATED · BLOCK 17,314,192 · CAPACITY 614.00 CKB`.
- Quick-stats strip: 4 columns of mono caps label + mono value. `BLOCK OF LAST UPDATE`, `OPERATIONS`, `ALSO KNOWN AS`, `SERVICES`.
- Form footer.

### Document field rows

One row per field inside the manifest body. Mono caps label left (`DISPLAY NAME`, `AVATAR`, `BIO`, `HANDLE`, `VERIFICATION METHOD`, `SERVICE`). Value in appropriate type style (display sans for name, paper-bordered square for avatar, body sans for bio, mono for handles/DIDs). Right-aligned `EDIT` ghost button. 0.5px hairline divider below.

Add-handle/add-service rows: 1px ink dashed border (the only dashed line in the system), centered `+ ADD HANDLE` mono caps. Click → inline input with verdant focus border.

### Activity feed line

Mono timestamp left (80px), status dot in event color, mono action label (`CREATE`, `UPDATE`, `ROTATE`, `MIGRATE`, `DEACTIVATE`), body line in display sans with changed field in mono, mono tx hash with `VIEW ↗` cobalt link.

`CREATE` gets a verdant row stamp. `MIGRATE` gets cobalt. `DEACTIVATE` gets muted. These are the structural moments.

### Top nav

Full-width, paper fill, ink 1px bottom border. Left: glyph + wordmark (home link). Center: nav links `RESOLVE`, `MIGRATE`, `DOCS` (mono caps ink, hover cobalt). Right: notifications bell + squared unread badge, profile dropdown (monogram + truncated name), `CONNECT WALLET` verdant button if not connected. Sticky on scroll, bottom border thickens to 2px when stuck.

### Footer

Two-tier. Top: wordmark, three columns of mono caps links (`PRODUCT`, `SPEC`, `RESOURCES`). Bottom: brand stamp, mono caps copyright, `MIT`, mono network indicator (`CKB MAINNET · CHAIN ID 0`). Paper background, ink top border 2px.

### Modals

Centered, paper fill, 2px ink border. Manifest pattern: ID tab, status band, content, form footer. Backdrop: `rgba(14,14,12,0.6)`. Close: ink × top-right. Destructive modals (Deactivate, Rotate Lock Script) have an alarm status band and require typing the full DID to confirm.

### Toasts

Bottom-right. Paper fill, 1px ink border, status dot left, body, mono timestamp right. Auto-dismiss 6s, persistent for errors. Stack with 8px gap.

### States

- **Empty:** centered Vellum glyph in verdant line-art, mono caps headline, body sentence, primary CTA.
- **Error:** centered alarm glyph, mono caps `ERROR`, body sentence with error code in mono, retry CTA.
- **Loading/pending:** cycling mono caps phrase (`WAITING FOR BLOCK…`, `INDEXING CELLS…`, `RESOLVING DID…`, `STAMPING MANIFEST…`), 1px hairline sweeping left-to-right on a 1.4s loop. **No spinners.**

---

## 7. Surfaces

### Marketing landing page

1. **Top stamp.** Brand stamp at top, mono caps version line `VELLUM · v0.1 · DID:CKB DASHBOARD · MIT`.
2. **Hero.** Editorial headline *"Your identity, on paper that lasts."* at 64 to 80px ink with one word in verdant. 2-line subhead in 22px body explaining you're claiming a Cell on CKB that holds your identity, survives wallet rotation, resolvable by anyone. CTAs: `CLAIM A DID` (verdant), `RESOLVE A DID` (paper + ink border).
3. **What you get.** Three small manifest cards: (a) permanent identifier surviving key rotation, (b) profile every app reads from one place, (c) portable handle across CKB / AT Protocol / Nostr. Each with a small verdant line-art illustration (no photography).
4. **How it works.** 5-step horizontal manifest. Numbered tabs (`01`, `02`, …), short titles, mono caps subtitles, connected by a hairline. Steps: connect wallet → write profile → sign create tx → DID is live on chain → manage from anywhere.
5. **What goes in a DID.** A single example manifest card, mocked. Shows sample DID with name, avatar, handles, services. The visitor sees what their record will look like.
6. **The cost.** A stamped panel: `Storage rent: ~600 CKB locked, recoverable on deactivation. Network fee: less than 0.01 CKB per transaction. No subscription.` Mono caps. Verdant underline on the per-tx figure.
7. **What can read it.** Three small cards: any wallet, any CKB app integrating the SDK, the generic resolver (this site's `RESOLVE` page).
8. **FAQ.** Six accordion items, paper-and-ink, no chrome: what if I lose my keys, what if I change my name, can someone else claim my DID, what happens if I deactivate, can I migrate from did:plc, why CKB and not Ethereum.
9. **CTA stamp.** Full-bleed paper, big editorial line *"Claim your name."* with both CTAs again.
10. **Footer.**

Decorative SVGs are fine here sparingly: faint 1px ink line-art folded-sheet motif behind the hero, registration-mark details at section breaks. Type and layout do most of the work.

### Connect-wallet entry

Centered single-column. One manifest card, no offset block. ID tab `VL · SESSION`. Status band ink fill, paper text: `CONNECT WALLET TO CONTINUE`. Body: stack of squared wallet-option rows (logo + name in display sans + mono caps state subtitle `AVAILABLE` / `NOT INSTALLED` / `LOCKED`). Form footer.

### Create-DID flow (4-step wizard)

Centered single column. Each step a manifest card with numbered tab (`STEP 02 OF 04`).

1. **Confirm cost.** Card explains 600 CKB capacity lock. Big verdant-bracketed value `614.00 CKB`. Itemized below: base capacity, padding for future updates, network fee. `CONTINUE`.
2. **Write the document.** Editable rows for all fields (name, avatar, bio, handles, services). Only name is required. Paired card on the right (desktop) or below (mobile) shows a live preview using the same DID hero block component the home surface will use. The user sees exactly what they're committing to.
3. **Sign and submit.** Summary manifest, amber status band `READY TO SIGN`. Click verdant `SIGN AND SUBMIT` → wallet prompts. After sign, band switches to `PENDING` with pulse dot. Card streams in tx hash and block height as they arrive.
4. **Confirmation.** Status band flips amber → verdant. DID is live. `VIEW MY DID` verdant button. `COPY DID` ghost button.

### My DID home (the hub)

Where the user lands when connected with at least one DID.

- **Top:** DID hero block (full manifest, offset block in verdant). The focal card on the page; earns the lift.
- **Two-column row on desktop:**
  - Left: document body as field rows (name, avatar, bio, handles, services). `EDIT DOCUMENT` ghost button top-right opens the editor.
  - Right: Lock Script card. Smaller manifest. ID tab `LOCK SCRIPT`. Body shows current `code_hash`, hash_type, args, `ROTATE` ghost button.
- **Below:** activity feed (vertical timeline of operations on this DID, newest top).

If multiple DIDs: small DID-switcher tab strip above the hero, verdant underline beneath active.

### Document editor

Full-page editor, centered single column, 920px wide.

- Top: slim manifest banner mirroring home hero but compressed. Shows DID, state, `CANCEL` ghost right.
- Body: editable field rows stacked. Operates as a draft until `STAGE FOR SIGNING`.
- Sticky footer bar (ink-bordered top, paper fill): left `CHANGES · 3 FIELDS MODIFIED` mono caps, right `DISCARD` ghost + `STAGE FOR SIGNING` verdant.
- After Stage: same three-step Sign → Pending → Confirm flow as create.

### Lock Script editor

Same pattern as document editor, focused on Lock Script.

- Lets the user pick from supported templates: standard secp256k1, multi-sig, omnilock variants. Each renders required args fields.
- Alarm warning band at top: `ROTATING THE LOCK SCRIPT CHANGES WHO CAN UPDATE THIS DID. IF YOU LOSE ACCESS TO THE NEW KEY, YOU LOSE CONTROL.`
- Stage → Sign → Pending → Confirm flow. Confirmation modal requires typing the full DID.

### Resolver (look up any DID)

The public face of the dashboard. Same components as the home surface but read-only.

- **Top:** wide DID input across page. Mono font, paper fill, 1px ink border, `RESOLVE` verdant button right.
- **Before resolve:** empty state with brand stamp watermarked, mono caps `PASTE A DID TO RESOLVE`.
- **After resolve:** DID hero block (read-only, no edit affordances), document fields as read-only rows, activity feed of public operations.

The resolver page proves the design system: same components, different mode. If editor and resolver feel like the same product, the system is healthy.

### Reverse lookup (address → DID)

- **Top:** wide address input, `LOOK UP` verdant button right.
- **After lookup:** results list as slim DID rows. Ordered by binding strength: the DID whose Lock Script controls this address comes first with a verdant left stripe; secondary references (addresses in `alsoKnownAs`) come below with a cobalt stripe.
- Empty state with suggestion to claim a DID for this address.

### did:plc migration

The most complex flow but rare per user.

1. **Source.** Input the did:plc identifier. Page resolves it and renders the history as a slim manifest card with `SOURCE · DID:PLC` status band. Shows genesis op, current rotation keys, op count.
2. **Authorization.** User signs the CKB transaction with one of the source DID's rotation keys, minting the new did:ckb with `local_id` pointing back. Two manifest cards side by side: source (did:plc) left, target (new did:ckb) right, connected by a verdant bracket showing the migration link.
3. **Window.** After submission, target's status band turns cobalt `MIGRATING`. Countdown timer shows remaining time in the 72-hour window. Mono caps note: "During this window, a higher-priority rotation key from the source DID can overwrite this migration. After 72 hours plus 50 block confirmations, the migration is final."
4. **Final.** Window closes, band switches to verdant `ACTIVE`.

If a higher-priority key contests within the window, the contested card surfaces in alarm with full conflict details and a link to the contesting DID.

### Deactivate flow

The slowest, heaviest flow. Permanent. Reached only from settings.

- Hero card with alarm status band: `DEACTIVATION IS PERMANENT`.
- Deliberately long, serious body copy. Explains: what happens on chain (Cell burned, capacity returned), what doesn't (no recovery, no re-mint), what apps using this DID will see (document becomes unresolvable, dependent reputation loses its anchor).
- **24-hour UI cool-down:** the verdant `DEACTIVATE` button is disabled for the first 24 hours after reaching the page. Mono caps line shows unlock time. Wait persists in local state if user leaves.
- After cool-down: user must type the full DID to confirm, then sign the burn transaction.

This is the only flow that introduces friction beyond what the chain requires. The friction is the feature.

### Transaction history for a DID

Linked from home hero (`VIEW HISTORY`). Standalone page.

- Hero: compressed DID banner at top.
- Body: long vertical activity feed. Each entry is the activity feed line component with an expand affordance: click expands to a slim manifest card with full tx details (cell deps, inputs, outputs data diff).
- Filter strip: action type, date range.

### Settings

Form-style page. Sections:

- **Profile defaults:** monogram color when no avatar, default network for new DIDs.
- **Notifications:** in-app toggles for tx confirmations, contested events, migration window closing.
- **Connected wallet:** current, switch, disconnect.
- **Network:** mainnet/testnet toggle. Large, ink-bordered. Warning band when on testnet: `TESTNET · DIDs ARE NOT REAL · CKB IS PLAY MONEY`.
- **Danger zone:** link to deactivate flow.

### Docs

Editorial layout. Wide left sidebar with mono caps section nav. Body in body sans, 64ch max measure. Code blocks in mono with paper-with-border treatment and ink left border. Inline code in mono with small paper-with-border background.

Must cover: what a DID is, what a Cell is, the cost model, key rotation versus DID rotation, the migration window, resolver behavior, recovering a contested DID, public spec links.

---

## 8. Motion (restrained, document-like)

Things move because something happened, not to look fancy.

- Page transitions: 200ms paper crossfade. No slides, no card flips.
- Element entrances: 280ms ease-out. Hairlines sweep, status bands fill from left, brackets snap, big values count up.
- Hover states: instantaneous, no easing.
- Pulse dots: 1.6s ease-in-out opacity loop 0.6 → 1.0 → 0.6.
- Status changes: 400ms color flash (band briefly inverts e.g. amber → ink → verdant). The "stamp landing" moment.

**Tx lifecycle** (the most important motion):
1. Band animates `DRAFT` → `PENDING` with stamp-landing flash.
2. While pending: pulsing amber dot, cycling mono caps text (`WAITING FOR BLOCK…` → `INDEXING…` → `VERIFYING TYPE SCRIPT…`).
3. On confirmation: flash ink for 400ms, settle into verdant `ACTIVE`. Block height counts up from placeholder. Hairline sweeps left-to-right across the form footer.

**Loading:** no spinners ever. Mono caps text cycles between contextual options. 1px hairline sweeps left-to-right at 1.4s loop beneath the loading text.

---

## 9. Accessibility

- Body text minimum WCAG AA against paper. Amber on paper passes for large mono caps but not for small body. Amber is for fills, not prose.
- Color is never the only signal. Every state has a label + structural difference + dot/stamp.
- Focus rings: 2px verdant outset, squared.
- All interactive elements keyboard accessible. Tab order matches visual order.
- Mono caps minimum 11px. Body minimum 14px.
- Reduced-motion: pulse dots become static, flashes become instant swaps, sweeps become instant fills.
- Form inputs always have visible labels, never placeholder-only.
- DID strings and tx hashes always have a copy affordance with visual + screen-reader feedback.
