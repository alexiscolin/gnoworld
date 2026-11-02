// Where a world's star stands: one place for the Earth's light and for every generated world's, so they are lit the same way (frame 39: the
// star far round to one side, about half the sphere in night, a bright limb and a halo on the side the light falls).
import { between, seedShare, SPREAD, spreadAt } from "@gnoworld/core";
import { Vector3 } from "three";

const POLE = new Vector3(0, 1, 0);
// A generated world's star stands this far from the eye, in radians: about the Earth's 69 degrees and a little past it, so the frames' third to a half of the disc is night.
const FROM_EYE = [1.2, 1.55] as const;
const LATITUDE = [-0.3, 0.34] as const;
const HALF_PI = Math.PI / 2;
// Below this its star stands dead behind it or dead ahead: any side will do.
const ON_THE_AXIS = 1e-6;

/** The star `latitude` over the equator and `azimuth` round the pole, in the ground's sense: the Earth's own sun, 69 degrees right of the eye at rest. */
export function starAt(latitude: number, azimuth: number, out: Vector3): Vector3 {
  return out.set(Math.cos(latitude), Math.sin(latitude), 0).applyAxisAngle(POLE, azimuth);
}

/** How far a far world's star stands from the eye: the frames' bodies read as whole discs, each lit a little off the eye. */
export const FAR_ANGLE = 0.72;

/** The star's angle from the eye at a distance: a world's own close up, with its marked night side, coming round to `FAR_ANGLE` as a system opens. */
export function angleAt(own: number, distance: number): number {
  const far = (spreadAt(distance) - 1) / (SPREAD - 1);
  return own + (FAR_ANGLE - own) * far;
}

/** How far a world's star stands from the eye, in radians, from its seed's first byte. */
export const fromEyeOf = (seed: Uint8Array): number => between(FROM_EYE, seedShare(seed, 0));

/** The light of a world among others, written over `star`, a unit vector from the world: it stays on the side its star stands on screen, always
 * `angle` from `eye`, so it is lit as the Earth is wherever it sits round its star, never a black disc. */
export function sideOf(star: Vector3, eye: Vector3, angle: number): Vector3 {
  star.addScaledVector(eye, -star.dot(eye));
  if (star.lengthSq() < ON_THE_AXIS) star.set(1, 0, 0);
  return star.normalize().multiplyScalar(Math.sin(angle)).addScaledVector(eye, Math.cos(angle));
}

/** The star of a generated world, from its seed's first bytes: always from the right as the Earth's, its angle and height a little its own. */
export function sideLight(seed: Uint8Array, out: Vector3): Vector3 {
  return starAt(between(LATITUDE, seedShare(seed, 1)), fromEyeOf(seed) - HALF_PI, out);
}
