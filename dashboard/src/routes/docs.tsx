import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";

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
    <div className="max-w-[1200px] mx-auto px-6 lg:px-12 py-12 lg:py-16">
      <div className="lg:hidden mb-8">
        <MobileNav />
      </div>
      <div className="grid lg:grid-cols-[240px_1fr] gap-16">
        <aside className="hidden lg:block lg:sticky lg:top-24 lg:self-start">
          <SidebarNav />
        </aside>
        <article className="max-w-[64ch]">
          <Outlet />
          <DocsPager />
        </article>
      </div>
    </div>
  );
}

function SidebarNav() {
  return (
    <>
      <div className="mono-caps text-muted-foreground mb-4">DOCUMENTATION</div>
      <ul className="space-y-2.5 mb-10">
        {INTERNAL.map((item) => (
          <li key={item.to}>
            <Link
              to={item.to}
              activeOptions={{ exact: true }}
              className="mono-caps text-ink hover:text-cobalt block"
              activeProps={{ className: "mono-caps text-cobalt block" }}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
      <div className="mono-caps text-muted-foreground mb-4">REFERENCES</div>
      <ul className="space-y-2.5">
        {EXTERNAL.map((item) => (
          <li key={item.href}>
            <a
              href={item.href}
              target="_blank"
              rel="noreferrer"
              className="mono-caps text-ink hover:text-cobalt block"
            >
              {item.label} <span aria-hidden>↗</span>
            </a>
          </li>
        ))}
      </ul>
    </>
  );
}

function MobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const current = INTERNAL.find((item) => item.to === pathname);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div className="border-2 border-ink bg-paper">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="docs-mobile-menu"
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-ink hover:text-paper transition-colors"
      >
        <span className="flex items-baseline gap-3">
          <span className="mono-caps text-muted-foreground">CONTENTS</span>
          <span className="text-base font-medium">{current?.label ?? "Documentation"}</span>
        </span>
        <span className="mono-caps">{open ? "− CLOSE" : "+ MENU"}</span>
      </button>
      {open ? (
        <div id="docs-mobile-menu" className="border-t border-ink">
          <div className="mono-caps text-muted-foreground px-4 py-2 border-b border-hairline">
            DOCUMENTATION
          </div>
          <ul>
            {INTERNAL.map((item) => (
              <li key={item.to}>
                <Link
                  to={item.to}
                  activeOptions={{ exact: true }}
                  className="block px-4 py-3 mono-caps border-b border-hairline hover:bg-ink hover:text-paper transition-colors"
                  activeProps={{
                    className:
                      "block px-4 py-3 mono-caps border-b border-hairline bg-verdant text-paper",
                  }}
                  onClick={() => setOpen(false)}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mono-caps text-muted-foreground px-4 py-2 border-b border-hairline">
            REFERENCES
          </div>
          <ul>
            {EXTERNAL.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  target="_blank"
                  rel="noreferrer"
                  className="block px-4 py-3 mono-caps border-b border-hairline last:border-b-0 hover:bg-ink hover:text-paper transition-colors"
                  onClick={() => setOpen(false)}
                >
                  {item.label} <span aria-hidden>↗</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
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
