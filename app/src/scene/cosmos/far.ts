// How a body among the worlds takes the approved light (planet/): only where its star stands from the eye changes with the distance. From
// afar its whole disc reads, lit from the side its star stands on screen; up close it has its own angle, and its marked night side.
import { SPREAD, spreadAt } from "@gnoworld/core";
import type { Vector3 } from "three";
import { LIMB_LIGHT } from "../planet/planet.ts";

// Below this its star stands dead behind it or dead ahead: any side will do.
const ON_THE_AXIS = 1e-6;
const FAR_LIMB = 0.8;

/** How far a far world's star stands from the eye, 65 degrees: f0004's worlds are lit across 0.68 to 0.72 of their width. */
export const FAR_ANGLE = 1.1344640137963142;

const farShare = (distance: number): number => (spreadAt(distance) - 1) / (SPREAD - 1);

/** The star's angle from the eye at a distance: a world's own up close, coming round to `FAR_ANGLE` as a system opens. */
export function angleAt(own: number, distance: number): number {
  return own + (FAR_ANGLE - own) * farShare(distance);
}

/** A world's limb at a distance: the Earth's band fits under a pixel on a far disc, and would read as a hard white line. */
export const limbAt = (distance: number): number => LIMB_LIGHT * (1 - FAR_LIMB * farShare(distance));

/** The light of a world among others, written over `star`, a unit vector from the world: it stays on the side its star stands on screen, always
 * `angle` from `eye`, so it is lit as the Earth is wherever it sits round its star, never a black disc. */
export function sideOf(star: Vector3, eye: Vector3, angle: number): Vector3 {
  star.addScaledVector(eye, -star.dot(eye));
  if (star.lengthSq() < ON_THE_AXIS) star.set(1, 0, 0);
  return star.normalize().multiplyScalar(Math.sin(angle)).addScaledVector(eye, Math.cos(angle));
}
