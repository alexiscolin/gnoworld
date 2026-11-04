// How the view at rest is seen (slice 7d6): a camera at an eye on the map looking at the Earth, the disc's up kept up, and what a body
// covers on the screens the view is composed for. Plain numbers, for the search reads thousands of them.
import { EARTH_PLACE, EARTH_RADIUS, type Orbiter, type StarSystem } from "../cosmos/system.ts";
import type { Point } from "../space/cell.ts";
import { orbitPlace } from "./disc.ts";
import { outlineOf, type Outline } from "./outline.ts";

/** The home's lens, in degrees, up and down, which the scene's camera takes while the cosmos shows: 1.2 times the scene's 50 degrees'
 * magnification (Alexis, 2026-11-03, "tout pourrait être un peu plus gros"; 1.25 left Onyx no view with its close world and two
 * postcards). Every other page keeps 50 degrees. A number: a call at a module's top stays in every chunk that imports core. */
export const FIELD_OF_VIEW = 42.47122885453438;
/** The screens the view is composed for, in the page's pixels: the video's, and a 16:9 window of its height. */
export const REST_SCREENS = [
  { width: 1728, height: 1080 },
  { width: 1920, height: 1080 },
] as const;
/** The hero's room, as shares of the screen: left of `right`, under `top`. */
export const HERO_ZONE = { right: 0.45, top: 0.58 } as const;
/** A system's card's room at its views (7v, the GUI board's option B: 104 to 195 px down, its name 370 px across at most, on the video's
 * screen), as shares of the screen: left of `right`, over `bottom`. */
export const CARD_ZONE = { right: 0.25, bottom: 0.2 } as const;
/** The great star's heart, in pixels: no body stands on it. */
export const STAR_HEART = 40;

// The header's band, a share of the height: a whole body stands under it.
const HEADER = 0.09;

/** An eye at rest: its distance from the Earth, its slant over the disc and its turn round from the map's z, in radians. */
export interface Candidate {
  readonly distance: number;
  readonly slant: number;
  readonly turn: number;
}

export const DEGREE = Math.PI / 180;

export interface Camera {
  readonly eye: Point;
  readonly ahead: Point;
  readonly right: Point;
  readonly up: Point;
}

/** A place on a screen: its centre and radius in pixels, its depth along the view, its distance from the eye. */
export interface Seen extends Outline {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly depth: number;
  readonly away: number;
}

interface Screen {
  readonly width: number;
  readonly height: number;
}

export const minus = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const dot = (a: Point, b: Point): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const away = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const direction = (a: Point): Point => {
  const length = Math.hypot(a.x, a.y, a.z);
  return { x: a.x / length, y: a.y / length, z: a.z / length };
};
/** `a` moved `by` along `b`. */
export const along = (a: Point, b: Point, by: number): Point => ({
  x: a.x + b.x * by,
  y: a.y + b.y * by,
  z: a.z + b.z * by,
});

/** The eye `distance` from the Earth, `slant` radians over the disc and `turn` radians round from the map's z towards its x, into `out`. */
export function eyeInto({ distance, slant, turn }: Candidate, out: { x: number; y: number; z: number }): void {
  out.x = EARTH_PLACE.x + distance * Math.cos(slant) * Math.sin(turn);
  out.y = EARTH_PLACE.y + distance * Math.sin(slant);
  out.z = EARTH_PLACE.z + distance * Math.cos(slant) * Math.cos(turn);
}

/** The same eye, made. */
export const eyeAt = (distance: number, slant: number, turn: number): Point => {
  const out = { x: 0, y: 0, z: 0 };
  eyeInto({ distance, slant, turn }, out);
  return out;
};

const MAP_UP: Point = { x: 0, y: 1, z: 0 };

/** A camera at `eye`, on the map, looking at `target`, `upright` kept up: the disc's, or a Plan's own plane's (7v). */
export function cameraTowards(eye: Point, target: Point, upright: Point = MAP_UP): Camera {
  const ahead = direction(minus(target, eye));
  const right = direction({
    x: ahead.y * upright.z - ahead.z * upright.y,
    y: ahead.z * upright.x - ahead.x * upright.z,
    z: ahead.x * upright.y - ahead.y * upright.x,
  });
  const up = {
    x: right.y * ahead.z - right.z * ahead.y,
    y: right.z * ahead.x - right.x * ahead.z,
    z: right.x * ahead.y - right.y * ahead.x,
  };
  return { eye, ahead, right, up };
}

const cameraFrom = (eye: Point): Camera => cameraTowards(eye, EARTH_PLACE);

/** The eye moved `across` and `upward` along `camera`'s own axes, looking at `target` still, the Earth unless said: its sway. */
export const swayed = (
  { eye, right, up }: Camera,
  [across, upward]: readonly [number, number],
  target: Point = EARTH_PLACE,
): Camera => cameraTowards(along(along(eye, right, across), up, upward), target);

/** The focal length of a screen `height` pixels high, in pixels, through `fieldOfView` degrees, the home's unless said. */
export const focalOf = (height: number, fieldOfView = FIELD_OF_VIEW): number =>
  height / 2 / Math.tan((fieldOfView * DEGREE) / 2);

const scratch = { x: 0, y: 0, z: 0 };

/** Where `world` stands `seconds` on, on the map. */
export function placeOf(system: StarSystem, world: Orbiter, seconds: number): Point {
  orbitPlace({ system, world }, seconds, scratch);
  return { ...scratch };
}

/** The camera an eye at rest looks through. */
export const cameraOf = ({ distance, slant, turn }: Candidate): Camera => cameraFrom(eyeAt(distance, slant, turn));

/** A camera on one screen: where things stand on it, and what a body there covers. */
export class Look {
  readonly camera: Camera;
  readonly width: number;
  readonly height: number;
  readonly earth: Seen;
  readonly star: Seen;
  readonly #focal: number;

  /** Through `fieldOfView` degrees, the home's lens unless the view has one of its own (a Plan's, 7v). */
  constructor(camera: Camera, { width, height }: Screen, fieldOfView = FIELD_OF_VIEW) {
    this.camera = camera;
    this.width = width;
    this.height = height;
    this.#focal = focalOf(height, fieldOfView);
    this.earth = this.seen(EARTH_PLACE, EARTH_RADIUS);
    this.star = this.seen({ x: 0, y: 0, z: 0 });
  }

  seen(at: Point, radius = 0): Seen {
    const { eye, ahead, right, up } = this.camera;
    const from = minus(at, eye);
    const depth = dot(from, ahead);
    const scale = this.#focal / Math.max(depth, 1e-9);
    const [across, upward] = [dot(from, right), dot(from, up)];
    const [x, y] = [this.width / 2 + across * scale, this.height / 2 - upward * scale];
    const box = outlineOf({ across, up: upward, depth, radius }, this.#focal, [this.width, this.height]);
    return { x, y, radius: radius * scale, depth, away: Math.hypot(from.x, from.y, from.z), ...box };
  }

  /** A ball `reach` round `at`, as wide as anything turning in it can stand on screen: its near side stands larger, and off the axis a
   * shift in depth moves it across too. */
  ball(at: Point, reach: number): Seen {
    const seen = this.seen(at, reach);
    const out = Math.hypot(seen.x - this.width / 2, seen.y - this.height / 2) / this.#focal;
    return { ...seen, radius: ((reach * this.#focal) / Math.max(seen.depth - reach, 1e-9)) * Math.hypot(1, out) };
  }

  #gap(at: Seen, to: Seen, reach: number): number {
    return Math.hypot(at.x - to.x, at.y - to.y) - at.radius - reach;
  }

  /** Whether a body there, `margin` pixels round, leaves clear the Earth from in front, the great star's heart and the page's text: the
   * hero, or at a system's view, where the hero gives way, its card (7v). */
  clear(at: Seen, margin: number, page: "hero" | "card" = "hero"): boolean {
    if (at.depth <= 0) return true;
    const { earth, star, width, height } = this;
    const left = at.x - at.radius < (page === "hero" ? HERO_ZONE.right : CARD_ZONE.right) * width + margin;
    const onPage =
      left &&
      (page === "hero"
        ? at.y + at.radius > HERO_ZONE.top * height - margin
        : at.y - at.radius < CARD_ZONE.bottom * height + margin);
    const onEarth = at.away < earth.away && this.#gap(at, earth, earth.radius) < margin;
    return !onPage && !onEarth && this.#gap(at, star, STAR_HEART) >= margin;
  }

  /** Whether a body there stands whole on the screen, under the header, `margin` pixels in. */
  whole(at: Seen, margin: number): boolean {
    const across = at.left >= margin && at.right <= this.width - margin;
    return at.depth > 0 && across && at.top >= HEADER * this.height && at.bottom <= this.height - margin;
  }

  /** Whether a body there shows nothing on the screen. */
  off(at: Seen): boolean {
    const beside = at.right < 0 || at.left > this.width;
    return at.depth <= 0 || beside || at.bottom < 0 || at.top > this.height;
  }
}

/** The camera on each screen the view is composed for, through `fieldOfView` degrees, the home's unless said. */
export const looksFrom = (camera: Camera, fieldOfView = FIELD_OF_VIEW): Look[] =>
  REST_SCREENS.map((screen) => new Look(camera, screen, fieldOfView));
