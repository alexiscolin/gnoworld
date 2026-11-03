// What the search lends the chunk that adds the view at rest's depth (part 7p): its own functions, handed over at run time, so that chunk
// imports nothing that lives only with the search and the bundler splits nothing out of it (a split chunk cost the search 420 B of lost
// compression, and the cosmos 28 B to name it).
import { composed, evenRow, twins } from "./composition.ts";
import { drawnOf, postcardOf } from "./postcard.ts";
import { rowOnTheWayDown } from "./restDive.ts";
import { cameraTowards, focalOf, looksFrom, placeOf, swayed } from "./restLook.ts";

/** The search's functions the depth's chunk reads the view with. */
export const LENT = {
  cameraTowards,
  composed,
  drawnOf,
  evenRow,
  focalOf,
  looksFrom,
  placeOf,
  postcardOf,
  rowOnTheWayDown,
  swayed,
  twins,
};
export type Lent = typeof LENT;
