// The index the palette searches once it opens: the site's places, the worlds' file's systems and realms, and what the chips ask of each
// (the people now, the new, the active, the visited), read from what the page holds already. The compiler keeps it while the file, the
// people and the universe are the same, so a keystroke rebuilds nothing.
import { daysSince, hubWorldOf, isFresh } from "@gnoworld/core";
import { useState } from "react";
import { useApp } from "../../storeContext.tsx";
import { storeFor } from "../../lib/worldsStore.ts";
import { worldsFollowedIn } from "../follow/index.ts";
import { withRanks } from "./ranks.ts";
import { systemPath } from "../../cosmosAt.ts";
import type { AppState } from "../../store/index.ts";
import { visitedIn } from "../../lib/visits.ts";
import { site, type UniverseView } from "../../places.ts";
import { useWorldsFile } from "../../worldsFile.ts";
import { peopleItemsOf, roomItemsOf } from "./chatItems.ts";
import { activityOf, searchItemsOf, worldsItemsOf } from "./items.ts";
import { buildIndex, type SearchIndex } from "./searchIndex.ts";
import type { SearchItem } from "./types.ts";
import { useHere } from "../../useHere.ts";

type File = ReturnType<typeof useWorldsFile>;

// A place with what the people, the worlds' file and this device say of it.
interface Ground {
  universe: string;
  here: ReadonlyMap<string, number>;
  file: File;
  now: number;
  followed: ReadonlySet<string>;
}

function enriched(item: SearchItem, { universe, here, file, now, followed }: Ground) {
  const people = item.universe === universe && item.slug !== undefined ? here.get(item.slug) : undefined;
  const own = item.kind === "world" || item.kind === "station";
  const world = file?.find(({ id }) => id === item.world);
  const seen =
    own && item.world !== undefined
      ? {
          fresh: isFresh(daysSince(world?.seen, now), visitedIn(universe)(item.world)),
          visited: visitedIn(item.universe)(item.world),
          ...(followed.has(item.world) ? { followed: true as const } : {}),
          ...activityOf(world, now),
        }
      : {};
  return { ...item, ...(people === undefined ? {} : { here: people }), ...seen };
}

// What the chat knows while the palette is closed: nothing, so a line heard asks the palette for no pass.
const NO_CHAT: AppState["chat"] = { me: undefined, rooms: {}, listed: undefined };
const NO_DMS: AppState["dms"] = {};

/** The index, and the worlds' file and the people it was built from, which Discover reads too. */
export function useSearchItems(universe: UniverseView, open: boolean) {
  const [placed] = useState(() => searchItemsOf(site, hubWorldOf));
  const here = useHere(open);
  const worlds = useWorldsFile(open && universe.isDefault);
  const [now] = useState(Date.now);
  // The rooms the chat lists and follows and the people it knows, from the page's own state: typing asks for nothing.
  const chat = useApp((app) => (open ? app.chat : NO_CHAT));
  const dms = useApp((app) => (open ? app.dms : NO_DMS));
  const session = useApp((app) => app.login.session);
  // The worlds followed are the device's (the lenses and the bell read them there); a string keeps the selector's value equal.
  const follows = useApp((app) => worldsFollowedIn(app.device.follows, universe.id).join("\n"));
  const followed = new Set(follows === "" ? [] : follows.split("\n"));
  const places = placed.map((item) => enriched(item, { universe: universe.id, here, file: worlds, now, followed }));
  const rows = worlds === undefined ? [] : storeFor(worlds).rows;
  const index: SearchIndex = buildIndex([
    ...withRanks([...places, ...worldsItemsOf(worlds ?? [], { universe: universe.id, systemPath, now })], rows),
    ...roomItemsOf(chat.listed, chat.rooms, (world) => placed.find((item) => item.slug === world)?.name),
    ...peopleItemsOf(chat.rooms, Object.keys(dms), session.kind === "in" ? session.address : undefined),
  ]);
  const followedPlaces = index.places.map(({ item }) => item).filter((item) => item.followed === true);
  return { index, worlds, here, ranked: rows.length > 0, followedPlaces };
}
