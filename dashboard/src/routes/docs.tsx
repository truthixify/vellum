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
      {/* Mobile gets pt-16 (64px) to clear the fixed tabs bar (h-12 + border)
          which now sits at top:0 because the global top nav is hidden on
          mobile docs. Desktop drops back to the regular lg:pt-16. */}
      <div className="max-w-[1200px] mx-auto px-6 lg:px-12 pt-16 pb-8 lg:pt-16 lg:pb-16">
        <div className="grid lg:grid-cols-[240px_minmax(0,1fr)] gap-12 lg:gap-16">
          <aside className="hidden lg:block lg:sticky lg:top-24 lg:self-start">
            <SidebarNav />
          </aside>
          <article className="min-w-0 max-w-[64ch]">
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
              className="mono-caps text-ink hover:text-cobalt block px-3 py-1.5 -mx-3 transition-colors"
              activeProps={{
                className:
                  "mono-caps bg-verdant text-paper block px-3 py-1.5 -mx-3 transition-colors",
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
            <a
              href={item.href}
              target="_blank"
              rel="noreferrer"
              className="mono-caps text-ink hover:text-cobalt block px-3 py-1.5 -mx-3 transition-colors"
            >
              {item.label} <span aria-hidden>↗</span>
            </a>
          </li>
        ))}
      </ul>
    </>
  );
}

// Mobile: a horizontal tab strip fixed at the very top of the viewport. The
// global top nav is hidden on mobile docs (see __root.tsx) so this strip is
// the only chrome at the top, touching the viewport edge with no gap.
function MobileTabs() {
  return (
    <nav
      aria-label="Documentation pages"
      className="lg:hidden fixed top-0 inset-x-0 z-40 bg-paper border-b border-ink"
    >
      <div className="overflow-x-auto">
        <ul className="flex items-stretch gap-0 min-w-max">
          {INTERNAL.map((item) => (
            <li key={item.to} className="shrink-0">
              <Link
                to={item.to}
                activeOptions={{ exact: true }}
                className="mono-caps text-ink px-4 h-12 inline-flex items-center border-r border-hairline hover:bg-ink hover:text-paper transition-colors"
                activeProps={{
                  className:
                    "mono-caps bg-verdant text-paper px-4 h-12 inline-flex items-center border-r border-hairline",
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
    <nav
      aria-label="Documentation pager"
      className="mt-16 pt-8 border-t-2 border-ink grid grid-cols-1 sm:grid-cols-2 gap-4"
    >
      {prev ? (
        <Link
          to={prev.to}
          className="group border border-ink p-5 hover:bg-ink hover:text-paper transition-colors sm:text-left"
        >
          <div className="mono-caps text-muted-foreground group-hover:text-paper mb-1">
            ← Previous
          </div>
          <div className="text-lg font-medium">{prev.label}</div>
        </Link>
      ) : (
        <div className="hidden sm:block" />
      )}
      {next ? (
        <Link
          to={next.to}
          className="group border border-ink p-5 hover:bg-ink hover:text-paper transition-colors sm:text-right"
        >
          <div className="mono-caps text-muted-foreground group-hover:text-paper mb-1">
            Next →
          </div>
          <div className="text-lg font-medium">{next.label}</div>
        </Link>
      ) : (
        <div className="hidden sm:block" />
      )}
    </nav>
  );
}
