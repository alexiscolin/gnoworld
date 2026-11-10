// A world's page: pre-rendered for each known world, at its path and at its canonical address; any other path gets this
// route's not-found. The world is found by the request's path as written: its case is part of the address (F376).
import { lazy, Suspense, useState, type ReactNode } from "react";
import { useLoaderData, useRouteError, type MetaArgs } from "react-router";
import { hubWorldOf } from "@gnoworld/core";
import { Kicker, Panel } from "@gnoworld/ui";
import stations from "../../data/earthOrbit.json" with { type: "json" };
import { failedWorldMeta, ORIGIN, worldMeta } from "../meta.ts";
import { pageOf, site, type UniverseView } from "../places.ts";
import { chatPlace, PlaceChat } from "../features/chat/index.ts";
import { isMissing, PageError } from "../features/errors/index.ts";
import { Arrival } from "../features/passport/Later.tsx";
import { useEntered, useLoaded, useSpace } from "../features/universe/index.ts";
import { WorldSigns } from "../features/universe/WorldSigns.tsx";
import { Arrival as Banners, type Ring } from "../features/world/index.ts";
import { pinnedBar } from "../features/world/PlateRealm.tsx";
import { chainKey, type ChainHeard } from "../store/chain.ts";
import { useApp } from "../storeContext.tsx";
import { PlaceFrame } from "./placeFrame.tsx";

// No call of the chain told yet: a room draws no card.
const NO_CALLS: readonly ChainHeard[] = [];

// The plate's blocks (routes/plate), in a chunk once the first screen has drawn.
const HubPlate = lazy(() => import("./plate/HubPlate.tsx"));

// A world's kind as its crumb says it (frames 22, 93, 104); a world the data says nothing of is a hub.
const KINDS: Record<string, string> = { hub: "Hub", dao: "DAO", dapp: "dApp", station: "Station" };
export function loader({ request }: { request: Request }) {
  return site.world(pageOf(request));
}

// The list ships with the client, so the browser fetches no world: an unknown path is a 404 here, not a request the
// static host answers with its fallback page. React Router 8.4.0 drops `caseSensitive` on the client: `site.world`
// reads the path itself.
export function clientLoader({ request }: { request: Request }) {
  return site.world(request);
}

export function meta({ loaderData, error }: MetaArgs<typeof loader>) {
  return loaderData || isMissing(error) ? worldMeta(loaderData) : failedWorldMeta();
}

// A station round the Earth (8l), by its world's slug: its name, its size and its project's own site.
const stationOf = (slug: string) => stations.find((station) => station.slug === slug);
type SiteWorld = ReturnType<typeof useLoaderData<typeof loader>>;

function useWorldSpace(world: SiteWorld) {
  // The chat comes once the door to space has: this page holds both, and the first screen's budget carries the door (budgets.spec.ts).
  return useSpace({ world: hubWorldOf(world), name: world.name });
}

// The plate's kicker: the world's genre when it has one, and its kind; the header's levels say where it is (the plan space-simple).
const kickerOf = (world: ReturnType<typeof site.world>) =>
  [...(world.genre === undefined ? [] : [world.genre]), KINDS[world.kind ?? "hub"] ?? "Hub"].join(" · ");

export default function World() {
  const world = useLoaderData<typeof loader>();
  const universe = site.home(world);
  // What the chain told of this world's realms, from its events alone, drawn among its main room's messages.
  const calls = useApp((app) => app.chainByWorld[chainKey(universe.id, world.slug)]);
  // The plate is the page and the chat a block under it on a phone, as the Earth's and a realm's (the proposal's section 5).
  const chat = {
    world: world.slug,
    place: chatPlace({ ...world, pinned: pinnedBar(world, universe), inPage: true }, universe),
    chain: { place: world, calls: calls ?? NO_CALLS },
  };
  return <PlaceChat chat={chat} page={(dock) => <WorldPage world={world} universe={universe} chat={dock} />} />;
}

function WorldPage({ world, universe, chat }: { world: SiteWorld; universe: UniverseView; chat: ReactNode }) {
  // The open proposal's ring round the planet, when the world takes votes (StatusRing.tsx).
  const [ring, setRing] = useState<Ring>();
  // A world's page is a place entered (ADR-0003 §4).
  useEntered();
  const chatDue = useWorldSpace(world);
  // The plate's chunk is asked once the page has loaded, never waiting for the door to space or the chat (the shapes stand till it comes).
  const loaded = useLoaded();
  // A station round the Earth (8l) keeps its project's own site a link on its page: its name round the Earth opens the page, never the site.
  const own = stationOf(world.slug)?.url;
  const address = ORIGIN + world.canonical;
  // The plate comes first in the page and the chat follows, so from 900 px the page reads and tabs as it is drawn; under 900 px
  // the chat is drawn above the plate (DESIGN-SYSTEM.md, Breakpoints: 900 px, chat first), and from 1728 px the plate stands fixed
  // at the left (Panel.Layout).
  return (
    <>
      <PlaceFrame
        ring={ring}
        label={world.name}
        plate={
          <>
            <Kicker planet>{kickerOf(world)}</Kicker>
            {/* The arrival banners (9h): nothing unless the server's signal says this account earned one. */}
            <Banners world={world.slug} name={world.name} address={address} />
            <Panel.Title>{world.name}</Panel.Title>
            <Suspense fallback={null}>
              {loaded && <HubPlate world={world} universe={universe} own={own} onRing={setRing} />}
            </Suspense>
          </>
        }
        chat={chat}
        chatDue={chatDue}
      />
      <WorldSigns world={hubWorldOf(world)} room={`#${world.slug}`} />
      <Arrival universe={universe.id} world={hubWorldOf(world)} name={world.name} path={world.path} />
    </>
  );
}

export function ErrorBoundary() {
  const missing = isMissing(useRouteError());
  // Inside the plate, as any page's content is: never loose at the screen's corner (D535).
  return (
    <PlaceFrame
      label="World"
      plate={
        missing ? (
          <PageError title="No world here" line="No world of gno.land goes by that name." />
        ) : (
          <PageError title="This world could not load" line="Try again in a moment." reload />
        )
      }
    />
  );
}
