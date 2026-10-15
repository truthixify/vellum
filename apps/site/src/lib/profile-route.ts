export type ProfileRoute =
  | { kind: "index" }
  | { kind: "profile"; did: string }
  | { kind: "invalid" };

export function profilePath(did: string): string {
  return `/profile/${encodeURIComponent(did)}`;
}

export function profileRouteFromPath(pathname: string): ProfileRoute | null {
  const path = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  if (path === "/profile") return { kind: "index" };
  if (!path.startsWith("/profile/")) return null;

  const encodedDid = path.slice("/profile/".length);
  if (!encodedDid || encodedDid.includes("/")) return { kind: "invalid" };

  try {
    return { kind: "profile", did: decodeURIComponent(encodedDid) };
  } catch {
    return { kind: "invalid" };
  }
}
