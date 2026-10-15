import { preloadPublicProfile } from "./lib/public-profile-load";
import { profileRouteFromPath } from "./lib/profile-route";

type ProfilePreloader = typeof preloadPublicProfile;

export function preloadProfileRoute(
  pathname: string,
  preload: ProfilePreloader = preloadPublicProfile,
) {
  const route = profileRouteFromPath(pathname);
  return route?.kind === "profile" ? preload(route.did) : undefined;
}

if (typeof window !== "undefined") {
  preloadProfileRoute(window.location.pathname);
}
