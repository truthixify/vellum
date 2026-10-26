import { lazy, Suspense } from "react";
import { SiteShell } from "./components/SiteShell";
import { docsRouteFromPath } from "./lib/docs-route";
import { preloadPublicProfile } from "./lib/public-profile-load";
import { profileRouteFromPath } from "./lib/profile-route";
import { Home } from "./pages/Home";

const Docs = lazy(() => import("./pages/Docs").then(({ Docs }) => ({ default: Docs })));
const Profile = lazy(() => import("./pages/Profile").then(({ Profile }) => ({ default: Profile })));
const Resolver = lazy(() =>
  import("./pages/Resolver").then(({ Resolver }) => ({ default: Resolver })),
);
const Transparency = lazy(() =>
  import("./pages/Transparency").then(({ Transparency }) => ({
    default: Transparency,
  })),
);

const initialPath = window.location.pathname;
const initialDocsRoute = docsRouteFromPath(initialPath, window.location.hash);
const initialProfileRoute = profileRouteFromPath(initialPath);
const initialProfileLoad =
  initialProfileRoute?.kind === "profile"
    ? preloadPublicProfile(initialProfileRoute.did)
    : undefined;

function NotFound() {
  return (
    <section className="simple-page not-found">
      <div className="simple-page__inner">
        <span className="eyebrow">404</span>
        <h1>Record not found</h1>
        <p>The requested page is not part of the Vellum registry.</p>
        <a className="v-button v-button--primary" href="/">
          Return to Vellum
        </a>
      </div>
    </section>
  );
}

export function App() {
  const path = initialPath.replace(/\/$/, "") || "/";
  const docsRoute = initialDocsRoute;
  const profileRoute = initialProfileRoute;
  let page;

  if (docsRoute?.kind === "page") {
    page = <Docs page={docsRoute.page} />;
  } else if (docsRoute?.kind === "invalid") {
    page = <NotFound />;
  } else if (profileRoute?.kind === "index") {
    page = <Profile />;
  } else if (profileRoute?.kind === "profile") {
    page = <Profile did={profileRoute.did} initialLoad={initialProfileLoad} />;
  } else if (profileRoute?.kind === "invalid") {
    page = <Profile invalidPath />;
  } else
    switch (path) {
      case "/":
        page = <Home />;
        break;
      case "/resolve":
        page = <Resolver />;
        break;
      case "/transparency":
        page = <Transparency />;
        break;
      default:
        page = <NotFound />;
    }

  return (
    <SiteShell>
      <Suspense
        fallback={
          <section className="simple-page route-loading" aria-live="polite">
            <div className="simple-page__inner">
              <span className="eyebrow">Loading</span>
            </div>
          </section>
        }
      >
        {page}
      </Suspense>
    </SiteShell>
  );
}
