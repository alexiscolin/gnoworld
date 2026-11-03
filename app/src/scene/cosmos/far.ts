// How a body among the worlds takes the approved light (planet/): only where its star stands from the eye changes with the distance. From
// afar its whole disc reads, lit from the side its star stands on screen; up close it has its own angle, and its marked night side. A far
// one is also a little softer and dimmer, as frame 4's far worlds are, its light kept.
import { smoothstep } from "@gnoworld/core";
import type { Vector3 } from "three";
import { LIMB_LIGHT } from "../planet/planet.ts";

// Below this its star stands dead behind it or dead ahead: any side will do.
const ON_THE_AXIS = 1e-6;
const FAR_LIMB = 0.8;
// From up close to afar, in world units: a body's own angle and limb up to the first, frame 4's from the second.
const NEAR = 8;
const FAR = 26;
// A body this near is crisp, this far as soft and dim as it gets, and that is this much.
const CRISP = 14;
const SOFT = 60;
const SOFTEST = 0.45;

/** How far a far world's star stands from the eye, 65 degrees: f0004's worlds are lit across 0.68 to 0.72 of their width. */
export const FAR_ANGLE = 1.1344640137963142;

const farShare = (distance: number): number => smoothstep(NEAR, FAR, distance);

/** The star's angle from the eye at a distance: a world's own up close, coming round to `FAR_ANGLE` afar. */
export function angleAt(own: number, distance: number): number {
  return own + (FAR_ANGLE - own) * farShare(distance);
}

/** Where the eye rests, which says how a body takes its light: at the view at rest, at a system's view, or in a Plan, a chart. */
export type View = "rest" | "near" | "chart";

// A Plan's body, lit from its own star, turns no further than this from the eye: a fifth of its disc lit at the least (F4470).
const CHART_DARKEST = 2.2;

/** The star's angle from the eye for a body of a Plan, a chart: its own star's real one, `sun` from the body and `eye` towards it, a fifth
 * of its disc lit at the least (the design review's second pass, F4470). */
export const chartAngle = (sun: Vector3, eye: Vector3): number => Math.min(sun.angleTo(eye), CHART_DARKEST);

/** A world's limb at a distance: the Earth's band fits under a pixel on a far disc, and would read as a hard white line. */
export const limbAt = (distance: number): number => LIMB_LIGHT * (1 - FAR_LIMB * farShare(distance));

/** How soft and dim a body stands at a distance: none up close, `SOFTEST` afar (the planet's `faraway`). */
export const fadeAt = (distance: number): number => SOFTEST * smoothstep(CRISP, SOFT, distance);

// A system's view's world is crisp before its star and to this share of the eye's distance to it, then by degrees as soft and dim as the
// 14:09 mock-up's farthest, 70% of its light on the screen, which `faraway` 0.85 gives gnoswap's two farthest, at 1.33 and 1.35 (68% and
// 72%, measured; the mock-up's next, 85%, at 1.2) (F4468).
const BEHIND_CRISP = 1.05;
const BEHIND_SOFT = 1.35;
const BEHIND_SOFTEST = 0.85;

/** How soft and dim a world of a system's view stands at `distance` from the eye, its star `star` from it: as any body there, and more
 * by degrees behind its star. */
export const behindAt = (distance: number, star: number): number =>
  Math.max(fadeAt(distance), BEHIND_SOFTEST * smoothstep(BEHIND_CRISP * star, BEHIND_SOFT * star, distance));

/** The light of a world among others, written over `star`, a unit vector from the world: it stays on the side its star stands on screen, always
 * `angle` from `eye`, so it is lit as the Earth is wherever it sits round its star, never a black disc. */
export function sideOf(star: Vector3, eye: Vector3, angle: number): Vector3 {
  star.addScaledVector(eye, -star.dot(eye));
  if (star.lengthSq() < ON_THE_AXIS) star.set(1, 0, 0);
  return star.normalize().multiplyScalar(Math.sin(angle)).addScaledVector(eye, Math.cos(angle));
}
