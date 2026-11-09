// What Discover reads of the worlds' file: the visits, and where a realm goes.
import { stampKey, type StoreRow } from "@gnoworld/core";
import type { Worlds } from "@gnoworld/schemas/indexer";
import { realmPage } from "../../../lib/realmPage.ts";
import { visitedIn } from "../../../lib/visits.ts";
import type { SearchItem } from "../types.ts";

/** The worlds of `universe` this device has visited, read once: a realm is visited when its world is. */
export const visitedWorlds = (universe: string, worlds: Worlds["worlds"]): ReadonlySet<string> =>
  new Set(worlds.map(({ id }) => id).filter(visitedIn(universe)));

/** The realm as the palette goes to it: its page. */
export const itemOf = (row: StoreRow, universe: string): SearchItem => ({
  name: row.path.replace(/^gno\.land\/r\//, ""),
  kind: "realm",
  universe,
  path: realmPage(row.path) ?? row.path,
  namespace: row.namespace,
  world: row.world,
});

/** The key by which this device follows the realm's world. */
export const followKey = (row: StoreRow, universe: string): string => stampKey(universe, row.world);
