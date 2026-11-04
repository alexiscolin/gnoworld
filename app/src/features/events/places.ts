// Where an event happens, as the calendar and the bell show it: its world's name and page in the universe the reader is in; the Earth's own.
import { site, type UniverseView } from "../../places.ts";

const EARTH = "earth";

/** The world `slug` of `universe` as a place: its name and page; none for a slug the universe does not list. */
export function placeOf(universe: UniverseView, slug: string): { name: string; href: string } | undefined {
  if (slug === EARTH) return { name: "Earth", href: universe.earth.path };
  const world = universe.worlds.find((each) => each.slug === slug);
  return world === undefined ? undefined : { name: world.name, href: world.path };
}

/** The universe the page at `pathname` is in. */
export const universeAt = (pathname: string): UniverseView => site.universeAt(pathname);
