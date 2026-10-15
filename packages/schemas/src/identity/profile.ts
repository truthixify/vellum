export type VerificationMethods = Record<string, string>;

export type Services = Record<string, { type: string; endpoint: string } & Record<string, unknown>>;

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
export const DEFAULT_AVATAR_BASE = "https://api.dicebear.com/9.x/pixel-art/png?seed=";

export function defaultAvatarUrl(did: string): string {
  return `${DEFAULT_AVATAR_BASE}${did}`;
}

export function isDefaultAvatar(url: string | undefined): boolean {
  return url?.startsWith(DEFAULT_AVATAR_BASE) ?? false;
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
  if (profile.displayName || profile.avatar || profile.bio) {
    services[PROFILE_SERVICE_KEY] = {
      type: PROFILE_SERVICE_TYPE,
      endpoint: "inline",
      ...(profile.displayName ? { displayName: profile.displayName } : {}),
      ...(profile.avatar ? { avatar: profile.avatar } : {}),
      ...(profile.bio ? { bio: profile.bio } : {}),
    };
  }

  const document: DidDocument = {};
  if (extra?.verificationMethods && Object.keys(extra.verificationMethods).length > 0) {
    document.verificationMethods = extra.verificationMethods;
  }
  if (extra?.alsoKnownAs && extra.alsoKnownAs.length > 0) {
    document.alsoKnownAs = extra.alsoKnownAs;
  }
  if (Object.keys(services).length > 0) {
    document.services = services;
  }
  return document;
}

export function extractProfile(document: DidDocument): VellumProfile {
  const entry = document.services?.[PROFILE_SERVICE_KEY];
  if (!entry || entry.type !== PROFILE_SERVICE_TYPE) return {};

  return {
    displayName: typeof entry.displayName === "string" ? entry.displayName : undefined,
    avatar: typeof entry.avatar === "string" ? entry.avatar : undefined,
    bio: typeof entry.bio === "string" ? entry.bio : undefined,
  };
}
