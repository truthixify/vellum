export type DocsPage = "index" | "builders" | "issuers" | "integrators";

export type DocsRoute = { kind: "page"; page: DocsPage } | { kind: "invalid" };

const DOCS_PAGES: Readonly<Record<string, DocsPage>> = {
  "/docs": "index",
  "/docs/builders": "builders",
  "/docs/issuers": "issuers",
  "/docs/integrators": "integrators",
};

export function docsRouteFromPath(pathname: string): DocsRoute | null {
  const path = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  const page = DOCS_PAGES[path];
  if (page) return { kind: "page", page };
  return path.startsWith("/docs/") ? { kind: "invalid" } : null;
}
