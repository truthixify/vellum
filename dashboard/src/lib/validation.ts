/**
 * Lightweight validators for user-input strings on the edit form. Return null
 * when the value passes, or a short human-readable hint when it doesn't.
 * Validators are advisory: the form never blocks submission on a warning
 * because the on-chain Type Script accepts any valid CBOR, and convention
 * shapes evolve. The hints just nudge users toward common-case correctness.
 */

const URI_SCHEME = /^[a-z][a-z0-9+\-.]*:\/\/[^\s]+$/i;
const DID_PATTERN = /^did:[a-z][a-z0-9]*:[a-zA-Z0-9._%-]+$/;
const DID_KEY_PATTERN = /^did:key:z[1-9A-HJ-NP-Za-km-z]+$/;
const HEX_PUBKEY = /^0x[0-9a-fA-F]{40,}$/;
const HTTPS_URL = /^https?:\/\/[^\s]+$/i;
const IPFS_URL = /^ipfs:\/\/[a-zA-Z0-9]+/;
const AT_HANDLE = /^at:\/\/[a-z0-9][a-z0-9._-]*\.[a-z][a-z0-9._-]*$/i;
const NOSTR_HANDLE = /^nostr:\/\/[a-z0-9._-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;

export function validateHandle(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  if (
    URI_SCHEME.test(v) ||
    DID_PATTERN.test(v) ||
    AT_HANDLE.test(v) ||
    NOSTR_HANDLE.test(v)
  ) {
    return null;
  }
  return "Expected a URI like at://you.bsky.social, nostr://you@example.com, https://your.site, or a did:method:id";
}

export function validateVerificationKey(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  if (DID_KEY_PATTERN.test(v)) return null;
  if (DID_PATTERN.test(v)) return null;
  if (HEX_PUBKEY.test(v)) return null;
  return "Expected did:key:z... (multibase base58btc), another did:method:id, or a 0x-prefixed hex pubkey";
}

export function validateVerificationName(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  if (/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(v)) return null;
  return "Use alphanumeric, dashes, underscores, starting with a letter (e.g. atproto, nostr)";
}

export function validateServiceName(value: string): string | null {
  return validateVerificationName(value);
}

export function validateServiceType(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  if (/^[A-Za-z][A-Za-z0-9_-]*$/.test(v)) return null;
  return "Use PascalCase identifier like AtprotoPersonalDataServer or NostrRelay";
}

export function validateUrl(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  if (HTTPS_URL.test(v) || IPFS_URL.test(v)) return null;
  return "Expected https://, http://, or ipfs:// URL";
}
