// A hub world's plate (slice 13, D567): the adapter that gives the model what the chat knows of a world, who is here and its hours, and
// what the worlds' file says of its realm, with no block of its own chain reads. Its proposals, the calls its team pins and the capture of
// its page stand between the chart and the foot, as they did.
import { hubWorldOf, stampKey } from "@gnoworld/core";
import universes from "../../../data/universes.json" with { type: "json" };
import { grouped } from "@gnoworld/ui";
import { lazy, Suspense } from "react";
import { OutLinks } from "../../OutLinks.tsx";
import { platePreview } from "../../features/previews/plate.ts";
import { FirstCharted } from "../../features/world/Arrival.tsx";
import { Proposed } from "../../features/world/PlateRealm.tsx";
import type { Ring } from "../../features/world/statusRing.ts";
import { useHours } from "../../features/world/useHours.ts";
import { realmView, site, universePrefix, type UniverseView } from "../../places.ts";
import { useHere } from "../../useHere.ts";
import { useWorldsFile } from "../../worldsFile.ts";
import { aroundOf } from "./around.ts";
import { chatFigures, hourWidgets, statusOf } from "./figures.ts";
import type { PlateModel } from "./model.ts";
import { Plate } from "./Plate.tsx";

// A world's page's capture (8f, frame 26), its own chunk too: the captures' file and the page's drawing come after the first screen.
const Preview = lazy(async () => ({ default: (await import("../../features/previews/Preview.tsx")).Preview }));

type World = ReturnType<typeof site.world>;

// What only a hub has: its site, its proposals and pinned calls, and the capture of its page, last, as frame 26 draws it.
function HubExtras({
  world,
  universe,
  own,
  realmPath,
  onRing,
}: {
  world: World;
  universe: UniverseView;
  own: string | undefined;
  realmPath: string | undefined;
  onRing: (ring: Ring | undefined) => void;
}) {
  const preview = platePreview(world.realms, universe);
  return (
    <>
      <OutLinks links={[{ label: "Website", href: own }]} />
      <Proposed world={world} realmPath={realmPath} universe={universe} onRing={onRing} />
      {preview === undefined ? null : (
        <Suspense fallback={null}>
          <Preview path={preview} look="plate" />
        </Suspense>
      )}
    </>
  );
}

const noteOf = (realm: string | undefined) =>
  realm === undefined ? "No realm of this world is charted on this network yet." : undefined;

function useHubPlate({
  world,
  universe,
  own,
  onRing,
}: {
  world: World;
  universe: UniverseView;
  /** The project's own site, for a station round the Earth. */
  own: string | undefined;
  onRing: (ring: Ring | undefined) => void;
}): PlateModel {
  const realm = world.realms?.[0];
  const prefix = universePrefix(universe);
  const chainId = universes.find(({ id }) => id === universe.id)?.chainId;
  const realmPath = realm === undefined ? undefined : realmView(realm, universe);
  const worlds = useWorldsFile(true);
  const here = useHere(true).get(world.slug) ?? 0;
  const hours = useHours(world.slug);
  return {
    lede: {
      ...(realm === undefined || chainId === undefined
        ? {}
        : { explain: { kind: "world", chain: chainId, subject: realm } }),
      sentence: (
        <>
          {world.description}
          <FirstCharted world={world.slug} />
        </>
      ),
      status: statusOf(here, "Quiet"),
    },
    actions: {
      place: { name: world.name, path: world.canonical },
      follow: stampKey(universe.id, hubWorldOf(world)),
      room: `#${world.slug}`,
      ...(realmPath === undefined ? {} : { proposals: realmPath }),
    },
    // Who is here comes from the chat once it has connected; the rate and the day's history from the server's hours.
    figures: { figures: chatFigures({ here, hours }), note: noteOf(realm) },
    hours,
    extras: <HubExtras world={world} universe={universe} own={own} realmPath={realmPath} onRing={onRing} />,
    around: aroundOf(worlds, { id: hubWorldOf(world), centre: world.name, hubs: universe.worlds, prefix }),
    widgets: [
      ...(world.realms === undefined ? [] : [{ label: "Realms", value: grouped(world.realms.length) }]),
      ...hourWidgets(hours),
    ],
    explorer: realmPath === undefined ? undefined : { view: realmPath, worlds },
  };
}

/** A hub world's plate: its adapter and its blocks, in one chunk. */
export default function HubPlate(props: Parameters<typeof useHubPlate>[0]) {
  return <Plate model={useHubPlate(props)} />;
}
