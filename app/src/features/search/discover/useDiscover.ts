// What Discover holds while it is open: the shelf, the filters, the sort and the realm chosen, and the rows they give. The store is built
// once for the worlds' file, and the ground (who is here, what this device visited) once for the people and the visits: a filter or a sort
// is one pass over the rows.
import {
  defaultFilters,
  shelfRows,
  sortRows,
  STYLES,
  todayOf,
  type FilterId,
  type Ground,
  type ShelfId,
  type SortId,
  type StoreRow,
  type View,
} from "@gnoworld/core";
import type { Worlds } from "@gnoworld/schemas/indexer";
import { useState } from "react";
import { storeFor } from "../../../lib/worldsStore.ts";
import { visitedWorlds } from "./realms.ts";

/** A shelf of realms, or the worlds the reader follows. */
export type Shelf = ShelfId | "following";
export const SHELF_IDS: readonly Shelf[] = [
  "today",
  "trending",
  "new",
  "live",
  "gems",
  "unseen",
  "following",
  ...STYLES.map(({ id }) => id),
  "visited",
];

export function useDiscover(
  worlds: Worlds["worlds"],
  { here, universe, following }: { here: ReadonlyMap<string, number>; universe: string; following: number },
) {
  // The compiler keeps each of these while its inputs stand: the store for the file, the ground for the people and the visits.
  const store = storeFor(worlds);
  const visited = visitedWorlds(universe, worlds);
  const ground: Ground = { here: (row) => here.get(row.world) ?? 0, visited: (row) => visited.has(row.world) };
  const [shelf, setShelf] = useState<Shelf>("today");
  const [filters, setFilters] = useState<ReadonlySet<FilterId>>(defaultFilters);
  const [sort, setSort] = useState<SortId>("trend");
  const [picked, setPicked] = useState<number>();
  const view: View = { filters, ground };
  const choose = (row: StoreRow | undefined) => {
    setPicked(row?.id);
  };
  return {
    store,
    ground,
    shelf,
    filters,
    sort,
    counts: new Map(SHELF_IDS.map((id) => [id, id === "following" ? following : shelfRows(store, id, view).length])),
    today: todayOf(store, view),
    list: shelf === "following" ? [] : sortRows(shelfRows(store, shelf, view), sort),
    picked: picked === undefined ? undefined : store.rows[picked],
    show: (id: Shelf) => {
      setShelf(id);
    },
    toggle: (id: FilterId) => {
      setFilters((now) => {
        const next = new Set(now);
        if (!next.delete(id)) next.add(id);
        return next;
      });
    },
    order: setSort,
    choose,
  };
}

export type Discovery = ReturnType<typeof useDiscover>;
