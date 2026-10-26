export type DocsPage = "index" | "builders" | "issuers" | "integrators" | "identity";

export type DocsRoute = { kind: "page"; page: DocsPage } | { kind: "invalid" };

const DOCS_PAGES: Readonly<Record<string, DocsPage>> = {
  "/docs": "index",
  "/docs/builders": "builders",
  "/docs/issuers": "issuers",
  "/docs/integrators": "integrators",
  "/docs/identity": "identity",
};

const LEGACY_IDENTITY_FRAGMENTS = new Set(["#install", "#resolve", "#states", "#profile"]);

export function docsRouteFromPath(pathname: string, hash = ""): DocsRoute | null {
  const path = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  if (path === "/docs" && LEGACY_IDENTITY_FRAGMENTS.has(hash)) {
    return { kind: "page", page: "identity" };
  }
  const page = DOCS_PAGES[path];
  if (page) return { kind: "page", page };
  return path.startsWith("/docs/") ? { kind: "invalid" } : null;
}
