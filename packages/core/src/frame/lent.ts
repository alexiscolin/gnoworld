// What the view at rest's chunk lends the chunk that lays a system's dynamic view's rocks (part 7p): its own functions, handed over at run
// time, so that chunk imports nothing that lives only with the view at rest and the bundler splits nothing out of it.
import { evenRow } from "./composition.ts";
import { drawnOf } from "./postcard.ts";
import { cameraTowards, focalOf, looksFrom, placeOf, swayed } from "./restLook.ts";

/** The view at rest's functions the rocks' chunk reads a view with. */
export const LENT = { cameraTowards, drawnOf, evenRow, focalOf, looksFrom, placeOf, swayed };
export type Lent = typeof LENT;
