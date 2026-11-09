// The index the palette searches once it opens: the site's places, the worlds' file's systems and realms, and what the chips ask of each
// (the people now, the new, the active, the visited), read from what the page holds already. The compiler keeps it while the file, the
// people and the universe are the same, so a keystroke rebuilds nothing.
import { daysSince, hubWorldOf, isFresh } from "@gnoworld/core";
import { useState } from "react";
import { systemPath } from "../../cosmosAt.ts";
import { visitedIn } from "../../lib/visits.ts";
import { site, type UniverseView } from "../../places.ts";
import { useWorldsFile } from "../../worldsFile.ts";
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
}

function enriched(item: SearchItem, { universe, here, file, now }: Ground) {
  const people = item.universe === universe && item.slug !== undefined ? here.get(item.slug) : undefined;
  const own = item.kind === "world" || item.kind === "station";
  const world = file?.find(({ id }) => id === item.world);
  const seen =
    own && item.world !== undefined
      ? {
          fresh: isFresh(daysSince(world?.seen, now), visitedIn(universe)(item.world)),
          visited: visitedIn(item.universe)(item.world),
          ...activityOf(world, now),
        }
      : {};
  return { ...item, ...(people === undefined ? {} : { here: people }), ...seen };
}

/** The index, and the worlds' file and the people it was built from, which Discover reads too. */
export function useSearchItems(universe: UniverseView, open: boolean) {
  const [placed] = useState(() => searchItemsOf(site, hubWorldOf));
  const here = useHere(open);
  const worlds = useWorldsFile(open && universe.isDefault);
  const [now] = useState(Date.now);
  const places = placed.map((item) => enriched(item, { universe: universe.id, here, file: worlds, now }));
  const index: SearchIndex = buildIndex([
    ...places,
    ...worldsItemsOf(worlds ?? [], { universe: universe.id, systemPath, now }),
  ]);
  return { index, worlds, here };
}
