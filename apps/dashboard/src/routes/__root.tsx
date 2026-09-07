import type { QueryClient } from "@tanstack/react-query";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  Activity,
  BookOpen,
  ExternalLink,
  Landmark,
  LayoutGrid,
  MoreHorizontal,
  Plus,
  Search,
  Shield,
} from "lucide-react";
import {
  Link,
  Outlet,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";
import { ThemeButton, Wordmark } from "@vellum/ui";
import type { ComponentType, ReactNode } from "react";

import { WalletButton } from "@/components/vellum/WalletButton";

const SITE_ORIGIN =
  import.meta.env.VITE_SITE_URL ??
  (import.meta.env.DEV ? "http://localhost:8081" : "https://usevellum.xyz");

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

type NavItem = {
  label: string;
  to: "/" | "/my" | "/resolve" | "/issue" | "/activity" | "/governance";
  icon: ComponentType<{ size?: number; strokeWidth?: number; "aria-hidden"?: boolean }>;
};

const PRIMARY_NAV: NavItem[] = [
  { label: "Overview", to: "/", icon: LayoutGrid },
  { label: "Identity", to: "/my", icon: Shield },
  { label: "Verify", to: "/resolve", icon: Search },
  { label: "Issue", to: "/issue", icon: Plus },
  { label: "Activity", to: "/activity", icon: Activity },
  { label: "Governance", to: "/governance", icon: Landmark },
];

const MOBILE_NAV = [PRIMARY_NAV[0], PRIMARY_NAV[1], PRIMARY_NAV[2], PRIMARY_NAV[4], PRIMARY_NAV[3]];

function DashboardNavLink({ item, mobile = false }: { item: NavItem; mobile?: boolean }) {
  const Icon = mobile && item.to === "/issue" ? MoreHorizontal : item.icon;
  const base = mobile ? "dashboard-mobile-link" : "dashboard-nav-link";
  return (
    <Link
      to={item.to}
      activeOptions={{ exact: item.to === "/" }}
      className={base}
      activeProps={{ className: `${base} ${base}--active` }}
    >
      <Icon size={mobile ? 18 : 15} strokeWidth={1.8} aria-hidden={true} />
      <span>{item.label === "Issue" && mobile ? "More" : item.label}</span>
    </Link>
  );
}

function DashboardSidebar() {
  return (
    <aside className="dashboard-sidebar">
      <div className="dashboard-sidebar__brand">
        <Wordmark />
      </div>
      <nav className="dashboard-nav" aria-label="Dashboard navigation">
        {PRIMARY_NAV.map((item) => (
          <DashboardNavLink key={item.to} item={item} />
        ))}
      </nav>
      <nav className="dashboard-sidebar__secondary" aria-label="Resources">
        <Link to="/docs">
          <BookOpen size={14} strokeWidth={1.8} />
          Documentation
        </Link>
        <a href={`${SITE_ORIGIN}/transparency`}>
          <span className="dashboard-help-icon">?</span>Transparency
        </a>
        <a href={SITE_ORIGIN}>
          <ExternalLink size={14} strokeWidth={1.8} />
          Public site
        </a>
      </nav>
    </aside>
  );
}

function pageTitle(pathname: string) {
  if (pathname === "/") return "Overview";
  if (pathname.startsWith("/my")) return "Identity";
  if (pathname.startsWith("/claim")) return "Identity - Claim";
  if (pathname.startsWith("/edit")) return "Identity - Edit";
  if (pathname.startsWith("/rotate")) return "Identity - Rotate key";
  if (pathname.startsWith("/migrate")) return "Identity - Migrate";
  if (pathname.startsWith("/deactivate")) return "Identity - Deactivate";
  if (pathname.startsWith("/resolve")) return "Verify";
  if (pathname.startsWith("/issue")) return "Issue a claim";
  if (pathname.startsWith("/activity")) return "Activity";
  if (pathname.startsWith("/governance")) return "Governance policy";
  if (pathname.startsWith("/docs")) return "Documentation";
  return "Vellum";
}

function ContextBar() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  return (
    <header className="dashboard-context-bar">
      <div className="dashboard-context-bar__title">
        <strong>{pageTitle(pathname)}</strong>
        {pathname === "/" && (
          <>
            <span className="dashboard-updated">Data last updated 18 minutes ago</span>
            <span className="v-preview-badge dashboard-preview-badge">&lt;&gt; Preview data</span>
          </>
        )}
      </div>
      <div className="dashboard-context-bar__actions">
        <WalletButton />
        <ThemeButton />
      </div>
    </header>
  );
}

function MobileNavigation() {
  return (
    <nav className="dashboard-mobile-nav" aria-label="Dashboard navigation">
      {MOBILE_NAV.map((item) => (
        <DashboardNavLink key={item.to} item={item} mobile />
      ))}
    </nav>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <div className="dashboard-layout">
        <DashboardSidebar />
        <div className="dashboard-workspace">
          <ContextBar />
          <main className="dashboard-main">
            <Outlet />
          </main>
        </div>
        <MobileNavigation />
      </div>
    </QueryClientProvider>
  );
}

function ErrorFrame({ children }: { children: ReactNode }) {
  return <div className="dashboard-error-frame">{children}</div>;
}

function NotFoundComponent() {
  return (
    <ErrorFrame>
      <span>404</span>
      <h1>Page not found</h1>
      <p>This view does not exist in the registry.</p>
      <Link className="v-button v-button--primary" to="/">
        Return to overview
      </Link>
    </ErrorFrame>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <ErrorFrame>
      <span>Error</span>
      <h1>This page did not load</h1>
      <p>{error.message}</p>
      <button
        className="v-button v-button--primary"
        onClick={() => {
          router.invalidate();
          reset();
        }}
      >
        Retry
      </button>
    </ErrorFrame>
  );
}
