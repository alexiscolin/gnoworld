// What the indexer says of each place for the sorts Discover has (core's): a world's or a system's is its realms' together, a realm's its own.
import { compareRanks, type Rank, type SortId, type StoreRow } from "@gnoworld/core";
import type { SearchItem } from "./types.ts";

const top = (values: readonly (number | null)[]): number | null => {
  const some = values.filter((each) => each !== null);
  return some.length === 0 ? null : Math.max(...some);
};

// ponytail: callers add up across realms, so one caller of two realms counts twice; the file holds no per-world callers.
function together(name: string, path: string, rows: readonly StoreRow[]): Rank | undefined {
  if (rows.length === 0) return undefined;
  return {
    name,
    path,
    calls: rows.reduce((sum, row) => sum + row.calls, 0),
    callers: rows.reduce((sum, row) => sum + row.callers, 0),
    lastHeight: top(rows.map((row) => row.lastHeight)),
    rise: top(rows.map((row) => row.rise)),
    firstHeight: null,
  };
}

const grouped = (rows: readonly StoreRow[], by: (row: StoreRow) => string): Map<string, StoreRow[]> => {
  const groups = new Map<string, StoreRow[]>();
  for (const row of rows) {
    const key = by(row);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return groups;
};

/** The items with their rank: a world or a station by the realms of its world, a system by its namespace's, a realm by its own. */
export function withRanks(items: readonly SearchItem[], rows: readonly StoreRow[]): SearchItem[] {
  const ofWorld = grouped(rows, (row) => row.world);
  const ofNamespace = grouped(rows, (row) => row.namespace);
  const ofPath = grouped(rows, (row) => row.path);
  return items.map((item) => {
    const own =
      item.kind === "system"
        ? ofNamespace.get(item.name)
        : item.kind === "realm"
          ? ofPath.get(`gno.land/r/${item.name}`)
          : item.world === undefined
            ? undefined
            : ofWorld.get(item.world);
    const rank = together(item.name, item.path, own ?? []);
    return rank === undefined ? item : { ...item, rank, realmCount: own?.length ?? 0 };
  });
}

/** The places in the order of one of Discover's sorts, by the ranks of their realms: those with no realm last, then by name. */
export function sortPlaces(items: readonly SearchItem[], sort: SortId): SearchItem[] {
  const byName = (a: SearchItem, b: SearchItem) => a.name.localeCompare(b.name);
  return items.toSorted((a, b) => {
    if (sort === "az" || a.rank === undefined || b.rank === undefined)
      return (sort === "az" ? 0 : Number(b.rank !== undefined) - Number(a.rank !== undefined)) || byName(a, b);
    return compareRanks(sort)(a.rank, b.rank) || byName(a, b);
  });
}
