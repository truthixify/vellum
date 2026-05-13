import * as dagCbor from "@ipld/dag-cbor";
import { ccc } from "@ckb-ccc/connector-react";

// DID document shape compatible with the did:plc fields required by WIP-01
// §3.2.4, plus an optional `services.profile` entry that carries the
// human-friendly profile (display name, avatar, bio). This is the convention
// the Vellum dashboard reads/writes; other apps consuming the DID can ignore
// `services.profile` and still resolve a valid document.

export type VerificationMethods = Record<string, string>;
export type Services = Record<string, { type: string; endpoint: string } | { type: string; endpoint: string; [key: string]: unknown }>;

export type DidDocument = {
  verificationMethods?: VerificationMethods;
  alsoKnownAs?: string[];
  services?: Services;
  [key: string]: unknown;
};

export type VellumProfile = {
  displayName?: string;
  avatar?: string;
  bio?: string;
};

export const PROFILE_SERVICE_KEY = "profile";
export const PROFILE_SERVICE_TYPE = "VellumProfile";

// DiceBear pixel-art avatar derived from the DID. Used as the default when the
// holder doesn't supply a custom URL. Stored verbatim in the on-chain document
// so any resolver picks it up, not just Vellum.
export const DEFAULT_AVATAR_BASE =
  "https://api.dicebear.com/9.x/pixel-art/png?seed=";

export function defaultAvatarUrl(did: string): string {
  return `${DEFAULT_AVATAR_BASE}${did}`;
}

export function isDefaultAvatar(url: string | undefined): boolean {
  if (!url) return false;
  return url.startsWith(DEFAULT_AVATAR_BASE);
}

export function buildDocument(
  profile: VellumProfile,
  extra?: {
    verificationMethods?: VerificationMethods;
    alsoKnownAs?: string[];
    services?: Services;
  },
): DidDocument {
  const services: Services = { ...(extra?.services ?? {}) };
  const hasProfileData = !!(profile.displayName || profile.avatar || profile.bio);
  if (hasProfileData) {
    services[PROFILE_SERVICE_KEY] = {
      type: PROFILE_SERVICE_TYPE,
      endpoint: "inline",
      ...(profile.displayName ? { displayName: profile.displayName } : {}),
      ...(profile.avatar ? { avatar: profile.avatar } : {}),
      ...(profile.bio ? { bio: profile.bio } : {}),
    };
  }

  const doc: DidDocument = {};
  if (extra?.verificationMethods && Object.keys(extra.verificationMethods).length > 0) {
    doc.verificationMethods = extra.verificationMethods;
  }
  if (extra?.alsoKnownAs && extra.alsoKnownAs.length > 0) {
    doc.alsoKnownAs = extra.alsoKnownAs;
  }
  if (Object.keys(services).length > 0) {
    doc.services = services;
  }
  return doc;
}

export function extractProfile(doc: DidDocument): VellumProfile {
  const entry = doc.services?.[PROFILE_SERVICE_KEY] as
    | (Record<string, unknown> & { type: string })
    | undefined;
  if (!entry || entry.type !== PROFILE_SERVICE_TYPE) return {};
  return {
    displayName: typeof entry.displayName === "string" ? entry.displayName : undefined,
    avatar: typeof entry.avatar === "string" ? entry.avatar : undefined,
    bio: typeof entry.bio === "string" ? entry.bio : undefined,
  };
}

export function encodeDocument(doc: DidDocument): ccc.Hex {
  const cbor = dagCbor.encode(doc);
  return ccc.hexFrom(cbor);
}

export function decodeDocument(bytesLike: ccc.HexLike): DidDocument {
  const bytes = ccc.bytesFrom(bytesLike);
  const value = dagCbor.decode(bytes);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("DID document must decode to a CBOR object");
  }
  return value as DidDocument;
}
