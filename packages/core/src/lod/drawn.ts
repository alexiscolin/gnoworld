// What a look leaves: indices into the systems its ladder was made with, written into one record the caller keeps.
import { BOUNDS } from "./bounds.ts";

/** Systems around what the eye looks at that a look keeps, nearest first. */
export const NEAR_MOST = 128;

export class Drawn {
  readonly stars = new Int32Array(BOUNDS.stars);
  readonly glows = new Int32Array(BOUNDS.glows);
  readonly bodySystems = new Int32Array(BOUNDS.bodies);
  readonly bodyWorlds = new Int32Array(BOUNDS.bodies);
  readonly dotSystems = new Int32Array(BOUNDS.dots);
  readonly dotWorlds = new Int32Array(BOUNDS.dots);
  /** Systems around what the eye looks at, nearest first. */
  readonly near = new Int32Array(NEAR_MOST);
  starCount = 0;
  glowCount = 0;
  bodyCount = 0;
  dotCount = 0;
  nearCount = 0;
}
