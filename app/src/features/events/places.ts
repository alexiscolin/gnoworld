// Where an event happens, as the calendar and the bell show it: its world's name and page in the universe the reader is in; the Earth's own.
// The place itself is the site's (places.ts), which the home's ticker reads on the first screen.
import { site, type UniverseView } from "../../places.ts";

export { placeOf } from "../../places.ts";

/** The universe the page at `pathname` is in. */
export const universeAt = (pathname: string): UniverseView => site.universeAt(pathname);
