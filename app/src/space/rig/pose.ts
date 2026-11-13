// The camera's one pose (D401, docs/plans/dive.md): what it looks at on the stage, how far, from which way, its up and its field of
// view. Every view the cosmos knows and every page's body gives one; a flight and the reader's hand only ever change this.
import type { Point } from "@gnoworld/core";

export interface Spot {
  x: number;
  y: number;
  z: number;
}

export interface Pose {
  /** What the camera looks at, on the stage. */
  readonly look: Spot;
  /** How far the eye stands from it. */
  distance: number;
  /** The way from what it looks at to the eye, a unit. */
  readonly way: Spot;
  /** The view's up, a unit. */
  readonly up: Spot;
  /** The lens's vertical field of view, in degrees. */
  fov: number;
}

export const spot = (): Spot => ({ x: NaN, y: NaN, z: NaN });

/** A pose to fill. */
export const blankPose = (): Pose => ({
  look: spot(),
  distance: 1,
  way: { x: 0, y: 0, z: 1 },
  up: { x: 0, y: 1, z: 0 },
  fov: 50,
});

/** Where the eye of `pose` stands, into `out`. */
export function eyeOf(pose: Pose, out: Spot): Spot {
  out.x = pose.look.x + pose.way.x * pose.distance;
  out.y = pose.look.y + pose.way.y * pose.distance;
  out.z = pose.look.z + pose.way.z * pose.distance;
  return out;
}

/** Copies `from` into `to`. */
export function copyPose(from: Pose, to: Pose): Pose {
  Object.assign(to.look, from.look);
  Object.assign(to.way, from.way);
  Object.assign(to.up, from.up);
  to.distance = from.distance;
  to.fov = from.fov;
  return to;
}

/** Copies the point `from` into `to`. */
export function copySpot(from: Point, to: Spot): Spot {
  to.x = from.x;
  to.y = from.y;
  to.z = from.z;
  return to;
}
