// Today's expedition as the page shows it (slice 8): core's three stops of the curated pool, each with the device's key of its world, the
// page it leads to, its name and why to go. The pool and the site's places ship with the page; nothing is asked of a server.
import { expeditionOf, hubWorldOf, REALM_PREFIX, stampKey, worldIdOf } from "@gnoworld/core";
import pool from "../../../data/expedition.json" with { type: "json" };
import { site } from "../../places.ts";

/** A world of the data files: a hub's or a station's slug, or a realm's path. */
export interface Named {
  readonly hub?: string | undefined;
  readonly realm?: string | undefined;
}

/** A stop of the day. */
export interface Stop {
  readonly id: string;
  /** The device's key of its world, as a stamp's. */
  readonly key: string;
  readonly name: string;
  readonly why: string;
  /** Its page: the hub's, else the realm's view. */
  readonly path: string;
}

/** The device's key of a named world of `universe`, and its page; none for a hub the site does not hold. */
export function worldOf(universe: string, { hub, realm }: Named): { key: string; path: string } | undefined {
  const view = site.universes.find((each) => each.id === universe);
  if (view === undefined) return undefined;
  const id = realm === undefined ? undefined : worldIdOf(realm);
  // A realm whose world is a hub's opens the hub's page, where its planet and its room are.
  const page = view.worlds.find((world) => (hub === undefined ? hubWorldOf(world) === id : world.slug === hub));
  if (page !== undefined) return { key: stampKey(universe, hubWorldOf(page)), path: page.path };
  if (realm === undefined || id === undefined) return undefined;
  const prefix = view.isDefault ? "" : `/net/${universe}`;
  return { key: stampKey(universe, id), path: `${prefix}/r/${realm.slice(REALM_PREFIX.length)}` };
}

/** The stops of `universe` on the UTC day `day`, in their order. */
export function stopsOn(universe: string, day: string): Stop[] {
  return expeditionOf(
    day,
    pool.filter((stop) => stop.universe === universe),
  ).flatMap((stop) => {
    const world = worldOf(universe, stop);
    return world === undefined ? [] : [{ id: stop.id, name: stop.name, why: stop.why, ...world }];
  });
}
