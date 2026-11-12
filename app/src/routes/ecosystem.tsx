// An ecosystem's page, from the data: /e/<slug> in the default universe, /net/<id>/e/<slug> in another.
// No `loader`: with no ecosystem in the data no page of this route is pre-rendered, and React Router refuses a build
// whose loader no page uses (ssr: false). The page reads its own path; the browser's loader answers the 404.
import { Breadcrumb } from "@gnoworld/ui";
import { useLocation, type MetaArgs } from "react-router";
import { ErrorView, isMissing, RouteError, useWhere } from "../features/errors/index.ts";
import { ecosystemMeta, failedPageMeta } from "../meta.ts";
import { site } from "../places.ts";

export function clientLoader({ request }: { request: Request }) {
  return site.ecosystem(request);
}

export function meta({ location, error }: MetaArgs) {
  if (error !== undefined && error !== null && !isMissing(error)) return failedPageMeta();
  return ecosystemMeta(site.ecosystemAt(location.pathname));
}

function Ecosystem() {
  const ecosystem = site.ecosystemAt(useLocation().pathname);
  const where = useWhere();
  if (ecosystem === undefined) return <ErrorView kind="not-found" noun="ecosystem" where={where} />;
  const universe = site.home(ecosystem);
  return (
    <>
      <Breadcrumb
        label="You are here"
        items={[
          { label: universe.name, href: universe.home.path },
          { label: "Earth", href: universe.earth.path },
          { label: ecosystem.name },
        ]}
      />
      <h1>{ecosystem.name}</h1>
      <p>{ecosystem.description}</p>
    </>
  );
}

export default Ecosystem;

// What the page is while the browser's loader has not run: the page itself, which needs no data of it. It is what the build
// writes, since a route with a client loader and no loader is written as its fallback.
export function HydrateFallback() {
  return <Ecosystem />;
}

export function ErrorBoundary() {
  return <RouteError noun="ecosystem" />;
}
