import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";

export const Route = createFileRoute("/docs")({
  component: DocsLayout,
});

type DocsPath =
  | "/docs"
  | "/docs/did-ckb"
  | "/docs/cell-model"
  | "/docs/resolution"
  | "/docs/migration";

type NavItem = {
  to: DocsPath;
  label: string;
};

type ExternalItem = {
  href: string;
  label: string;
};

const INTERNAL: NavItem[] = [
  { to: "/docs", label: "Overview" },
  { to: "/docs/did-ckb", label: "did:ckb method" },
  { to: "/docs/cell-model", label: "Cell model" },
  { to: "/docs/resolution", label: "Resolution" },
  { to: "/docs/migration", label: "Migration" },
];

const EXTERNAL: ExternalItem[] = [
  { href: "https://github.com/web5fans/web5-wips", label: "WIPs (spec)" },
  { href: "https://github.com/web5fans/did-ckb", label: "did-ckb (contract)" },
  { href: "https://github.com/truthixify/vellum", label: "Vellum source" },
  {
    href: "https://github.com/nervosnetwork/rfcs/blob/master/rfcs/0002-ckb/0002-ckb.md",
    label: "Nervos CKB RFC-0002",
  },
];

function usePathname(): string {
  return useRouterState({
    select: (s) => s.location.pathname.replace(/\/$/, "") || "/docs",
  });
}

function DocsLayout() {
  return (
    <>
      <MobileTabs />
      <div className="docs-layout">
        <div className="grid lg:grid-cols-[240px_minmax(0,1fr)] gap-12 lg:gap-16">
          <aside className="hidden lg:block lg:sticky lg:top-24 lg:self-start">
            <SidebarNav />
          </aside>
          <article className="min-w-0 max-w-[64ch] pt-8 lg:pt-0">
            <Outlet />
            <DocsPager />
          </article>
        </div>
      </div>
    </>
  );
}

function SidebarNav() {
  return (
    <>
      <div className="mono-caps text-muted-foreground mb-4">DOCUMENTATION</div>
      <ul className="space-y-1 mb-10">
        {INTERNAL.map((item) => (
          <li key={item.to}>
            <Link
              to={item.to}
              activeOptions={{ exact: true }}
              className="docs-nav-link"
              activeProps={{
                className: "docs-nav-link docs-nav-link--active",
              }}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
      <div className="mono-caps text-muted-foreground mb-4">REFERENCES</div>
      <ul className="space-y-1">
        {EXTERNAL.map((item) => (
          <li key={item.href}>
            <a href={item.href} target="_blank" rel="noreferrer" className="docs-nav-link">
              {item.label} <span aria-hidden>↗</span>
            </a>
          </li>
        ))}
      </ul>
    </>
  );
}

function MobileTabs() {
  return (
    <nav aria-label="Documentation pages" className="docs-mobile-nav lg:hidden">
      <div className="overflow-x-auto">
        <ul className="flex items-stretch gap-0 min-w-max">
          {INTERNAL.map((item) => (
            <li key={item.to} className="shrink-0">
              <Link
                to={item.to}
                activeOptions={{ exact: true }}
                className="docs-mobile-tab"
                activeProps={{
                  className: "docs-mobile-tab docs-mobile-tab--active",
                }}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}

function DocsPager() {
  const pathname = usePathname();
  const index = INTERNAL.findIndex((item) => item.to === pathname);
  if (index === -1) return null;
  const prev = index > 0 ? INTERNAL[index - 1] : null;
  const next = index < INTERNAL.length - 1 ? INTERNAL[index + 1] : null;
  if (!prev && !next) return null;

  return (
    <nav aria-label="Documentation pager" className="docs-pager">
      {prev ? (
        <Link to={prev.to} className="docs-pager__link docs-pager__link--previous">
          <span>Previous</span>
          <strong>← {prev.label}</strong>
        </Link>
      ) : (
        <div className="hidden sm:block" />
      )}
      {next ? (
        <Link to={next.to} className="docs-pager__link docs-pager__link--next">
          <span>Next</span>
          <strong>{next.label} →</strong>
        </Link>
      ) : (
        <div className="hidden sm:block" />
      )}
    </nav>
  );
}
