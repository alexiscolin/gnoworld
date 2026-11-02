// The ladder of detail (ADR-0002 §3). Tier 1. What is drawn depends on the distance alone: far, a region as one glow; middle, a star and its
// worlds as points; near what the eye looks at, bodies, one landmark a system first. A grid holds the map, so a look asks only what is
// around the eye, and the caps bind before any universe can. A look runs off the frame, past a step of the eye, into a record the caller keeps.
import { distanceOf as apart, type Point } from "../space/cell.ts";
import { smoothstep } from "../space/smooth.ts";
import type { StarSystem } from "../cosmos/system.ts";
import { BOUNDS } from "./bounds.ts";
import { Drawn, NEAR_MOST } from "./drawn.ts";
import { Nearest } from "./nearest.ts";

export { BOUNDS, Drawn };

/** How far around what the eye looks at a system shows a body. */
export const LANDMARKS = 52;
/** How far a star stands alone, in world units; past it, a region's glow. */
export const MIDDLE = 320;
/** Where the view closes. */
export const HAZE = 1600;

const REGION = 160;
// The most points one star's worlds take of the bound, and what each star in reach is sure of first.
const DOTS_A_STAR = 1024;
const DOTS_FLOOR = BOUNDS.dots / BOUNDS.stars;
/** A body under this many pixels of radius is a point: its bound goes to what the eye can tell is a world. */
export const BODY_PIXELS = 6;
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

interface Region {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly systems: number;
}

const cellOf = (at: number): number => Math.floor(at / REGION);
const keyOf = (x: number, z: number): number => (x + KEY / 2) * KEY + (z + KEY / 2);

export class Ladder {
  readonly #systems: readonly StarSystem[];
  readonly #cells = new Map<number, Int32Array>();
  readonly #regions: Region[] = [];
  readonly #regionAt = new Map<number, number>();
  readonly #nearAway = new Float64Array(NEAR_MOST);
  readonly #stars: Nearest;
  readonly #glows: Nearest;
  // How many of a system's worlds are bodies, first ones first.
  readonly #bodies: Int32Array;
  // Where each star's points have come to, between the two passes.
  readonly #dotsFrom: Int32Array;
  /** How many systems the last look asked about. */
  visited = 0;

  constructor(systems: readonly StarSystem[]) {
    this.#systems = systems;
    this.#bodies = new Int32Array(systems.length);
    this.#dotsFrom = new Int32Array(systems.length);
    this.#stars = new Nearest(systems.length);
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
    this.#glows = new Nearest(this.#regions.length);
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
      const fromEye = apart(place, eye);
      if (fromEye <= MIDDLE) this.#stars.offer(at, fromEye);
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

  // Two passes by star, nearest first (F3568, F3577): each its floor, then a share each of what is left, so no crowd, nor four, starve a near world.
  #addDots(drawn: Drawn): void {
    for (let index = 0; index < drawn.starCount; index += 1) {
      const at = drawn.stars[index] ?? 0;
      this.#dotsFrom[at] = this.#bodies[at] ?? 0;
    }
    this.#addDotsUpTo(drawn, DOTS_FLOOR);
    this.#addDotsUpTo(drawn, DOTS_A_STAR);
  }

  #addDotsUpTo(drawn: Drawn, share: number): void {
    for (let index = 0; index < drawn.starCount; index += 1) {
      const at = drawn.stars[index] ?? 0;
      const first = this.#bodies[at] ?? 0;
      const count = Math.min(this.#systems[at]?.worlds.length ?? 0, first + share);
      let world = this.#dotsFrom[at] ?? first;
      for (; world < count && drawn.dotCount < BOUNDS.dots; world += 1) {
        drawn.dotSystems[drawn.dotCount] = at;
        drawn.dotWorlds[drawn.dotCount] = world;
        drawn.dotCount += 1;
      }
      this.#dotsFrom[at] = world;
    }
  }

  #addGlows(eye: Point, drawn: Drawn): void {
    const reach = Math.ceil(HAZE / REGION);
    const [x, z] = [cellOf(eye.x), cellOf(eye.z)];
    for (let dx = -reach; dx <= reach; dx += 1)
      for (let dz = -reach; dz <= reach; dz += 1) {
        const at = this.#regionAt.get(keyOf(x + dx, z + dz));
        const region = at === undefined ? undefined : this.#regions[at];
        if (at === undefined || region === undefined) continue;
        const away = apart(region, eye);
        if (away > MIDDLE * 0.75 && away <= HAZE) this.#glows.offer(at, away);
      }
    drawn.glowCount = this.#glows.drain(drawn.glows, BOUNDS.glows);
  }

  /** What is drawn from a view, into `drawn`. */
  look(view: LadderView, drawn: Drawn): void {
    drawn.starCount = 0;
    drawn.glowCount = 0;
    drawn.bodyCount = 0;
    drawn.dotCount = 0;
    drawn.nearCount = 0;
    this.visited = 0;
    this.#stars.clear();
    this.#glows.clear();
    const reach = Math.ceil(MIDDLE / REGION);
    const [x, z] = [cellOf(view.eye.x), cellOf(view.eye.z)];
    for (let dx = -reach; dx <= reach; dx += 1)
      for (let dz = -reach; dz <= reach; dz += 1) {
        const cell = this.#cells.get(keyOf(x + dx, z + dz));
        if (cell !== undefined) this.#askCell(cell, view, drawn);
      }
    drawn.starCount = this.#stars.drain(drawn.stars, BOUNDS.stars);
    this.#addLandmarks(view, drawn);
    this.#addOthers(view, drawn);
    this.#addDots(drawn);
    this.#addGlows(view.eye, drawn);
  }
}
