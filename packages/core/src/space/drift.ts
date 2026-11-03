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

/** The arrival alone, into `out`: what the worlds are seen from, for the sky's cruise would leave them behind. */
export function glideAt(out: { x: number; y: number; z: number }, seconds: number): void {
  const along = -GLIDE * Math.exp(-seconds / SETTLE_SECONDS);
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

// The pace the worlds turn at among the stars, a share of their spin: slow, so the eye's sway reads as depth, the near worlds sliding past
// the far ones more than any turns (7d6).
const ORBIT_PACE = 0.2;

/** The clock every world turns by, bodies and points alike, `seconds` after the arrival: one place, so a world that becomes a body keeps
 * its place on its orbit. */
export const orbitTime = (seconds: number): number => seconds * ORBIT_PACE;

/** How far the eye sways at rest, in world units, across the view and up it (7d6): the near worlds slide past the far ones. */
export const SWAY = { across: 0.25, up: 0.12 } as const;
/** How far a mouse at the window's edge leans the view, in world units, across and up the stage (eye.ts): enough to part the motes from
 * the stars. */
export const LEAN = 3;
/** How far a mouse leans the eye at a system's arrival: half the home's, for the eye stands nearer what it looks at (7d3's review). */
export const ARRIVAL_LEAN = LEAN / 2;
/** The sway's four corners, across and up: what a view must hold with motion on. */
export const SWAY_CORNERS: readonly (readonly [number, number])[] = [
  [SWAY.across, SWAY.up],
  [SWAY.across, -SWAY.up],
  [-SWAY.across, SWAY.up],
  [-SWAY.across, -SWAY.up],
];
// A slow figure eight, so its speed never falls to nothing: a tenth of a unit or more in two seconds at its slowest.
const SWAY_SECONDS = 18;

/** The eye's sway `seconds` after it arrived, into `out`, along the view's own axes: none at the start. */
export function swayAt(out: { across: number; up: number }, seconds: number): void {
  const angle = (2 * Math.PI * seconds) / SWAY_SECONDS;
  out.across = SWAY.across * Math.sin(angle);
  out.up = SWAY.up * Math.sin(2 * angle);
}
