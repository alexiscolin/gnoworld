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
/** The great star's heart, in pixels: no body stands on it. */
export const STAR_HEART = 40;

// The header's band, a share of the height: a whole body stands under it.
const HEADER = 0.09;
// The great star stands 100 pixels right of the Earth or more, and this share of the height from the middle at most.
const STAR_RIGHT = 100;
const STAR_HEIGHT = 0.3;

/** An eye at rest: its distance from the Earth, its slant over the disc and its turn round from the map's z, in radians. */
export interface Candidate {
  readonly distance: number;
  readonly slant: number;
  readonly turn: number;
}

/** A system the view may draw: its index, its worlds of a body's size, those it draws as a postcard, how far its worlds reach. */
export interface Held {
  readonly index: number;
  readonly system: StarSystem;
  readonly bodies: readonly Orbiter[];
  readonly postcard: readonly Orbiter[];
  readonly reach: number;
}

/** A world passing close to the eye, and its system. */
export interface Close {
  readonly held: Held;
  readonly world: Orbiter;
}

export const DEGREE = Math.PI / 180;
/** The eye's distances from the Earth, the plain one first: the Earth about 130 pixels across through the home's lens, 121 to 142 (Alexis,
 * 2026-11-02 and 2026-11-03). */
export const DISTANCES = [26, 25, 27, 24, 28];
// The share of the Earth's disc in day, at the least: frame 4's, about 45%.
const LIT_LEAST = 0.45;
const SLANT_LEAST = 6;
const SLANT_MOST = 30;
const TURN_MOST = 60;
/** The slants and turns, in degrees, the plain views take, with the steps between. */
export const RANGE = { slant: [SLANT_LEAST, SLANT_MOST, 2], turn: [-TURN_MOST, TURN_MOST, 3] } as const;

/** Whether an eye stands where the view allows: 6 to 30 degrees over the disc, 60 degrees round at most, the great star staying beside. */
export const within = ({ slant, turn }: Candidate): boolean =>
  slant >= SLANT_LEAST * DEGREE && slant <= SLANT_MOST * DEGREE && Math.abs(turn) <= TURN_MOST * DEGREE;

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
const along = (a: Point, b: Point, by: number): Point => ({ x: a.x + b.x * by, y: a.y + b.y * by, z: a.z + b.z * by });

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

/** A camera at `eye`, on the map, looking at the Earth, the disc's up kept up. */
export function cameraFrom(eye: Point): Camera {
  const ahead = direction(minus(EARTH_PLACE, eye));
  const right = direction({ x: -ahead.z, y: 0, z: ahead.x });
  const up = {
    x: right.y * ahead.z - right.z * ahead.y,
    y: right.z * ahead.x - right.x * ahead.z,
    z: right.x * ahead.y - right.y * ahead.x,
  };
  return { eye, ahead, right, up };
}

/** The eye moved `across` and `upward` along `camera`'s own axes, looking at the Earth still: its sway. */
export const swayed = ({ eye, right, up }: Camera, [across, upward]: readonly [number, number]): Camera =>
  cameraFrom(along(along(eye, right, across), up, upward));

/** The focal length of a screen `height` pixels high, in pixels. */
export const focalOf = (height: number): number => height / 2 / Math.tan((FIELD_OF_VIEW * DEGREE) / 2);

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

  constructor(camera: Camera, { width, height }: Screen) {
    this.camera = camera;
    this.width = width;
    this.height = height;
    this.#focal = focalOf(height);
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

  /** Whether the great star lights `LIT_LEAST` of the Earth's disc or more, as the eye sees it: its day faces the eye that much. */
  lit(): boolean {
    const [toEye, toStar] = [minus(this.camera.eye, EARTH_PLACE), minus({ x: 0, y: 0, z: 0 }, EARTH_PLACE)];
    const facing =
      dot(toEye, toStar) / Math.hypot(toEye.x, toEye.y, toEye.z) / Math.hypot(toStar.x, toStar.y, toStar.z);
    return (1 + facing) / 2 >= LIT_LEAST;
  }

  /** The great star in front, right of the Earth, near the middle's height. */
  starBeside(): boolean {
    const { star, width, height } = this;
    return (
      star.depth > 0 &&
      star.x - width / 2 >= STAR_RIGHT &&
      star.x < width - STAR_HEART &&
      Math.abs(star.y - height / 2) <= STAR_HEIGHT * height
    );
  }

  #gap(at: Seen, to: Seen, reach: number): number {
    return Math.hypot(at.x - to.x, at.y - to.y) - at.radius - reach;
  }

  /** Whether a body there, `margin` pixels round, leaves clear the Earth from in front, the great star's heart and the hero. */
  clear(at: Seen, margin: number): boolean {
    if (at.depth <= 0) return true;
    const { earth, star, width, height } = this;
    const hero =
      at.x - at.radius < HERO_ZONE.right * width + margin && at.y + at.radius > HERO_ZONE.top * height - margin;
    const onEarth = at.away < earth.away && this.#gap(at, earth, earth.radius) < margin;
    return !hero && !onEarth && this.#gap(at, star, STAR_HEART) >= margin;
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

  /** Whether a body there is cut by exactly one side, `least` of its width shown, whole from top to bottom. */
  cutBySide(at: Seen, least: number): boolean {
    const sides = Number(at.left < 0) + Number(at.right > this.width);
    const shown = Math.min(at.right, this.width) - Math.max(at.left, 0);
    return sides === 1 && shown >= least * (at.right - at.left) && at.top >= 0 && at.bottom <= this.height;
  }
}

/** The camera on each screen the view is composed for. */
export const looksFrom = (camera: Camera): Look[] => REST_SCREENS.map((screen) => new Look(camera, screen));
