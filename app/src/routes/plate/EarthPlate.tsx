// The Earth's plate (slice 13, D567): the adapter that gives the model what the chat knows of a universe's general room, who is here, from
// how many countries, the realms deployed in 24 h, the messages an hour and the latest on X, with no block of the chain.
import { EARTH as EARTH_ID, stampKey } from "@gnoworld/core";
import { EARTH_CHAT as EARTH } from "../../features/chat/index.ts";
import { LatestOnX } from "../../features/home/LatestOnX.tsx";
import { OutLinks } from "../../features/realms/OutLinks.tsx";
import { useEarthChain } from "../../features/world/useEarthChain.ts";
import { useHours } from "../../features/world/useHours.ts";
import { DOCS, explorerLink } from "../../lib/chain/explorer.ts";
import { useLateRead } from "../../lateRead.ts";
import type { UniverseView } from "../../places.ts";
import { useHere } from "../../useHere.ts";
import universes from "../../../data/universes.json" with { type: "json" };
import { chatFigures, hourWidgets, statusOf } from "./figures.ts";
import type { PlateModel } from "./model.ts";
import { Plate } from "./Plate.tsx";

// The people's read is the home's own (8i), in its chunk; the default universe's rooms only.
const readPeople = (_: string, signal: AbortSignal) =>
  import("../../features/home/people.ts").then((people) => people.readPeople({ signal }));

// Frame 40's three links out: the universe's gnoweb, its explorer and the docs.
function EarthLinks({ universe }: { universe: string }) {
  const chain = universes.find((each) => each.id === universe);
  return (
    <OutLinks
      links={[
        { label: "View on gnoweb", href: chain?.gnoweb },
        { label: "Explorer", href: chain === undefined ? undefined : explorerLink(chain.chainId) },
        { label: "Docs", href: DOCS },
      ]}
    />
  );
}

function useEarthPlate(universe: UniverseView): PlateModel {
  // The Earth's room is followed for the page, which has no chat of its own to follow it.
  useEarthChain();
  const here = useHere(true).get(EARTH.slug) ?? 0;
  const hours = useHours(EARTH.slug);
  const countries = useLateRead(universe.isDefault ? "people" : undefined, readPeople)?.countries ?? 0;
  return {
    // The title and its line are the route's, on the first screen: the lede holds its marks.
    lede: { status: statusOf(here, "Quiet") },
    // Frame 40: the Earth's plate says hi in its general room, and follows and shares as a world's does.
    actions: {
      place: { name: "Earth", path: universe.earth.canonical },
      follow: stampKey(universe.id, EARTH_ID),
      say: "Say hi in #general",
      room: "#earth",
    },
    figures: { figures: chatFigures({ here, countries, hours }) },
    hours,
    extras: (
      <>
        <LatestOnX />
        <EarthLinks universe={universe.id} />
      </>
    ),
    widgets: hourWidgets(hours),
  };
}

/** The Earth's plate: its adapter and its blocks, in one chunk. */
export default function EarthPlate({ universe }: { universe: UniverseView }) {
  return <Plate model={useEarthPlate(universe)} />;
}
