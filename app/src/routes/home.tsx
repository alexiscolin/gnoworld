// A universe's cosmos: the home for the default one (/), its own page for another (/net/<id>/).
import { PHONE_QUERY } from "@gnoworld/core";
import { Suspense, useLayoutEffect } from "react";
import { type MetaArgs, useLoaderData, useLocation } from "react-router";
import { cosmosAt, isHome } from "../cosmosAt.ts";
import { isMissing, RouteError } from "../features/errors/index.ts";
import { Hero, usePeople, Worlds, type People } from "../features/home/index.ts";
import { PlaceLinks } from "../features/list/index.ts";
import { useMedia } from "../features/chat/useMedia.ts";
import { SpaceFoot } from "../features/universe/SpaceFoot.tsx";
import { returning, RETURN_AFTER, riseChrome } from "../features/universe/rise.ts";
import { useMapView } from "../mapView.ts";
import { LazyRail } from "../features/universe/railLazy.ts";
import { SpaceLoader } from "../features/universe/SpaceLoader.tsx";
import {
  sameKind,
  useNewcomer,
  useResting,
  useRestingWorlds,
  useSpace,
  useWorldsCount,
} from "../features/universe/index.ts";
import { nameOf } from "../placeName.ts";
import { failedPageMeta, homeMeta, missingUniverseMeta } from "../meta.ts";
import { pageOf, site, type UniverseView } from "../places.ts";
import place from "./globe.module.css";
import { AimTag } from "./aimTag.tsx";
import { useFraming } from "./placeFrame.tsx";

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

// The share of what the first screen awaits that is done: the worlds' count read (or ended with none), then the first frame.
const loadedShare = (frame: boolean, worlds: number | null | undefined): number =>
  frame ? 1 : worlds === undefined ? 0 : 0.5;

// What stands over space on the default universe's home: the first load's loader till space has drawn its first frame (or 2.5 s on; a
// return finds it drawn, and no loader), the rail of worlds, and its foot (SpaceFoot.tsx).
function OverSpace({
  universe,
  drawn,
  worlds,
}: {
  universe: UniverseView;
  drawn: boolean;
  worlds: number | null | undefined;
}) {
  // The rail is a computer's (Rail.module.css): a phone mounts none, nor reads the worlds' file for it.
  const phone = useMedia(PHONE_QUERY);
  return (
    <>
      <SpaceLoader waiting={!drawn} ready={loadedShare(drawn, worlds)} />
      {phone ? null : (
        <Suspense fallback={null}>
          <LazyRail places={{ earth: universe.earth.path, worlds: universe.worlds }} universe={universe.id} />
        </Suspense>
      )}
      <SpaceFoot />
    </>
  );
}

// The home's first screen on a computer (D459): the Earth close at the bottom right and its "Start here" tag (none from above, where the
// Earth is not framed); no figures column (D489). The box stands from the first render, so the door to space marks it drawn as it goes
// home, and shows once the page frames it so.
function FirstScreen({ to, people }: { to: string; people: People | undefined }) {
  const framed = useFraming(`not ${PHONE_QUERY}`);
  const map = useMapView();
  return (
    <div
      className={place["arrival"]}
      data-globe
      data-arrival="waiting"
      data-flown="landed"
      data-framing={framed ? "arrival" : undefined}
    >
      {framed && !map ? <AimTag to={to} people={people === "coming" ? undefined : people} /> : null}
    </div>
  );
}

// A system's name on the hero: the Earth's as the header says it (D501), another's as its namespace.
const systemTitle = (id: string): string => (isHome(id) ? "gno.land" : nameOf(id));

export default function Home() {
  const universe = useLoaderData<typeof loader>();
  // Universes are never shown together: the worlds' file is the default one's, and its count the cosmos's (7d6). The number reads that count,
  // whether the scene runs or not (7n), from a few bytes of its own, so a phone asks nothing of the cosmos before View in space (7n2).
  const drawn = useWorldsCount(universe.isDefault);
  const drawnSpace = useSpace(universe.isDefault ? "cosmos" : undefined);
  // Back from a page's flight, the hero and the list rise in again instead of standing there cut in.
  useLayoutEffect(() => {
    if (returning() && !sameKind()) riseChrome(RETURN_AFTER);
  }, []);
  // A system the eye rests at names itself in the hero, in the number's place, its tags lighting its own worlds; the list of worlds gives
  // way, and comes back at rest.
  const resting = useResting();
  const restingWorlds = useRestingWorlds(resting);
  // Who is online on the relay (8i): the default universe's rooms alone, so another universe's hero counts its worlds.
  const people = usePeople(universe.isDefault);
  // The first visit's one filled call is the Earth's "Start here", which only the default universe's cosmos labels (ADR-0003 §3).
  const newcomer = useNewcomer();
  // The home's own address alone, never the galaxy's nor a system's, which are its page too.
  const { pathname } = useLocation();
  const first = universe.isDefault && cosmosAt(pathname) === undefined;
  return (
    <>
      {universe.isDefault ? <OverSpace universe={universe} drawn={drawnSpace} worlds={drawn} /> : null}
      {first ? <FirstScreen to={universe.earth.path} people={people} /> : null}
      <Hero
        universe={universe}
        worlds={universe.isDefault ? (drawn ?? undefined) : universe.worlds.length}
        people={people}
        coming={drawn === undefined}
        newcomer={universe.isDefault && newcomer}
        system={resting === undefined ? undefined : { id: resting, name: systemTitle(resting), worlds: restingWorlds }}
      />
      {resting === undefined ? (
        <Worlds>
          <PlaceLinks places={universe.worlds} />
        </Worlds>
      ) : null}
    </>
  );
}

// Every route catches its own errors (docs/ARCHITECTURE.md; F329); the app may be what failed, so the
// way home loads the document again (F325).
export function ErrorBoundary() {
  return <RouteError noun="universe" />;
}
