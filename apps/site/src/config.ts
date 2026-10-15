export const DASHBOARD_ORIGIN =
  import.meta.env.VITE_DASHBOARD_URL ??
  (import.meta.env.DEV ? "http://localhost:8080" : "https://dashboard.usevellum.xyz");

export const REPUTATION_API_ORIGIN = (
  import.meta.env.VITE_REPUTATION_API_URL ?? DASHBOARD_ORIGIN
).replace(/\/+$/, "");

export function dashboardUrl(path = "/") {
  return `${DASHBOARD_ORIGIN}${path}`;
}
