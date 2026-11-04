// What the search lends the chunk that adds the view at rest's depth (part 7p): its own functions, handed over at run time, so that chunk
// imports nothing that lives only with the search and the bundler splits nothing out of it (a split chunk cost the search 420 B of lost
// compression, and the cosmos 28 B to name it).
import { atOneHeight, composed, evenRow } from "./composition.ts";
import { glowsAt } from "./halo.ts";
import { drawnOf, postcardOf } from "./postcard.ts";
import { instantsOf } from "./restCards.ts";
import { rowOnTheWayDown } from "./restDive.ts";
import { cameraTowards, focalOf, looksFrom, placeOf, swayed } from "./restLook.ts";

/** The search's functions the depth's chunk reads the view with. */
export const LENT = {
  atOneHeight,
  cameraTowards,
  composed,
  drawnOf,
  evenRow,
  focalOf,
  glowsAt,
  instantsOf,
  looksFrom,
  placeOf,
  postcardOf,
  rowOnTheWayDown,
  swayed,
};
export type Lent = typeof LENT;
