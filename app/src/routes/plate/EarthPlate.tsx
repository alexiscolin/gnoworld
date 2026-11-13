// The Earth's plate (slice 13, D567): the adapter that gives the model what the chat knows of a universe's general room, who is here, from
// how many countries, the messages an hour and the latest on X, with no block of the chain.
import { EARTH as EARTH_ID, stampKey } from "@gnoworld/core";
import { EARTH_CHAT as EARTH } from "../../features/chat/index.ts";
import { LatestOnX } from "../../features/home/LatestOnX.tsx";
import { useHours } from "../../features/world/useHours.ts";
import { DOCS, explorerLink } from "../../lib/chain/explorer.ts";
import { useQuery } from "@tanstack/react-query";
import { peopleOptions } from "../../features/home/peopleQuery.ts";
import { queryClient } from "../../lib/query/client.ts";
import type { UniverseView } from "../../places.ts";
import { useApp } from "../../storeContext.tsx";
import { own } from "../../store/record.ts";
import { useHere } from "../../useHere.ts";
import rooms from "../../../data/earthRooms.json" with { type: "json" };
import universes from "../../../data/universes.json" with { type: "json" };
import { chatFigures, countriesWidget, hourWidgets, roomsWidget, statusOf } from "./figures.ts";
import type { PlateModel } from "./model.ts";
import { Plate } from "./Plate.tsx";

// Frame 40's three links out: the universe's gnoweb, its explorer and the docs.
function earthLinks(universe: string) {
  const chain = universes.find((each) => each.id === universe);
  return [
    { label: "View on gnoweb", href: chain?.gnoweb },
    { label: "Explorer", href: chain === undefined ? undefined : explorerLink(chain.chainId) },
    { label: "Docs", href: DOCS },
  ];
}

function useEarthPlate(universe: UniverseView): PlateModel {
  const here = useHere(true).get(EARTH.slug) ?? 0;
  const hours = useHours(EARTH.slug);
  // No read of the people (another universe's, or none came): no Countries figure; a read of none is a zero, and shows.
  const countries = useQuery({ ...peopleOptions, enabled: universe.isDefault }, queryClient).data?.countries;
  const lines = useApp((state) => own(state.chat.rooms, "#earth")?.lines);
  return {
    // The title is the route's; the line comes after the status, as a realm's does (the proposal's phone).
    lede: { sentence: EARTH.description, status: statusOf(here, "Quiet") },
    // Frame 40: the Earth's plate says hi in its general room, and follows and shares as a world's does.
    actions: {
      place: { name: "Earth", path: universe.earth.canonical },
      follow: stampKey(universe.id, EARTH_ID),
      say: "Say hi in #general",
      room: "#earth",
    },
    figures: { figures: chatFigures({ here, countries, hours }) },
    hours,
    extras: <LatestOnX />,
    links: earthLinks(universe.id),
    widgets: [...hourWidgets(hours), ...roomsWidget(rooms), ...countriesWidget(lines ?? [], hours?.from)],
  };
}

/** The Earth's plate: its adapter and its blocks, in one chunk. */
export default function EarthPlate({ universe }: { universe: UniverseView }) {
  return <Plate model={useEarthPlate(universe)} />;
}
