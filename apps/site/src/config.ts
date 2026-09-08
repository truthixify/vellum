export const DASHBOARD_ORIGIN =
  import.meta.env.VITE_DASHBOARD_URL ??
  (import.meta.env.DEV ? "http://localhost:8080" : "https://dashboard.usevellum.xyz");

export function dashboardUrl(path = "/") {
  return `${DASHBOARD_ORIGIN}${path}`;
}
