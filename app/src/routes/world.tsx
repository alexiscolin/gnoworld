// A world's page: pre-rendered for each known world, at its path and at its canonical address; any other path gets this
// route's not-found. The world is found by the request's path as written: its case is part of the address (F376).
import { lazy, Suspense, useState } from "react";
import { useLoaderData, useNavigate, useRouteError, useSearchParams, type MetaArgs } from "react-router";
import { hubWorldOf, stampKey } from "@gnoworld/core";
import { Breadcrumb, Panel, Stack } from "@gnoworld/ui";
import stations from "../../data/earthOrbit.json" with { type: "json" };
import { failedWorldMeta, worldMeta } from "../meta.ts";
import { pageOf, realmView, site } from "../places.ts";
import { Chat, chatPlace, LOADING } from "../features/chat/index.ts";
import { isMissing, PageError } from "../features/errors/index.ts";
import { Arrival } from "../features/passport/Later.tsx";
import { OutLinks } from "../features/realms/OutLinks.tsx";
import { platePreview } from "../features/previews/plate.ts";
import { useEntered, useSpace } from "../features/universe/index.ts";
import { Actions, Activity, Here, type Ring } from "../features/world/index.ts";
import { useHours, type Hours } from "../features/world/useHours.ts";
import { useAppStore } from "../storeContext.tsx";
import { useWorldsFile } from "../worldsFile.ts";
import place from "./globe.module.css";
import styles from "./world.module.css";

// A world with a realm reads its proposals in a chunk of its own, after the page has hydrated: no other world pays for it.
const Proposals = lazy(() => import("../features/world/Proposals.tsx"));
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

// What the world's planet in space needs of the page: its store and router for the moons, the room it shows, and its realm's ring; a station's
// page, its station in the planet's place.
function useWorldSpace(world: ReturnType<typeof site.world>, universe: string, ring: Ring | undefined) {
  const station = stationOf(world.slug);
  const store = useAppStore();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const page = {
    store,
    open: (href: string) => {
      Promise.resolve(navigate(href, { preventScrollReset: true })).catch(reportError);
    },
    universe,
    slug: world.slug,
    path: world.path,
    room: params.get("room"),
    ring,
    ...(station === undefined ? {} : { station: { name: station.name, size: station.size } }),
  };
  // The chat comes once the door to space has: this page holds both, and the first screen's budget carries the door (budgets.spec.ts).
  return useSpace({ world: hubWorldOf(world), name: world.name }, page);
}

// The messages an hour now, when the server counts some: a quiet world draws no "0 /h", as nobody counted holds no place (Alexis,
// 2026-11-03, "retire le vide"); its activity's words say it.
const paceOf = (hours: Hours | undefined) =>
  hours?.now === undefined || hours.now === null || hours.now <= 0 ? undefined : hours.now;

// The crumb's steps (frames 22, 93, 104): the universe, a link to its cosmos, the world's genre when it has one, and its kind.
const crumbOf = (world: ReturnType<typeof site.world>, home: string) => [
  { label: "Universe", href: home },
  ...(world.genre === undefined ? [] : [{ label: world.genre }]),
  { label: KINDS[world.kind ?? "hub"] ?? "Hub" },
];

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
  const [ring, setRing] = useState<Ring>();
  // A world's page is a place entered (ADR-0003 §4).
  useEntered();
  const chatDue = useWorldSpace(world, universe.id, ring);
  const realm = world.realms?.[0];
  const prefix = universe.isDefault ? "" : `/net/${universe.id}`;
  const realmPath = realm === undefined ? undefined : realmView(realm, universe);
  // Who is here names a hub by its slug: its rooms' world (7h).
  const hours = useHours(world.slug);
  const preview = platePreview(world.realms, universe);
  // A station round the Earth (8l) keeps its project's own site a link on its page: its name round the Earth opens the page, never the site.
  const own = stationOf(world.slug)?.url;
  // The plate comes first in the page and the chat follows, so from 900 px the page reads and tabs as it is drawn; under 900 px
  // the chat is drawn above the plate (DESIGN-SYSTEM.md, Breakpoints: 900 px, chat first), and from 1728 px the plate stands fixed
  // at the left (Panel.Layout).
  return (
    <>
      {/* The planet's place: the page lays it out, the scene draws in it (frames 22, 93, 104). */}
      <div className={place["globe"]} data-globe data-world="waiting" data-flown="landed" />
      <Panel.Layout
        plate={
          <Panel label={world.name} look="plate" caption="gnoworld · hub atlas">
            <Panel.Body>
              <Stack>
                <Breadcrumb label="You are here" items={crumbOf(world, universe.home.path)} />
                <h1>{world.name}</h1>
                <p>{world.description}</p>
                <OutLinks links={[{ label: "Website", href: own }]} />
                {/* Who is here comes from the chat once it has connected; the rate and the day's history from the server's hours. */}
                <Here perHour={paceOf(hours)} />
                <Activity hours={hours} />
                {/* Frame 26 stands the actions 30 px under the words over them (world.module.css). */}
                <div className={styles["actions"]}>
                  <Actions
                    place={{ name: world.name, path: world.canonical }}
                    follow={stampKey(universe.id, hubWorldOf(world))}
                    room={`#${world.slug}`}
                    {...(realmPath === undefined ? {} : { proposals: realmPath })}
                  />
                </div>
                {realmPath === undefined ? null : (
                  <Suspense fallback={null}>
                    <Proposals path={realmPath} onRing={setRing} />
                  </Suspense>
                )}
                <FromTheFile world={world} realmPath={realmPath} prefix={prefix} />
                {/* Last on the plate, as frame 26 draws it: the world's page, captured. */}
                {preview === undefined ? null : (
                  <Suspense fallback={null}>
                    <Preview path={preview} look="plate" />
                  </Suspense>
                )}
              </Stack>
            </Panel.Body>
          </Panel>
        }
      >
        <div id="chat" className={styles["chat"]}>
          {chatDue ? <Chat world={world.slug} place={chatPlace(world, universe)} /> : LOADING}
        </div>
      </Panel.Layout>
      <Arrival universe={universe.id} world={hubWorldOf(world)} name={world.name} path={world.path} />
    </>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const missing = isMissing(error);
  return missing ? (
    <PageError title="No world here" line="No world of gno.land goes by that name." />
  ) : (
    <PageError title="This world could not load" line="Try again in a moment." reload />
  );
}
