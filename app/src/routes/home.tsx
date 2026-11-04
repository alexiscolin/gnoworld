// A universe's cosmos: the home for the default one (/), its own page for another (/net/<id>/).
import events from "../../data/events.json" with { type: "json" };
import news from "../../data/news.json" with { type: "json" };
import onAir from "../../data/onAir.json" with { type: "json" };
import { type MetaArgs, useLoaderData, useNavigate } from "react-router";
import { isMissing, PlaceError } from "../features/errors/index.ts";
import {
  Hero,
  ledByTrends,
  Ticker,
  tickerItems,
  trendItems,
  withOnAir,
  useClock,
  usePeople,
  useTrends,
  Worlds,
} from "../features/home/index.ts";
import { PlaceLinks } from "../features/list/index.ts";
import { useNewcomer, useResting, useSpace, useWorldsCount } from "../features/universe/index.ts";
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

// What is on air in `universe` (8i): a line of one of its worlds leads to that world's page, another to its own site; a world the page does
// not list leaves its line out.
function onAirOf(universe: ReturnType<typeof useLoaderData<typeof loader>>) {
  return onAir.flatMap(
    (row: { id: string; universe: string; title: string; hub?: string; link?: string; until?: string }) => {
      if (row.universe !== universe.id) return [];
      const link = row.hub === undefined ? row.link : universe.worlds.find(({ slug }) => slug === row.hub)?.path;
      return link === undefined ? [] : [{ id: row.id, title: row.title, link, until: row.until }];
    },
  );
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
  // A system the eye rests at takes the screen, its crumb at the top left (7v): the hero and the list of worlds there give way, and come back
  // at rest.
  const resting = useResting();
  // Who is online on the relay (8i): the default universe's rooms alone, so another universe's hero counts its worlds.
  const people = usePeople(universe.isDefault);
  // The first visit's one filled call is the Earth's "Start here", which only the default universe's cosmos labels (ADR-0003 §3).
  const newcomer = useNewcomer();
  // The chain's trends lead the ticker (7t), the default universe's alone: the server's worlds job reads no other.
  const trends = trendItems(
    useTrends(universe.isDefault),
    { earth: universe.earth.path, worlds: universe.worlds },
    now,
  );
  return (
    <>
      {resting === undefined ? (
        <Hero
          universe={universe}
          worlds={universe.isDefault ? (drawn ?? undefined) : universe.worlds.length}
          people={people}
          coming={drawn === undefined}
          newcomer={universe.isDefault && newcomer}
        />
      ) : null}
      {resting === undefined ? (
        <Worlds>
          <PlaceLinks places={universe.worlds} />
        </Worlds>
      ) : null}
      <Ticker items={ledByTrends(trends, withOnAir(tickerItems(news, events, now), onAirOf(universe), now))} />
    </>
  );
}

// Every route catches its own errors (docs/ARCHITECTURE.md; F329); the app may be what failed, so the
// way home loads the document again (F325).
export function ErrorBoundary() {
  return <PlaceError what="universe" />;
}
