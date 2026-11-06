// A universe's cosmos: the home for the default one (/), its own page for another (/net/<id>/).
import events from "../../data/events.json" with { type: "json" };
import news from "../../data/news.json" with { type: "json" };
import onAir from "../../data/onAir.json" with { type: "json" };
import { lazy, Suspense, useEffect } from "react";
import { type MetaArgs, useLoaderData, useNavigate } from "react-router";
import { setCosmosChat, useCosmosChat } from "../cosmosChat.ts";
import { isMissing, PlaceError } from "../features/errors/index.ts";
import {
  Hero,
  ledByTrends,
  Ticker,
  tickerItems,
  trendItems,
  withChain,
  withOnAir,
  useClock,
  usePeople,
  useTrends,
  Worlds,
} from "../features/home/index.ts";
import type { CalendarEvent } from "../lib/coming.ts";
import { PlaceLinks } from "../features/list/index.ts";
import { useNewcomer, useResting, useSpace, useWorldsCount } from "../features/universe/index.ts";
import { useEarthChain } from "../features/world/useEarthChain.ts";
import { failedPageMeta, homeMeta, missingUniverseMeta } from "../meta.ts";
import { pageOf, placeOf, site } from "../places.ts";
import { useApp, useAppStore } from "../storeContext.tsx";

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

// The chat's dock over the cosmos (frame 143), a chunk asked when the header's Chat first opens it.
const CosmosChat = lazy(() => import("../features/universe/CosmosChat.tsx"));

// The calendar's events, each with its world's name in `universe` (frame 6's "Dev help · AMA …").
const placed = (universe: ReturnType<typeof useLoaderData<typeof loader>>) =>
  events.map((event: CalendarEvent) => ({
    ...event,
    place: event.world === undefined ? undefined : placeOf(universe, event.world)?.name,
  }));

export default function Home() {
  const universe = useLoaderData<typeof loader>();
  const now = useClock();
  const navigate = useNavigate();
  // Universes are never shown together: the worlds' file is the default one's, and its count the cosmos's (7d6). The number reads that count,
  // whether the scene runs or not (7n), from a few bytes of its own, so a phone asks nothing of the cosmos before View in space (7n2).
  const drawn = useWorldsCount(universe.isDefault);
  // The rail beside the cosmos (7i) links its worlds to their pages, the Earth's and the hubs' as this page lists them, through the router.
  const store = useAppStore();
  const rail = {
    open: (href: string) => {
      Promise.resolve(navigate(href)).catch(reportError);
    },
    places: { earth: universe.earth.path, worlds: universe.worlds },
    follows: { store, universe: universe.id },
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
  const chatOpen = useCosmosChat();
  // Leaving the cosmos shuts its dock: another page holds its own chat, or none.
  useEffect(
    () => () => {
      setCosmosChat(false);
    },
    [],
  );
  const trends = trendItems(
    useTrends(universe.isDefault),
    { earth: universe.earth.path, worlds: universe.worlds },
    now,
  );
  // The chain's newest deploys of this universe lead the news and events (slice 9g).
  const deploys = useApp((app) => app.deploys);
  useEarthChain();
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
      {chatOpen ? (
        <Suspense fallback={null}>
          <CosmosChat universe={universe} />
        </Suspense>
      ) : null}
      <Ticker
        items={ledByTrends(
          trends,
          withOnAir(
            withChain(tickerItems(news, placed(universe), now), {
              deploys,
              universe: universe.id,
              prefix: universe.isDefault ? "" : `/net/${universe.id}`,
            }),
            onAirOf(universe),
            now,
          ),
        )}
      />
    </>
  );
}

// Every route catches its own errors (docs/ARCHITECTURE.md; F329); the app may be what failed, so the
// way home loads the document again (F325).
export function ErrorBoundary() {
  return <PlaceError what="universe" />;
}
