// How a crowd of worlds is drawn (ADR-0002 §3): a lattice of this many slots or fewer draws every world as a planet; a bigger one only its
// `CLEAR_BODIES` most used, and every other world is grain in its belt. Apart from the system's module, which the page that says it need not load.
import { stepOf } from "./cosmos.ts";

export const CROWD_SLOTS = 32;
export const CLEAR_BODIES = 3;

/** How many of `count` worlds a system draws as planets; the others are grain, a speck of their own place in its belt. */
export function planetCount(count: number): number {
  return stepOf(count + (count >> 1)) <= CROWD_SLOTS ? count : Math.min(count, CLEAR_BODIES);
}
