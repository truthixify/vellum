import { CKB_TESTNET_RPC_URL, REPUTATION_API_ORIGIN } from "../config";
import type { PublicProfileResult, PublicProfileUpdate } from "./public-profile";

type PublicProfileModule = Pick<typeof import("./public-profile"), "loadPublicProfile">;
export type PublicProfileImporter = () => Promise<PublicProfileModule>;

export type PublicProfileLoad = {
  result: Promise<PublicProfileResult>;
  subscribe: (listener: (update: PublicProfileUpdate) => void) => () => void;
};

const preloadedProfiles = new Map<string, PublicProfileLoad>();

function defaultImporter(): Promise<PublicProfileModule> {
  return import("./public-profile");
}

function preconnect(url: string) {
  if (typeof document === "undefined") return;
  const origin = new URL(url).origin;
  if (document.head.querySelector(`link[rel="preconnect"][href="${origin}"]`)) return;

  const link = document.createElement("link");
  link.rel = "preconnect";
  link.href = origin;
  link.crossOrigin = "anonymous";
  document.head.append(link);
}

export function createPublicProfileLoad(
  did: string,
  importer: PublicProfileImporter = defaultImporter,
): PublicProfileLoad {
  const updates: PublicProfileUpdate[] = [];
  const listeners = new Set<(update: PublicProfileUpdate) => void>();
  const publish = (update: PublicProfileUpdate) => {
    updates.push(update);
    listeners.forEach((listener) => listener(update));
  };

  const result = importer()
    .then(({ loadPublicProfile }) => loadPublicProfile(did, {}, publish))
    .catch(
      (): PublicProfileResult => ({
        status: "unavailable",
        message: "Vellum could not load the public profile reader.",
      }),
    );

  return {
    result,
    subscribe(listener) {
      updates.forEach(listener);
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function preloadPublicProfile(did: string): PublicProfileLoad {
  preconnect(CKB_TESTNET_RPC_URL);
  preconnect(REPUTATION_API_ORIGIN);

  const existing = preloadedProfiles.get(did);
  if (existing) return existing;

  const load = createPublicProfileLoad(did);
  preloadedProfiles.set(did, load);
  return load;
}
