// What the page tells space of a world's words (D546, D549): its display name, and how many are here in it now, from the page's one
// reading of presence (useHere.ts, held while space shows), never a second one; none while unknown.
import { hubOf, nameOf } from "../../placeName.ts";
import { presentIn } from "../../useHere.ts";

/** How many are here in the world `id` now: none while unknown, or for a world with no hub. */
function hereIn(id: string): number | undefined {
  const hub = hubOf(id);
  return hub === undefined ? undefined : presentIn(hub.slug);
}

export const labelWords = { name: nameOf, fact: hereIn };
