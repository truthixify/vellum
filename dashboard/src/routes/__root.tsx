import type { QueryClient } from "@tanstack/react-query";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
} from "@tanstack/react-router";

function NotFoundComponent() {
  return (
    <div className="min-h-screen bg-paper flex items-center justify-center px-6">
      <div className="border-2 border-ink p-12 text-center max-w-md">
        <div className="mono-caps text-muted-foreground mb-4">ERROR · 404</div>
        <h1 className="text-3xl font-medium mb-3">Page not found</h1>
        <p className="text-muted-foreground mb-6">
          This document does not exist in the registry.
        </p>
        <Link to="/" className="mono-caps inline-block bg-ink text-paper px-5 py-3">
          Return home
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  return (
    <div className="min-h-screen bg-paper flex items-center justify-center px-6">
      <div className="border-2 border-ink p-12 text-center max-w-md">
        <div className="mono-caps text-alarm mb-4">ERROR · UNHANDLED</div>
        <h1 className="text-2xl font-medium mb-3">This page didn't load</h1>
        <p className="text-muted-foreground mb-6 font-mono text-sm">{error.message}</p>
        <button
          onClick={() => {
            router.invalidate();
            reset();
          }}
          className="mono-caps bg-ink text-paper px-5 py-3"
        >
          Retry
        </button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function NavLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="mono-caps text-ink hover:text-cobalt transition-colors"
      activeProps={{ className: "mono-caps text-cobalt" }}
    >
      {children}
    </Link>
  );
}

function VellumGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <rect x="3" y="2" width="18" height="20" />
      <path d="M3 6h18M7 10h10M7 14h10M7 18h6" />
    </svg>
  );
}

function TopNav() {
  return (
    <nav className="sticky top-0 z-40 bg-paper border-b border-ink">
      <div className="max-w-[1320px] mx-auto px-6 lg:px-12 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5">
          <VellumGlyph className="w-5 h-5 text-ink" />
          <span className="text-lg font-medium tracking-tight">Vellum</span>
        </Link>
        <div className="hidden md:flex items-center gap-8">
          <NavLink to="/resolve">Resolve</NavLink>
          <NavLink to="/migrate">Migrate</NavLink>
          <NavLink to="/docs">Docs</NavLink>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/my"
            className="hidden sm:inline-flex mono-caps border border-ink px-3 py-2 hover:bg-ink hover:text-paper"
          >
            My DID
          </Link>
          <button className="mono-caps bg-verdant text-paper px-4 py-2 hover:bg-[var(--verdant-hover)]">
            Connect wallet
          </button>
        </div>
      </div>
    </nav>
  );
}

function Footer() {
  return (
    <footer className="border-t-2 border-ink bg-paper mt-32">
      <div className="max-w-[1320px] mx-auto px-6 lg:px-12 py-16">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-12">
          <div>
            <div className="flex items-center gap-2.5 mb-4">
              <VellumGlyph className="w-5 h-5 text-ink" />
              <span className="text-lg font-medium tracking-tight">Vellum</span>
            </div>
            <p className="text-sm text-muted-foreground max-w-[28ch]">
              A reference dashboard for did:ckb on Nervos CKB.
            </p>
          </div>
          {[
            {
              title: "Product",
              links: [
                ["Resolve", "/resolve"],
                ["Migrate", "/migrate"],
                ["My DID", "/my"],
              ],
            },
            {
              title: "Spec",
              links: [
                ["did:ckb", "/docs"],
                ["Cell model", "/docs"],
                ["Migration", "/docs"],
              ],
            },
            {
              title: "Resources",
              links: [
                ["Docs", "/docs"],
                ["GitHub", "#"],
                ["Contact", "#"],
              ],
            },
          ].map((col) => (
            <div key={col.title}>
              <div className="mono-caps text-muted-foreground mb-4">{col.title}</div>
              <ul className="space-y-2.5">
                {col.links.map(([label, href]) => (
                  <li key={label}>
                    <Link
                      to={href}
                      className="text-sm hover:text-cobalt hover:underline"
                    >
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t border-hairline mt-12 pt-6 flex flex-wrap justify-between gap-4 mono-caps text-muted-foreground">
          <span>VELLUM · DID:CKB DASHBOARD</span>
          <span>© REGISTRY</span>
        </div>
      </div>
    </footer>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen flex flex-col bg-paper">
        <TopNav />
        <main className="flex-1">
          <Outlet />
        </main>
        <Footer />
      </div>
    </QueryClientProvider>
  );
}
