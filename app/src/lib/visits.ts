// This reader's visits to the worlds (7h), which the device keeps as flags: what makes a new world no longer uncharted to them. Read by the
// cosmos's labels and a world's scene, and by the search drawer's signals left to find (8i).
import { readFlag } from "./flags.ts";

const VISITED = "gnoworld:visited:";

/** The flag of world `id` of `universe`, which a visit writes. */
export const visitKey = (universe: string, id: string) => `${VISITED}${universe}:${id}`;

/** Whether this reader has visited world `id` of `universe`: the device keeps it, or nothing does. */
export const visitedIn = (universe: string) => (id: string) => readFlag(visitKey(universe, id)) !== null;
