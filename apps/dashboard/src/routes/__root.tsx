import type { QueryClient } from "@tanstack/react-query";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  Activity,
  BadgeCheck,
  BookOpen,
  ChartNoAxesColumnIncreasing,
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

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { WalletButton } from "@/components/vellum/WalletButton";
import { ReputationChip } from "@/components/reputation/ReputationChip";
import { ActiveIdentityProvider } from "@/lib/active-identity";

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
  to:
    | "/"
    | "/my"
    | "/verify"
    | "/reputation"
    | "/resolve"
    | "/issue"
    | "/activity"
    | "/governance"
    | "/docs";
  icon: ComponentType<{ size?: number; strokeWidth?: number; "aria-hidden"?: boolean }>;
};

const PRIMARY_NAV: NavItem[] = [
  { label: "Overview", to: "/", icon: LayoutGrid },
  { label: "Identity", to: "/my", icon: Shield },
  { label: "Verify", to: "/verify", icon: BadgeCheck },
  { label: "Reputation", to: "/reputation", icon: ChartNoAxesColumnIncreasing },
  { label: "Resolve", to: "/resolve", icon: Search },
  { label: "Issue", to: "/issue", icon: Plus },
  { label: "Activity", to: "/activity", icon: Activity },
  { label: "Governance", to: "/governance", icon: Landmark },
];

const MOBILE_NAV: NavItem[] = [
  { label: "Overview", to: "/", icon: LayoutGrid },
  { label: "Identity", to: "/my", icon: Shield },
  { label: "Verify", to: "/verify", icon: BadgeCheck },
  { label: "Score", to: "/reputation", icon: ChartNoAxesColumnIncreasing },
];

const MOBILE_MORE_NAV: NavItem[] = [
  { label: "Resolve a DID", to: "/resolve", icon: Search },
  { label: "Issue a claim", to: "/issue", icon: Plus },
  { label: "Activity", to: "/activity", icon: Activity },
  { label: "Governance", to: "/governance", icon: Landmark },
  { label: "Documentation", to: "/docs", icon: BookOpen },
];

function isNavItemActive(item: NavItem, pathname: string) {
  if (item.to === "/") return pathname === "/";
  if (item.to === "/my") {
    return ["/my", "/claim", "/edit", "/rotate", "/migrate", "/deactivate"].some(
      (path) => pathname === path || pathname.startsWith(`${path}/`),
    );
  }
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

function DashboardNavLink({ item, mobile = false }: { item: NavItem; mobile?: boolean }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const Icon = item.icon;
  const base = mobile ? "dashboard-mobile-link" : "dashboard-nav-link";
  const active = isNavItemActive(item, pathname);
  return (
    <Link
      to={item.to}
      className={`${base}${active ? ` ${base}--active` : ""}`}
      aria-current={active ? "page" : undefined}
    >
      <Icon size={mobile ? 18 : 15} strokeWidth={1.8} aria-hidden={true} />
      <span>{item.label}</span>
    </Link>
  );
}

function DashboardSidebar() {
  return (
    <aside className="dashboard-sidebar">
      <div className="dashboard-sidebar__brand">
        <Link to="/" aria-label="Vellum overview">
          <Wordmark />
        </Link>
      </div>
      <nav className="dashboard-nav" aria-label="Dashboard navigation">
        {PRIMARY_NAV.map((item) => (
          <DashboardNavLink key={item.to} item={item} />
        ))}
      </nav>
      <nav className="dashboard-sidebar__secondary" aria-label="Resources">
        <Link to="/docs">
          <BookOpen size={14} strokeWidth={1.8} aria-hidden={true} />
          Documentation
        </Link>
        <a href={`${SITE_ORIGIN}/transparency`}>
          <span className="dashboard-help-icon">?</span>Transparency
        </a>
        <a href={SITE_ORIGIN}>
          <ExternalLink size={14} strokeWidth={1.8} aria-hidden={true} />
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
  if (pathname.startsWith("/verify/github")) return "GitHub verification";
  if (pathname.startsWith("/verify")) return "Verification";
  if (pathname.startsWith("/reputation")) return "Reputation";
  if (pathname.startsWith("/resolve")) return "Resolve";
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
      </div>
      <div className="dashboard-context-bar__actions">
        <ReputationChip />
        <WalletButton />
        <ThemeButton />
      </div>
    </header>
  );
}

function MobileNavigation() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const moreActive = MOBILE_MORE_NAV.some((item) => isNavItemActive(item, pathname));

  return (
    <nav className="dashboard-mobile-nav" aria-label="Dashboard navigation">
      {MOBILE_NAV.map((item) => (
        <DashboardNavLink key={item.to} item={item} mobile />
      ))}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className={`dashboard-mobile-link dashboard-mobile-more-trigger${moreActive ? " dashboard-mobile-link--active" : ""}`}
            type="button"
            aria-label="More navigation"
          >
            <MoreHorizontal size={18} strokeWidth={1.8} aria-hidden={true} />
            <span>More</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="dashboard-mobile-more-menu"
          side="top"
          align="end"
          sideOffset={8}
        >
          {MOBILE_MORE_NAV.map((item) => {
            const Icon = item.icon;
            const active = isNavItemActive(item, pathname);
            return (
              <DropdownMenuItem asChild key={item.to}>
                <Link
                  className={`dashboard-mobile-more-item${active ? " dashboard-mobile-more-item--active" : ""}`}
                  to={item.to}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon size={16} strokeWidth={1.8} aria-hidden={true} />
                  <span>{item.label}</span>
                </Link>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <ActiveIdentityProvider>
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
      </ActiveIdentityProvider>
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
