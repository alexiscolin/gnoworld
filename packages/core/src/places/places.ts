// The places of the data files and their addresses (slice 5's 5c; docs/decisions.md, 2026-10-29): in every universe the
// cosmos and the Earth, then its worlds (the hubs) and its ecosystems. A place has the path its page lives at,
// the default universe's unprefixed, and one canonical address, always under /net/<universe>.
import { worldRoute } from "./route.ts";

export type PlaceKind = "cosmos" | "earth" | "world" | "ecosystem";

export interface Place {
  kind: PlaceKind;
  universe: string;
  /** The place's name in its path: a world's or an ecosystem's, none for the cosmos and the Earth. */
  slug?: string;
  path: string;
  canonical: string;
}

interface Row {
  slug: string;
  universe: string;
}

/** What the places need of the files: the schemas' rows carry more. */
export interface PlaceSource {
  defaultUniverse: string;
  universes: { id: string }[];
  hubs: Row[];
  ecosystems: Row[];
}

/** Every place, universe by universe; throws on a universe, a world or an ecosystem the files name twice or name wrong. */
export function placesOf(source: PlaceSource): Place[] {
  const universes = new Set<string>();
  for (const { id } of source.universes) {
    if (universes.has(id)) throw new RangeError(`places: two universes named "${id}"`);
    universes.add(id);
  }
  if (!universes.has(source.defaultUniverse))
    throw new RangeError(`places: the default universe "${source.defaultUniverse}" is not listed`);

  const places: Place[] = [];
  const add = (place: { kind: PlaceKind; universe: string; slug?: string; route: string }) => {
    const { kind, universe, slug, route } = place;
    const base = universe === source.defaultUniverse ? "" : `/net/${universe}`;
    const at = (prefix: string) => (route === "/" ? `${prefix}/` : `${prefix}${route}`);
    places.push({
      kind,
      universe,
      ...(slug === undefined ? {} : { slug }),
      path: base === "" ? route : at(base),
      canonical: at(`/net/${universe}`),
    });
  };
  for (const universe of universes) {
    add({ kind: "cosmos", universe, route: "/" });
    add({ kind: "earth", universe, route: "/earth" });
  }
  const named = (rows: Row[], kind: PlaceKind, taken: Set<string>) => {
    for (const { slug, universe } of rows) {
      if (!universes.has(universe))
        throw new RangeError(`places: ${kind} "${slug}" is in "${universe}", which is not listed`);
      const key = `${universe}/${slug}`;
      if (taken.has(key)) throw new RangeError(`places: two ${kind}s named "${slug}" in "${universe}"`);
      taken.add(key);
      add({ kind, universe, slug, route: kind === "world" ? worldRoute(slug) : `/e/${slug}` });
    }
  };
  const worlds = new Set<string>();
  named(source.hubs, "world", worlds);
  named(source.ecosystems, "ecosystem", new Set());
  return places;
}

// The index sits on the list itself, under a symbol: no state of the module's own outlives the list (F412).
const INDEX = Symbol("placeAt's index");
type Indexed = readonly Place[] & { [INDEX]?: Map<string, Place> };

/** The place a path or a canonical address names, exactly as written (a world's path is lower case: no folding here).
 * The index is built on a list's first lookup and kept on it (a list is not changed after): a lookup costs one Map read, however many
 * places there are. */
export function placeAt(places: readonly Place[], path: string): Place | undefined {
  const list: Indexed = places;
  let index = list[INDEX];
  if (index === undefined) {
    index = new Map();
    for (const place of places) {
      index.set(place.path, place);
      index.set(place.canonical, place);
    }
    Object.defineProperty(list, INDEX, { value: index });
  }
  return index.get(path);
}
