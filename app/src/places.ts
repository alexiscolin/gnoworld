// The places and worlds the app knows, from the data files (slice 5's 5c; the bundle holds a copy of app/data's lists,
// which the build's config checked first: GNOWORLD_DATA names another directory, vite.config.ts). The worlds are those
// of the default universe, whose pages are unprefixed; the other universes' pages come with 5d.
import { placeAt } from "@gnoworld/core";
import { data } from "react-router";
import ecosystems from "../data/ecosystems.json" with { type: "json" };
import hubs from "../data/hubs.json" with { type: "json" };
import stations from "../data/stations.json" with { type: "json" };
import universes from "../data/universes.json" with { type: "json" };
import { placesFrom } from "./dataPlaces.ts";

export interface World {
  slug: string;
  name: string;
  description: string;
  /** Its one address on the site: its links, its pre-rendered page and its canonical. */
  path: string;
}

const PLACES = placesFrom({ universes, hubs, ecosystems, stations });
const ROWS = new Map([...hubs, ...stations].map((row) => [`${row.universe}/${row.slug}`, row]));

export const WORLDS: readonly World[] = PLACES.flatMap(({ kind, universe, slug, path }) => {
  const row = kind === "world" && !path.startsWith("/net/") ? ROWS.get(`${universe}/${String(slug)}`) : undefined;
  return row === undefined ? [] : [{ slug: row.slug, name: row.name, description: row.description, path }];
});

/** The world a path names; throws React Router's 404 when none has that name. */
export function findWorld(slug: string | undefined): World {
  const place = slug === undefined ? undefined : placeAt(PLACES, `/w/${slug}`);
  const world = WORLDS.find((each) => each.path === place?.path);
  if (!world) throw data(null, { status: 404 });
  return world;
}

export function worldPath(world: World): string {
  return world.path;
}
