// The eye's way in (ADR-0002 §10, "A system is a postcard"; the brief's first seconds): it comes in from behind and slows, then never
// quite stops, so the layers keep moving apart, and it looks slowly about, as the video's view pans. Pure functions of the time, for the
// same second is the same place.
import type { Point } from "./cell.ts";

/** Where the eye rests on arrival: of the spots tried, amber wisps up the middle of the view, and near-black under the hero. */
export const HOME: Point = { x: 2900, y: 4400, z: -1800 };

const GLIDE = 14;
const SETTLE_SECONDS = 2.5;
const CRUISE = 0.6;
// A slow look to each side and a smaller one up and down, in radians and seconds: 0.4° a second at most, about the video's pan.
const YAW = 0.175;
const YAW_SECONDS = 150;
const PITCH = 0.044;
const PITCH_SECONDS = 110;
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
  out.yaw = YAW * Math.sin((2 * Math.PI * seconds) / YAW_SECONDS);
  out.pitch = PITCH * Math.sin((2 * Math.PI * seconds) / PITCH_SECONDS);
}
