// Today's expedition as the page shows it (slice 8): core's three stops of the curated pool, each with the device's key of its world, the
// page it leads to, its name and why to go. The pool and the site's places ship with the page; nothing is asked of a server.
import { expeditionOf, hubWorldOf, stampKey, worldIdOf } from "@gnoworld/core";
import pool from "../../../data/expedition.json" with { type: "json" };
import { realmView, site } from "../../places.ts";

/** A world of the data files: a hub's or a station's slug, or a realm's path. */
export interface Named {
  readonly hub?: string | undefined;
  readonly realm?: string | undefined;
}

/** A stop of the day. */
export interface Stop {
  readonly id: string;
  /** Its world's id, as the cosmos holds it. */
  readonly world: string;
  /** The device's key of its world, as a stamp's. */
  readonly key: string;
  readonly name: string;
  readonly why: string;
  /** Its page: the hub's, else the realm's view. */
  readonly path: string;
}

/** A named world of `universe`: its id as the cosmos holds it, the device's key and its page; none for a hub the site does not hold. */
export function worldOf(
  universe: string,
  { hub, realm }: Named,
): { id: string; key: string; path: string } | undefined {
  const view = site.universes.find((each) => each.id === universe);
  if (view === undefined) return undefined;
  const fromRealm = realm === undefined ? undefined : worldIdOf(realm);
  // A realm whose world is a hub's opens the hub's page, where its planet and its room are.
  const page = view.worlds.find((world) => (hub === undefined ? hubWorldOf(world) === fromRealm : world.slug === hub));
  if (page !== undefined) return { id: hubWorldOf(page), key: stampKey(universe, hubWorldOf(page)), path: page.path };
  if (realm === undefined || fromRealm === undefined) return undefined;
  return { id: fromRealm, key: stampKey(universe, fromRealm), path: realmView(realm, view) };
}

/** A world's display name in `universe`, the one the arrival's pill and the expedition both say: its hub's, else the name the expedition's
 * pool gives its realm; none for a world neither names. */
export function worldName(universe: string, world: string): string | undefined {
  const hub = site.universes.find((each) => each.id === universe)?.worlds.find((each) => hubWorldOf(each) === world);
  if (hub !== undefined) return hub.name;
  const stop = pool.find((each) => each.universe === universe && "realm" in each && worldIdOf(each.realm) === world);
  return stop !== undefined && "name" in stop ? stop.name : undefined;
}

/** The stops of `universe` on the UTC day `day`, in their order. */
export function stopsOn(universe: string, day: string): Stop[] {
  return expeditionOf(
    day,
    pool.filter((stop) => stop.universe === universe),
  ).flatMap((stop) => {
    const world = worldOf(universe, stop);
    const name = world === undefined ? undefined : worldName(universe, world.id);
    return world === undefined || name === undefined
      ? []
      : [{ id: stop.id, world: world.id, name, why: stop.why, key: world.key, path: world.path }];
  });
}
