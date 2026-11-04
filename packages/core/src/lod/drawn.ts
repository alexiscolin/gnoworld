// What a look leaves: indices into the systems its ladder was made with, written into one record the caller keeps.
import type { Orbiter, StarSystem } from "../cosmos/system.ts";
import type { Point } from "../space/cell.ts";
import { BOUNDS } from "./bounds.ts";

/** Systems around what the eye looks at that a look keeps, nearest first. */
export const NEAR_MOST = 128;

/** A rock the home's view at rest lays in front of everything (7p), decor, not a world: its place on the stage, the way to its star from
 * there, its radius in map units, its shade and its turn, both from 0 to 1. */
export interface Rock {
  readonly place: Point;
  readonly toStar: Point;
  readonly radius: number;
  readonly shade: number;
  readonly turn: number;
}

/** A Plan a view draws (7v), a system's or the Earth's: its plane, its worlds on their Plan's orbits, their names, and where a name goes
 * where the view knows it; the labels' chunk draws it, with the file's realms' pages. */
export interface Planned {
  readonly system: StarSystem;
  readonly worlds: readonly Orbiter[];
  readonly names: ReadonlyMap<string, string>;
  readonly links: ReadonlyMap<string, string>;
  /** Each world's place on the map, still; each orbit its worlds share a ring of points round the star, on the map from the star, and the
   * ring each world stands on (frame/plan.ts). */
  readonly places: readonly Point[];
  readonly rings: readonly (readonly Point[])[];
  readonly ringOf: readonly number[];
}

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
  /** The home's rocks, which the view at rest lays at its looks and the cosmos's labels' chunk draws (7p): declared, so the cosmos's chunk
   * carries nothing of them. */
  declare rocks?: readonly Rock[];
  /** The Plan the view draws, whose ellipses and names the labels' chunk draws (7v): declared, as the rocks are. */
  declare plan?: Planned | undefined;
}
