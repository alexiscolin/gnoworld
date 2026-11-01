// The eye's way in (ADR-0002 §10, "A system is a postcard"; the brief's first seconds): it comes in from behind and slows, then never
// quite stops, so the layers keep moving apart. A pure function of the time, for the same second is the same place.
import type { Point } from "./cell.ts";

/** Where the eye rests on arrival: of the spots tried, warm clouds over the view's right and centre, and near-black under the hero. */
export const HOME: Point = { x: 700, y: 300, z: -1200 };

const GLIDE = 14;
const SETTLE_SECONDS = 2.5;
const CRUISE = 0.35;
// A unit, a little off the view's axis: straight ahead nothing crosses the frame.
const HEADING = { x: 0.31, y: 0.09, z: -0.9463 };

/** The offset from where the eye rests, `seconds` after it arrived, into `out`. */
export function driftAt(out: { x: number; y: number; z: number }, seconds: number): void {
  const along = CRUISE * seconds - GLIDE * Math.exp(-seconds / SETTLE_SECONDS);
  out.x = HEADING.x * along;
  out.y = HEADING.y * along;
  out.z = HEADING.z * along;
}
