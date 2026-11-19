// A flight's goal that moves on its way (the page lays its circle out, the home's goal turns from the system to the Earth close): the flight
// goes over to the new end over a moment, sooner as it lands, never in one frame, and ends exactly on the goal.
import type { Pose } from "./pose.ts";

// How long a move of the goal takes to be made, in seconds, at the flight's start.
const GOAL_TAU = 0.5;

/** The share of a move of the goal still to make after `seconds`, `along` of the flight made: none once it landed. */
export const keepOf = (seconds: number, along: number): number =>
  along >= 1 ? 0 : Math.exp(-seconds / (GOAL_TAU * (1 - along) + 1e-3));

/** `to`, the end the flight flies to, goes the share of the way to `now`, the goal read this frame, that is not `keep`: its look, its way and its
 * distance (its up and field of view weigh with the share flown, and follow it). */
export function approach(to: Pose, now: Pose, keep: number): void {
  const share = 1 - keep;
  to.look.x += (now.look.x - to.look.x) * share;
  to.look.y += (now.look.y - to.look.y) * share;
  to.look.z += (now.look.z - to.look.z) * share;
  to.way.x += (now.way.x - to.way.x) * share;
  to.way.y += (now.way.y - to.way.y) * share;
  to.way.z += (now.way.z - to.way.z) * share;
  const length = Math.hypot(to.way.x, to.way.y, to.way.z) || 1;
  to.way.x /= length;
  to.way.y /= length;
  to.way.z /= length;
  to.distance += (now.distance - to.distance) * share;
  Object.assign(to.up, now.up);
  to.fov = now.fov;
}
