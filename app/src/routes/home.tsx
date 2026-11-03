// A universe's cosmos: the home for the default one (/), its own page for another (/net/<id>/).
import events from "../../data/events.json" with { type: "json" };
import news from "../../data/news.json" with { type: "json" };
import { type MetaArgs, useLoaderData, useNavigate } from "react-router";
import { isMissing, PlaceError } from "../features/errors/index.ts";
import { Hero, Ticker, tickerItems, useClock, Worlds } from "../features/home/index.ts";
import { PlaceLinks } from "../features/list/index.ts";
import { useSpace, useWorldsCount } from "../features/universe/index.ts";
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
  const now = useClock();
  const navigate = useNavigate();
  // Universes are never shown together: the worlds' file is the default one's, and its count the cosmos's (7d6). The number reads that count,
  // whether the scene runs or not (7n), from a few bytes of its own, so a phone asks nothing of the cosmos before View in space (7n2).
  const drawn = useWorldsCount(universe.isDefault);
  // The rail beside the cosmos (7i) links its worlds to their pages, the Earth's and the hubs' as this page lists them, through the router.
  const rail = {
    open: (href: string) => {
      Promise.resolve(navigate(href)).catch(reportError);
    },
    places: { earth: universe.earth.path, worlds: universe.worlds },
  };
  useSpace(universe.isDefault ? "cosmos" : undefined, universe.isDefault ? rail : undefined);
  return (
    <>
      <Hero
        universe={universe}
        worlds={universe.isDefault ? (drawn ?? undefined) : universe.worlds.length}
        coming={drawn === undefined}
      />
      <Worlds>
        <PlaceLinks places={universe.worlds} />
      </Worlds>
      <Ticker items={tickerItems(news, events, now)} />
    </>
  );
}

// Every route catches its own errors (docs/ARCHITECTURE.md; F329); the app may be what failed, so the
// way home loads the document again (F325).
export function ErrorBoundary() {
  return <PlaceError what="universe" />;
}
