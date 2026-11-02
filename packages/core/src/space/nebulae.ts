// The nebulae (ADR-0002 §10, "Space views"): a telescope's view cut from a few real images, warped and recoloured, standing where the
// mood's haze is. A lattice of cells, a cell holding one or none, everything about it from its cell's hash: a place keeps its nebula, and
// nothing is listed or stored. Each stands as sheets one behind the other, so the eye moving parts them, the far ones softer.
import { cellHash, distanceOf, nextState, unitOf, type Point } from "./cell.ts";
import { MOOD_SCALE, moodAt, newMood } from "./mood.ts";
import { lerp, smoothstep } from "./smooth.ts";

/** The images, by their files' names under the textures. */
export const NEBULA_IMAGES = ["carina", "veil", "cliffs"] as const;
/** How far a nebula shows, in world units. */
export const NEBULA_REACH = 2000;
/** The most kept at once, nearest first: past the twenty a reach holds at most. */
export const NEBULAE_MOST = 32;

export interface NebulaLayer {
  /** Its sheet's place along the depth from the nebula's centre, towards the eye. */
  readonly along: number;
  /** Its width, and the share of the nebula's window of its image it shows. */
  readonly size: number;
  readonly span: number;
  /** How soft it is: how many levels of detail its image is read below its own. */
  readonly blur: number;
  readonly light: number;
}

/** Far to near: wide, soft and dim behind, a closer cut of it sharper in front. */
export const NEBULA_LAYERS: readonly NebulaLayer[] = [
  { along: -250, size: 1.35, span: 1, blur: 2, light: 0.5 },
  { along: 0, size: 1, span: 0.75, blur: 0.8, light: 0.8 },
  { along: 250, size: 0.7, span: 0.5, blur: 0, light: 0.55 },
];

export interface Nebula {
  /** Its cell's hash. */
  id: number;
  x: number;
  y: number;
  z: number;
  /** Its image, an index into `NEBULA_IMAGES`. */
  image: number;
  /** Half the width of its middle sheet, in world units. */
  size: number;
  /** Its turn on screen, in radians. */
  turn: number;
  /** The centre of its window in its image, the window's side in the image's heights, and 1 or -1 for a mirror. */
  u: number;
  v: number;
  span: number;
  flip: number;
  /** Where its warp reads the field. */
  seed: number;
  /** The mood's colour at its centre, its brightest channel at 1, and how much of it shows. */
  red: number;
  green: number;
  blue: number;
  strength: number;
}

const CELL = 1000;
const SALT = 21;
// The share of cells that hold one: most views show some, not all.
const HELD = 0.45;
const SIZE = 400;
const SIZE_MORE = 300;
// A cell keeps its nebula's centre this far from its walls, in the room left between them.
const WALL = 0.15;
const ROOM = 0.7;
const SPAN = 0.6;
const SPAN_MORE = 0.4;
// Past the reach, kept for the step the eye takes between two placings.
const MARGIN = 100;
const FADES_FROM = 0.7;
// Inside its middle sheet's width, gone: a flat sheet seen from within reads as a wash.
const NEAR_GONE = 0.7;
const NEAR_WHOLE = 1.6;
const HAZE_WHOLE = 0.35;
// Under a level of eight bits a sheet adds nothing to see: it is not drawn at all, for its quad would still be paid for.
const LEAST = 1 / 255;
// Past this, a cell's index is no longer a whole number: the lattice cannot count, and stands nothing.
const FARTHEST = 2 ** 50;
// The eye's distance to what it looks at: near a world, a system's, a cluster's, and where the whole cosmos takes over.
const WORLD = 3;
const SYSTEM = 12;
const CLUSTER = MOOD_SCALE;
const GONE = 2 * MOOD_SCALE;
// At a system's distance, the arrival's, the worlds are the subject and the nebulae lie low under the suns' glow; seen from a cluster's,
// they are the view.
const SYSTEM_SHARE = 0.35;
const ARRIVAL = 36;
const CLUSTER_VIEW = 240;

const blank = (): Nebula => ({
  id: 0,
  x: 0,
  y: 0,
  z: 0,
  image: 0,
  size: 0,
  turn: 0,
  u: 0,
  v: 0,
  span: 0,
  flip: 1,
  seed: 0,
  red: 0,
  green: 0,
  blue: 0,
  strength: 0,
});

/** The nebulae around an eye, into a pool kept for good: a look makes nothing. */
export class NebulaField {
  readonly list: readonly Nebula[] = Array.from({ length: NEBULAE_MOST }, blank);
  count = 0;
  readonly #away = new Float64Array(NEBULAE_MOST);
  readonly #cell = { x: 0, y: 0, z: 0 };
  readonly #at = { x: 0, y: 0, z: 0 };
  readonly #mood = newMood();

  /** Stands the nebulae within reach of `eye`. */
  around(eye: Point): void {
    const reach = NEBULA_REACH + MARGIN;
    this.count = 0;
    if (!(Math.max(Math.abs(eye.x), Math.abs(eye.y), Math.abs(eye.z)) < FARTHEST)) return;
    for (let x = Math.floor((eye.x - reach) / CELL); x <= Math.floor((eye.x + reach) / CELL); x += 1)
      for (let y = Math.floor((eye.y - reach) / CELL); y <= Math.floor((eye.y + reach) / CELL); y += 1)
        for (let z = Math.floor((eye.z - reach) / CELL); z <= Math.floor((eye.z + reach) / CELL); z += 1) {
          this.#cell.x = x;
          this.#cell.y = y;
          this.#cell.z = z;
          this.#take(eye);
        }
  }

  // The cell's nebula, if it holds one, within reach and in the haze.
  #take(eye: Point): void {
    const { x, y, z } = this.#cell;
    const id = cellHash(SALT, this.#cell);
    if (unitOf(id) >= HELD) return;
    let state = nextState(id);
    const at = this.#at;
    at.x = (x + WALL + ROOM * unitOf(state)) * CELL;
    state = nextState(state);
    at.y = (y + WALL + ROOM * unitOf(state)) * CELL;
    state = nextState(state);
    at.z = (z + WALL + ROOM * unitOf(state)) * CELL;
    const away = distanceOf(at, eye);
    if (away > NEBULA_REACH + MARGIN) return;
    moodAt(this.#mood, at);
    if (this.#mood.haze <= 0) return;
    const slot = this.#slotFor(away);
    if (slot < 0) return;
    this.#away[slot] = away;
    this.#fill(this.list[slot] ?? blank(), id, nextState(state));
  }

  // The next free place, or the farthest one's if this is nearer: the bound keeps the nearest.
  #slotFor(away: number): number {
    if (this.count < NEBULAE_MOST) {
      this.count += 1;
      return this.count - 1;
    }
    let farthest = 0;
    for (let at = 1; at < NEBULAE_MOST; at += 1) if ((this.#away[at] ?? 0) > (this.#away[farthest] ?? 0)) farthest = at;
    return away < (this.#away[farthest] ?? 0) ? farthest : -1;
  }

  #fill(nebula: Nebula, id: number, from: number): void {
    const mood = this.#mood;
    let state = from;
    const next = (): number => {
      state = nextState(state);
      return unitOf(state);
    };
    nebula.id = id;
    nebula.x = this.#at.x;
    nebula.y = this.#at.y;
    nebula.z = this.#at.z;
    nebula.image = Math.floor(unitOf(state) * NEBULA_IMAGES.length);
    nebula.size = SIZE + SIZE_MORE * next();
    nebula.turn = 2 * Math.PI * next();
    nebula.span = SPAN + SPAN_MORE * next();
    nebula.u = nebula.span / 4 + (1 - nebula.span / 2) * next();
    nebula.v = nebula.span / 2 + (1 - nebula.span) * next();
    nebula.flip = next() < 0.5 ? -1 : 1;
    nebula.seed = 64 * next();
    const brightest = Math.max(mood.red, mood.green, mood.blue);
    nebula.red = mood.red / brightest;
    nebula.green = mood.green / brightest;
    nebula.blue = mood.blue / brightest;
    nebula.strength = smoothstep(0, HAZE_WHOLE, mood.haze) * (0.65 + 0.35 * next());
  }
}

/** How much of a nebula shows from `eye`: none at the reach, none from within its middle sheet, none too faint to see. */
export function nebulaLight(nebula: Nebula, eye: Point): number {
  const away = distanceOf(nebula, eye);
  const far = 1 - smoothstep(FADES_FROM * NEBULA_REACH, NEBULA_REACH, away);
  const light = nebula.strength * far * smoothstep(NEAR_GONE * nebula.size, NEAR_WHOLE * nebula.size, away);
  return light < LEAST ? 0 : light;
}

/** How much of the view the whole cosmos takes with the eye `distance` from what it looks at: none to a cluster's distance, all from twice
 * it. The nebulae, the suns and the bodies give up what it takes, so no frame shows both whole. */
export const wholeShare = (distance: number): number => smoothstep(CLUSTER, GONE, distance);

/** How much of the nebulae shows with the eye `distance` from what it looks at: none near a world, a third at a system's distance, all at
 * a cluster's, none past it. */
export const nebulaShare = (distance: number): number =>
  smoothstep(WORLD, SYSTEM, distance) *
  (SYSTEM_SHARE + (1 - SYSTEM_SHARE) * smoothstep(ARRIVAL, CLUSTER_VIEW, distance)) *
  (1 - wholeShare(distance));

// Frame 16's teal, top right (f0016.jpg, read on 2026-11-02): its mean, sRGB (10, 44, 50), in linear light, its brightest channel at 1.
const TEAL = { red: 0.09516135842160993, green: 0.7896549257303476, blue: 1 };
// How much bluer than red a mood is before its nebula is all teal: rose and mauve stay the mood's.
const COOL_FROM = 0.1;
const COOL_TO = 0.5;

/** A nebula's colour, its brightest channel at 1: the mood's where it is warm, frame 16's teal where it is cool, never the grey-blue between
 * the mood's cool hues (Alexis, 2026-11-02). */
export function nebulaTint(
  { red, green, blue }: Pick<Nebula, "red" | "green" | "blue">,
  out: { red: number; green: number; blue: number },
): void {
  const cool = smoothstep(COOL_FROM, COOL_TO, blue - red);
  out.red = lerp(red, TEAL.red, cool);
  out.green = lerp(green, TEAL.green, cool);
  out.blue = lerp(blue, TEAL.blue, cool);
  const brightest = Math.max(out.red, out.green, out.blue);
  out.red /= brightest;
  out.green /= brightest;
  out.blue /= brightest;
}

/** Where a layer's sheet stands, into `out`; its half-width. */
export function sheetOf(nebula: Nebula, layer: NebulaLayer, out: { x: number; y: number; z: number }): number {
  out.x = nebula.x;
  out.y = nebula.y;
  out.z = nebula.z + layer.along;
  return nebula.size * layer.size;
}

/** The window a layer shows of its image, into `out`: from (`u`, `v`), `width` across (less than 0 for a mirror) and `height` down. */
export function windowOf(
  nebula: Nebula,
  layer: NebulaLayer,
  out: { u: number; v: number; width: number; height: number },
): void {
  const side = nebula.span * layer.span;
  out.width = (nebula.flip * side) / 2;
  out.height = side;
  out.u = nebula.u - out.width / 2;
  out.v = nebula.v - side / 2;
}
