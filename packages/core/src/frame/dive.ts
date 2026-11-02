// The home's dive (7d7; Alexis, 2026-11-02): from the whole cosmos down to the view at rest in a few seconds, the Earth ahead all the way.
// A pure path from the eye it ends on: its distance eased in its log, so the Earth grows at an even pace and lands with no snap, its slant
// and its turn eased with it. A flight can take it too (7g).
import { EARTH_PLACE } from "../cosmos/system.ts";
import type { Point } from "../space/cell.ts";
import { lerp, smootherstep } from "../space/smooth.ts";
import { DEGREE, eyeInto } from "./restLook.ts";

/** Its timings, in seconds: the whole cosmos fading in, the way down; under reduced motion the cosmos held still, then its dissolve; and
 * how long the home waits for the whole cosmos before it gives the dive up. */
export const DIVE = { fade: 0.8, seconds: 5.5, hold: 1.6, dissolve: 1.2, wait: 4 } as const;

// Where it starts: past the distance from which the whole cosmos holds the view (space/whole.ts), high over the disc so the disc reads as
// one, a little round from where it ends so the near worlds slide past the far ones.
const FROM = 1000;
const SLANT = 35 * DEGREE;
const TURN = 40 * DEGREE;

const terms = { distance: 0, slant: 0, turn: 0 };

/** The eye `along` the dive, from 0 at its start to 1 on `rest`, the view at rest's eye, on the map, into `out`. */
export function diveAt(rest: Point, along: number, out: { x: number; y: number; z: number }): void {
  // A clock it cannot read keeps it at its start.
  const left = 1 - smootherstep(along > 0 ? Math.min(along, 1) : 0);
  const across = rest.x - EARTH_PLACE.x;
  const upward = rest.y - EARTH_PLACE.y;
  const ahead = rest.z - EARTH_PLACE.z;
  const distance = Math.hypot(across, upward, ahead);
  terms.distance = distance * (FROM / distance) ** left;
  terms.slant = lerp(Math.asin(upward / distance), SLANT, left);
  terms.turn = Math.atan2(across, ahead) + TURN * left;
  eyeInto(terms, out);
}
