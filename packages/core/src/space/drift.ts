// The eye's way in (ADR-0002 §10, "A system is a postcard"; the brief's first seconds): it comes in from behind and slows, then never
// quite stops, so the layers keep moving apart, and it looks slowly about, as the video's view pans. Pure functions of the time, for the
// same second is the same place.
import type { Point } from "./cell.ts";

/** Where the eye rests on arrival: of the spots tried, an amber cloud right of the middle, and near-black under the hero. */
export const HOME: Point = { x: 3300, y: 4100, z: -2200 };

const GLIDE = 14;
const SETTLE_SECONDS = 2.5;
const CRUISE = 0.6;
// The look about, a slow circle from straight ahead, so its speed never falls to nothing: about 15 px a second at 1728 px wide, the
// video's pan.
const TURN = 0.26;
const TURN_SECONDS = 150;
// A unit, a little off the view's axis: straight ahead nothing crosses the frame.
const HEADING = { x: 0.31, y: 0.09, z: -0.9463 };

/** The offset from where the eye rests, `seconds` after it arrived, into `out`. */
export function driftAt(out: { x: number; y: number; z: number }, seconds: number): void {
  const along = CRUISE * seconds - GLIDE * Math.exp(-seconds / SETTLE_SECONDS);
  out.x = HEADING.x * along;
  out.y = HEADING.y * along;
  out.z = HEADING.z * along;
}

/** The way the view looks, `seconds` after it arrived, into `out`, in radians. */
export function turnAt(out: { yaw: number; pitch: number }, seconds: number): void {
  const angle = (2 * Math.PI * seconds) / TURN_SECONDS;
  out.yaw = TURN * Math.sin(angle);
  out.pitch = TURN * (1 - Math.cos(angle));
}
