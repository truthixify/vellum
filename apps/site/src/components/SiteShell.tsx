import { ExternalLink } from "lucide-react";
import { ThemeButton, Wordmark } from "@vellum/ui";
import type { ReactNode } from "react";
import { dashboardUrl } from "../config";

const NAVIGATION = [
  { label: "Product", href: "/" },
  { label: "Profiles", href: "/profile" },
  { label: "Developers", href: "/docs" },
  { label: "Transparency", href: "/transparency" },
];

export function SiteShell({ children }: { children: ReactNode }) {
  return (
    <div className="site-shell">
      <header className="site-header">
        <div className="site-header__inner">
          <a className="site-brand" href="/" aria-label="Vellum home">
            <Wordmark />
          </a>
          <nav className="site-nav" aria-label="Primary navigation">
            {NAVIGATION.map((item) => (
              <a key={item.href} href={item.href}>
                {item.label}
              </a>
            ))}
          </nav>
          <div className="site-header__actions">
            <ThemeButton />
            <a
              className="v-button v-button--primary site-dashboard-link"
              href={dashboardUrl()}
            >
              Open dashboard
            </a>
          </div>
        </div>
      </header>
      <main>{children}</main>
      <footer className="site-footer">
        <div className="site-content site-footer__inner">
          <Wordmark compact />
          <nav aria-label="Footer navigation">
            {NAVIGATION.map((item) => (
              <a key={item.href} href={item.href}>
                {item.label}
              </a>
            ))}
          </nav>
          <a className="site-footer__dashboard" href={dashboardUrl()}>
            Dashboard <ExternalLink size={13} aria-hidden="true" />
          </a>
        </div>
      </footer>
    </div>
  );
}
