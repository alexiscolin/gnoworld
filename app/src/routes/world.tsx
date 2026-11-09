// A world's page: pre-rendered for each known world, at its path and at its canonical address; any other path gets this
// route's not-found. The world is found by the request's path as written: its case is part of the address (F376).
import { lazy, Suspense, useState, type ReactNode } from "react";
import { useLoaderData, useRouteError, type MetaArgs } from "react-router";
import { hubWorldOf, stampKey } from "@gnoworld/core";
import { Kicker } from "@gnoworld/ui";
import stations from "../../data/earthOrbit.json" with { type: "json" };
import { failedWorldMeta, ORIGIN, worldMeta } from "../meta.ts";
import { pageOf, realmView, site, universePrefix, type UniverseView } from "../places.ts";
import { chatPlace, ChainCallsContext, ChainPlaceContext, LOADING, PlaceChat } from "../features/chat/index.ts";
import { isMissing, PageError } from "../features/errors/index.ts";
import { Arrival } from "../features/passport/Later.tsx";
import { OutLinks } from "../features/realms/OutLinks.tsx";
import { platePreview } from "../features/previews/plate.ts";
import { useEntered, useSpace } from "../features/universe/index.ts";
import { WorldSigns } from "../features/universe/WorldSigns.tsx";
import { Actions, Activity, Arrival as Banners, Crowd, FirstCharted, type Ring } from "../features/world/index.ts";
import { pinnedBar, Proposed } from "../features/world/PlateRealm.tsx";
import { useHours } from "../features/world/useHours.ts";
import { chainKey, type ChainHeard } from "../store/chain.ts";
import { useApp } from "../storeContext.tsx";
import { useWorldsFile } from "../worldsFile.ts";
import { PlaceFrame } from "./placeFrame.tsx";
import styles from "./world.module.css";

// No call of the chain told yet: a room draws no card.
const NO_CALLS: readonly ChainHeard[] = [];

// What the worlds' file says of this world, its links and its realm, comes in a chunk once the file has: the first screen holds neither.
const Linked = lazy(() => import("../features/world/Linked.tsx"));
const FromExplorer = lazy(() => import("../features/realms/FromExplorer.tsx"));

// A world's kind as its crumb says it (frames 22, 93, 104); a world the data says nothing of is a hub.
const KINDS: Record<string, string> = { hub: "Hub", dao: "DAO", dapp: "dApp", station: "Station" };
// A world's page's capture (8f, frame 26), its own chunk too: the captures' file and the page's drawing come after the first screen.
const Preview = lazy(async () => ({ default: (await import("../features/previews/Preview.tsx")).Preview }));

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

// What the worlds' file says of this world, once it has come: its connected worlds, then its realm's card (8f's Preview between them).
function FromTheFile({
  world,
  realmPath,
  prefix,
}: {
  world: ReturnType<typeof site.world>;
  realmPath: string | undefined;
  prefix: string;
}) {
  const worlds = useWorldsFile(true);
  const universe = site.home(world);
  return (
    <>
      {/* No file, or an empty one, links no world: the rows' code is not asked. */}
      {worlds === undefined || worlds.length === 0 ? null : (
        <Suspense fallback={null}>
          <Linked id={hubWorldOf(world)} worlds={worlds} hubs={universe.worlds} prefix={prefix} />
        </Suspense>
      )}
      {/* The Preview card (8f, frames 26 and 104) stands here, between the connected worlds and the realm's card. */}
      {/* The card's room is held while its code and its read come, so nothing under it moves as it lands. */}
      {realmPath === undefined ? null : (
        <div className={styles["realm"]}>
          <Suspense fallback={null}>
            <FromExplorer view={realmPath} worlds={worlds} />
          </Suspense>
        </div>
      )}
    </>
  );
}

export default function World() {
  const world = useLoaderData<typeof loader>();
  const universe = site.home(world);
  const chat = { world: world.slug, place: chatPlace({ ...world, pinned: pinnedBar(world, universe) }, universe) };
  return <PlaceChat chat={chat} page={(dock) => <WorldPage world={world} universe={universe} chat={dock} />} />;
}

function WorldPage({ world, universe, chat }: { world: SiteWorld; universe: UniverseView; chat: ReactNode }) {
  // The open proposal's ring round the planet, when the world takes votes (StatusRing.tsx).
  const [ring, setRing] = useState<Ring>();
  // A world's page is a place entered (ADR-0003 §4).
  useEntered();
  const chatDue = useWorldSpace(world);
  const realm = world.realms?.[0];
  const prefix = universePrefix(universe);
  const realmPath = realm === undefined ? undefined : realmView(realm, universe);
  // Who is here names a hub by its slug: its rooms' world (7h).
  const hours = useHours(world.slug);
  const preview = platePreview(world.realms, universe);
  // A station round the Earth (8l) keeps its project's own site a link on its page: its name round the Earth opens the page, never the site.
  const own = stationOf(world.slug)?.url;
  const address = ORIGIN + world.canonical;
  const calls = useApp((app) => app.chainByWorld[chainKey(universe.id, world.slug)]);
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
            <Kicker dot="world">{kickerOf(world)}</Kicker>
            {/* The arrival banners (9h): nothing unless the server's signal says this account earned one. */}
            <Banners world={world.slug} name={world.name} address={address} />
            <h1>{world.name}</h1>
            <p>
              {world.description}
              <FirstCharted world={world.slug} />
            </p>
            <OutLinks links={[{ label: "Website", href: own }]} />
            <Actions
              place={{ name: world.name, path: world.canonical }}
              follow={stampKey(universe.id, hubWorldOf(world))}
              room={`#${world.slug}`}
              {...(realmPath === undefined ? {} : { proposals: realmPath })}
            />
            {/* Who is here comes from the chat once it has connected; the rate and the day's history from the server's hours. */}
            <Crowd
              world={world.slug}
              {...(realm === undefined ? { note: "No realm of this world is charted on this network yet." } : {})}
            />
            <Activity hours={hours} />
            <Proposed world={world} realmPath={realmPath} universe={universe} onRing={setRing} />
            <FromTheFile world={world} realmPath={realmPath} prefix={prefix} />
            {/* Last on the plate, as frame 26 draws it: the world's page, captured. */}
            {preview === undefined ? null : (
              <Suspense fallback={null}>
                <Preview path={preview} look="plate" />
              </Suspense>
            )}
          </>
        }
      >
        {/* What the chain told of this world's realms, from its events alone, drawn among its main room's messages. */}
        <ChainPlaceContext value={world}>
          <ChainCallsContext value={calls ?? NO_CALLS}>
            <div id="chat" className={styles["chat"]}>
              {chatDue ? chat : LOADING}
            </div>
          </ChainCallsContext>
        </ChainPlaceContext>
      </PlaceFrame>
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
    >
      {null}
    </PlaceFrame>
  );
}
