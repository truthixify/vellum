import { createFileRoute, Link, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/docs")({
  component: DocsLayout,
});

type NavItem = {
  to: "/docs" | "/docs/did-ckb" | "/docs/cell-model" | "/docs/resolution" | "/docs/migration";
  label: string;
  group: "INSIDE";
};

type ExternalItem = {
  href: string;
  label: string;
  group: "EXTERNAL";
};

const INTERNAL: NavItem[] = [
  { to: "/docs", label: "Overview", group: "INSIDE" },
  { to: "/docs/did-ckb", label: "did:ckb method", group: "INSIDE" },
  { to: "/docs/cell-model", label: "Cell model", group: "INSIDE" },
  { to: "/docs/resolution", label: "Resolution", group: "INSIDE" },
  { to: "/docs/migration", label: "Migration", group: "INSIDE" },
];

const EXTERNAL: ExternalItem[] = [
  { href: "https://github.com/web5fans/web5-wips", label: "WIPs (spec)", group: "EXTERNAL" },
  { href: "https://github.com/web5fans/did-ckb", label: "did-ckb (contract)", group: "EXTERNAL" },
  { href: "https://github.com/truthixify/vellum", label: "Vellum source", group: "EXTERNAL" },
  {
    href: "https://github.com/nervosnetwork/rfcs/blob/master/rfcs/0002-ckb/0002-ckb.md",
    label: "Nervos CKB RFC-0002",
    group: "EXTERNAL",
  },
];

function DocsLayout() {
  return (
    <div className="max-w-[1200px] mx-auto px-6 lg:px-12 py-16">
      <div className="grid lg:grid-cols-[240px_1fr] gap-16">
        <aside className="lg:sticky lg:top-24 lg:self-start">
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
        </aside>
        <article className="max-w-[64ch]">
          <Outlet />
        </article>
      </div>
    </div>
  );
}
