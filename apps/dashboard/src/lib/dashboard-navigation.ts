export type DashboardNavPath = "/" | "/my" | "/verify" | "/reputation" | "/resolve" | "/docs";

export type DashboardNavDefinition = {
  label: string;
  to: DashboardNavPath;
};

export const PRIMARY_NAVIGATION: readonly DashboardNavDefinition[] = [
  { label: "Overview", to: "/" },
  { label: "Identity", to: "/my" },
  { label: "Verify", to: "/verify" },
  { label: "Reputation", to: "/reputation" },
  { label: "Resolve", to: "/resolve" },
];

export const MOBILE_NAVIGATION: readonly DashboardNavDefinition[] = [
  { label: "Overview", to: "/" },
  { label: "Identity", to: "/my" },
  { label: "Verify", to: "/verify" },
  { label: "Reputation", to: "/reputation" },
];

export const MOBILE_MORE_NAVIGATION: readonly DashboardNavDefinition[] = [
  { label: "Resolve a DID", to: "/resolve" },
  { label: "Documentation", to: "/docs" },
];

export function isDashboardNavItemActive(item: DashboardNavDefinition, pathname: string): boolean {
  if (item.to === "/") return pathname === "/";
  if (item.to === "/my") {
    return ["/my", "/claim", "/edit", "/rotate", "/migrate", "/deactivate"].some(
      (path) => pathname === path || pathname.startsWith(`${path}/`),
    );
  }
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}
