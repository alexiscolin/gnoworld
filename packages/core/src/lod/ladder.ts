// The ladder of detail (ADR-0002 §3). Tier 1. What is drawn depends on the distance alone: far, a region as one glow; middle, a star and its
// worlds as points; near what the eye looks at, bodies, one landmark a system first. A grid holds the map, so a look asks only what is
// around the eye, and the caps bind before any universe can. A look runs off the frame, past a step of the eye, into a record the caller keeps.
import type { Point } from "../space/cell.ts";
import { smoothstep } from "../space/smooth.ts";
import type { StarSystem } from "../cosmos/system.ts";

/** The most drawn: the budget of slice 7's bench. */
export const BOUNDS = { bodies: 40, stars: 1024, dots: 4096, glows: 256, rocks: 480 } as const;
/** How far around what the eye looks at a system shows a body. */
export const LANDMARKS = 52;
/** How far a star stands alone, in world units; past it, a region's glow. */
export const MIDDLE = 320;
/** Where the view closes. */
export const HAZE = 1600;

const REGION = 160;
const NEAR_MOST = 128;
// A body under this many pixels of radius is a point: its bound goes to what the eye can tell is a world.
const BODY_PIXELS = 6;
// A point's radius in pixels never falls under this: a pixel across, and it goes out by `MIDDLE`.
const LEAST_DOT = 0.75;
const DOT_FADE = 0.6;
// A grid cell's two numbers, side by side in one key.
const KEY = 2 ** 21;

/** A body's radius on screen, in pixels: the eye inside it sees it as filling the view, never as infinite. */
export const screenRadius = (radius: number, distance: number, focal: number): number =>
  (radius * focal) / Math.max(distance, radius);

/** A point's radius on screen, in pixels: as a body's, down to a pixel across. */
export const onScreen = (radius: number, distance: number, focal: number): number =>
  Math.max(LEAST_DOT, screenRadius(radius, distance, focal));

/** How bright a point is at a distance, so it goes out before the ladder drops it. */
export const dotLight = (distance: number): number => 1 - smoothstep(MIDDLE * DOT_FADE, MIDDLE, distance);

/** Where a look stands: the eye, its lens in pixels, and what it looks at, around which bodies stand. */
export interface LadderView {
  readonly eye: Point;
  readonly focal: number;
  readonly focus: Point;
}

/** What a look leaves: indices into the systems the ladder was made with. */
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

interface Region {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly systems: number;
}

const cellOf = (at: number): number => Math.floor(at / REGION);
const keyOf = (x: number, z: number): number => (x + KEY / 2) * KEY + (z + KEY / 2);
const apart = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

export class Ladder {
  readonly #systems: readonly StarSystem[];
  readonly #cells = new Map<number, Int32Array>();
  readonly #regions: Region[] = [];
  readonly #regionAt = new Map<number, number>();
  readonly #nearAway = new Float64Array(NEAR_MOST);
  // How many of a system's worlds are bodies, first ones first.
  readonly #bodies: Int32Array;
  /** How many systems the last look asked about. */
  visited = 0;

  constructor(systems: readonly StarSystem[]) {
    this.#systems = systems;
    this.#bodies = new Int32Array(systems.length);
    const held = new Map<number, number[]>();
    systems.forEach(({ place }, at) => {
      const key = keyOf(cellOf(place.x), cellOf(place.z));
      const cell = held.get(key) ?? [];
      cell.push(at);
      held.set(key, cell);
    });
    for (const [key, cell] of held) {
      this.#cells.set(key, Int32Array.from(cell));
      this.#regionAt.set(key, this.#regions.length);
      this.#regions.push(this.#regionOf(cell));
    }
  }

  #regionOf(cell: readonly number[]): Region {
    const total = { x: 0, y: 0, z: 0 };
    for (const at of cell) {
      const { x, y, z } = this.#systems[at]?.place ?? total;
      total.x += x;
      total.y += y;
      total.z += z;
    }
    const { length } = cell;
    return { x: total.x / length, y: total.y / length, z: total.z / length, systems: length };
  }

  /** A region a look drew. */
  region(at: number): Region {
    const found = this.#regions[at];
    if (found === undefined) throw new RangeError("ladder: no such region");
    return found;
  }

  #keepNear(at: number, away: number, drawn: Drawn): void {
    let place = Math.min(drawn.nearCount, NEAR_MOST - 1);
    if (drawn.nearCount === NEAR_MOST && away >= (this.#nearAway[place] ?? 0)) return;
    while (place > 0 && (this.#nearAway[place - 1] ?? 0) > away) {
      drawn.near[place] = drawn.near[place - 1] ?? 0;
      this.#nearAway[place] = this.#nearAway[place - 1] ?? 0;
      place -= 1;
    }
    drawn.near[place] = at;
    this.#nearAway[place] = away;
    drawn.nearCount = Math.min(drawn.nearCount + 1, NEAR_MOST);
  }

  #askCell(cell: Int32Array, { eye, focus }: LadderView, drawn: Drawn): void {
    for (const at of cell) {
      const { place } = this.#systems[at] ?? { place: eye };
      this.visited += 1;
      this.#bodies[at] = 0;
      if (apart(place, eye) <= MIDDLE && drawn.starCount < BOUNDS.stars) {
        drawn.stars[drawn.starCount] = at;
        drawn.starCount += 1;
      }
      const away = apart(place, focus);
      if (away <= LANDMARKS) this.#keepNear(at, away, drawn);
    }
  }

  #addBody(at: number, world: number, drawn: Drawn): void {
    drawn.bodySystems[drawn.bodyCount] = at;
    drawn.bodyWorlds[drawn.bodyCount] = world;
    drawn.bodyCount += 1;
    this.#bodies[at] = world + 1;
  }

  #fits(system: StarSystem, world: number, { eye, focal }: LadderView): boolean {
    const held = system.worlds[world];
    return held !== undefined && screenRadius(held.radius, apart(system.place, eye), focal) >= BODY_PIXELS;
  }

  #addLandmarks(view: LadderView, drawn: Drawn): void {
    for (let index = 0; index < drawn.nearCount && drawn.bodyCount < BOUNDS.bodies; index += 1) {
      const at = drawn.near[index] ?? 0;
      const system = this.#systems[at];
      if (system !== undefined && this.#fits(system, 0, view)) this.#addBody(at, 0, drawn);
    }
  }

  // What is left of the bound goes to the nearest systems' other worlds.
  #addOthers(view: LadderView, drawn: Drawn): void {
    for (let index = 0; index < drawn.nearCount; index += 1) {
      const at = drawn.near[index] ?? 0;
      const system = this.#systems[at];
      if (system === undefined || (this.#bodies[at] ?? 0) === 0) continue;
      for (let world = 1; world < system.worlds.length && drawn.bodyCount < BOUNDS.bodies; world += 1) {
        if (!this.#fits(system, world, view)) break;
        this.#addBody(at, world, drawn);
      }
    }
  }

  #addDots(drawn: Drawn): void {
    for (let index = 0; index < drawn.starCount; index += 1) {
      const at = drawn.stars[index] ?? 0;
      const count = this.#systems[at]?.worlds.length ?? 0;
      for (let world = this.#bodies[at] ?? 0; world < count && drawn.dotCount < BOUNDS.dots; world += 1) {
        drawn.dotSystems[drawn.dotCount] = at;
        drawn.dotWorlds[drawn.dotCount] = world;
        drawn.dotCount += 1;
      }
    }
  }

  #addGlows(eye: Point, drawn: Drawn): void {
    const reach = Math.ceil(HAZE / REGION);
    const [x, z] = [cellOf(eye.x), cellOf(eye.z)];
    for (let dx = -reach; dx <= reach; dx += 1)
      for (let dz = -reach; dz <= reach; dz += 1) {
        const at = this.#regionAt.get(keyOf(x + dx, z + dz));
        const region = at === undefined ? undefined : this.#regions[at];
        if (at === undefined || region === undefined || drawn.glowCount === BOUNDS.glows) continue;
        const away = apart(region, eye);
        if (away > MIDDLE * 0.75 && away <= HAZE) {
          drawn.glows[drawn.glowCount] = at;
          drawn.glowCount += 1;
        }
      }
  }

  /** What is drawn from a view, into `drawn`. */
  look(view: LadderView, drawn: Drawn): void {
    drawn.starCount = 0;
    drawn.glowCount = 0;
    drawn.bodyCount = 0;
    drawn.dotCount = 0;
    drawn.nearCount = 0;
    this.visited = 0;
    const reach = Math.ceil(MIDDLE / REGION);
    const [x, z] = [cellOf(view.eye.x), cellOf(view.eye.z)];
    for (let dx = -reach; dx <= reach; dx += 1)
      for (let dz = -reach; dz <= reach; dz += 1) {
        const cell = this.#cells.get(keyOf(x + dx, z + dz));
        if (cell !== undefined) this.#askCell(cell, view, drawn);
      }
    this.#addLandmarks(view, drawn);
    this.#addOthers(view, drawn);
    this.#addDots(drawn);
    this.#addGlows(view.eye, drawn);
  }
}
