// A universe's cosmos: the home for the default one (/), its own page for another (/net/<id>/).
import { Link, type MetaArgs, useLoaderData } from "react-router";
import { isMissing, PlaceError } from "../features/errors/index.ts";
import { PlaceLinks } from "../features/list/index.ts";
import { failedPageMeta, homeMeta, missingUniverseMeta } from "../meta.ts";
import { pageOf, site } from "../places.ts";

// The data ships with the client, so the browser fetches nothing: an unknown universe is a 404 here, and the path's
// case is checked (F376).
export function loader({ request }: { request: Request }) {
  return site.universe(pageOf(request), "cosmos");
}
export function clientLoader({ request }: { request: Request }) {
  return site.universe(request, "cosmos");
}

export function meta({ loaderData, error }: MetaArgs<typeof loader>) {
  if (loaderData) return homeMeta(loaderData);
  return isMissing(error) ? missingUniverseMeta() : failedPageMeta();
}

export default function Home() {
  const universe = useLoaderData<typeof loader>();
  return (
    <>
      <h1>{universe.isDefault ? "gno.world" : universe.name}</h1>
      <p>
        <Link to={universe.earth.path}>Earth</Link> · <Link to="/list">Places</Link>
      </p>
      <PlaceLinks places={universe.worlds} />
    </>
  );
}

// Every route catches its own errors (docs/ARCHITECTURE.md; F329); the app may be what failed, so the
// way home loads the document again (F325).
export function ErrorBoundary() {
  return <PlaceError what="universe" />;
}
