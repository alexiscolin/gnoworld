// Where a world's star stands: one place for the Earth's light and for every generated world's, so they are lit the same way (frame 39: the
// star far round to one side, about half the sphere in night, a bright limb and a halo on the side the light falls).
import { between, seedShare } from "@gnoworld/core";
import { Vector3 } from "three";

const POLE = new Vector3(0, 1, 0);
// A generated world's star stands this far from the eye, in radians: about the Earth's 69 degrees and a little past it, so the frames' third to a half of the disc is night.
const FROM_EYE = [1.2, 1.55] as const;
const LATITUDE = [-0.3, 0.34] as const;
const HALF_PI = Math.PI / 2;

/** The star `latitude` over the equator and `azimuth` round the pole, in the ground's sense: the Earth's own sun, 69 degrees right of the eye at rest. */
export function starAt(latitude: number, azimuth: number, out: Vector3): Vector3 {
  return out.set(Math.cos(latitude), Math.sin(latitude), 0).applyAxisAngle(POLE, azimuth);
}

/** How far a world's star stands from the eye, in radians, from its seed's first byte. */
export const fromEyeOf = (seed: Uint8Array): number => between(FROM_EYE, seedShare(seed, 0));

/** The star of a generated world, from its seed's first bytes: always from the right as the Earth's, its angle and height a little its own. */
export function sideLight(seed: Uint8Array, out: Vector3): Vector3 {
  return starAt(between(LATITUDE, seedShare(seed, 1)), fromEyeOf(seed) - HALF_PI, out);
}
