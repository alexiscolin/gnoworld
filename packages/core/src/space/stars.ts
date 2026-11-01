// The stars and motes of a cell (ADR-0002 §10): a cell's hash gives its points, so the same cell is the same picture, and the mood where
// it sits gives their count, so nothing fixes one. Shells nest, each a cell size to itself: the near ones move as you fly, the far ones
// stay. Scenery, so crisp points and never a sign: a star with a glow is a namespace.
import { cellHash, nextState, unitOf, type Point } from "./cell.ts";
import { moodAt, newMood } from "./mood.ts";
import { nearestCell, Torus, wrapTo } from "./torus.ts";

export interface Shell {
  readonly salt: number;
  /** Cells a side of its torus. */
  readonly side: number;
  /** A cell's width, in world units. */
  readonly size: number;
  /** The most points a cell holds: a bound on the cost, never a count on show. */
  readonly perCell: number;
  /** How rare the bright are: the power of the law. */
  readonly steep: number;
  /** Where it fades, in and out, in cells from the eye. */
  readonly near: number;
  readonly far: number;
  /** Its faintest point, and how many times that the brightest is, in pixels. */
  readonly point: number;
  readonly flare: number;
  /** The speed it drifts at, in cells a second. */
  readonly wind: number;
}

/** Far to near. The eye is always inside the last, so its motes pass by. */
export const SHELLS: readonly Shell[] = [
  { salt: 11, side: 6, size: 1600, perCell: 90, steep: 6, near: 0, far: 2.5, point: 2.1, flare: 1.2, wind: 0 },
  { salt: 12, side: 6, size: 260, perCell: 90, steep: 5, near: 0.1, far: 2.5, point: 2.1, flare: 2, wind: 0 },
  { salt: 13, side: 6, size: 60, perCell: 22, steep: 4, near: 0.3, far: 2.5, point: 2.3, flare: 3.5, wind: 0 },
];
export const MOTES: Shell = {
  salt: 14,
  side: 6,
  size: 7,
  perCell: 14,
  steep: 2,
  near: 0.22,
  far: 2.5,
  point: 2.2,
  flare: 2,
  wind: 0.012,
};

// Where a cell's count starts, and how far the mood takes it.
const LEAST = 0.2;
// Keeps a 32-bit point inside its cell.
const INSIDE = 0.999;
const WARM = [255, 190, 140];
const WHITE = [255, 246, 235];
const BLUE = [190, 210, 255];
const WHITE_AT = 0.7;

// Red to white along the commoner stars, on to blue-white for the rare hot ones.
function tintOf(heat: number, channel: number): number {
  const by = heat < WHITE_AT ? heat / WHITE_AT : (heat - WHITE_AT) / (1 - WHITE_AT);
  const from = heat < WHITE_AT ? (WARM[channel] ?? 0) : (WHITE[channel] ?? 0);
  const to = heat < WHITE_AT ? (WHITE[channel] ?? 0) : (BLUE[channel] ?? 0);
  return Math.round(from * (1 - by) + to * by);
}

export class StarCells {
  readonly positions: Float32Array;
  readonly tints: Uint8Array;
  readonly #shell: Shell;
  readonly #torus: Torus;
  readonly #mood = newMood();
  readonly #spot = { x: 0, y: 0, z: 0 };
  readonly #centre = { x: 0, y: 0, z: 0 };
  #state = 0;

  constructor(shell: Shell) {
    this.#shell = shell;
    const points = shell.side ** 3 * shell.perCell;
    this.positions = new Float32Array(points * 3);
    this.tints = new Uint8Array(points * 4);
    this.#torus = new Torus(shell.side, this.write);
  }

  /** Moves the box to the eye; whether a point changed. */
  follow(eye: Point): boolean {
    const { size } = this.#shell;
    this.#centre.x = nearestCell(eye.x, size);
    this.#centre.y = nearestCell(eye.y, size);
    this.#centre.z = nearestCell(eye.z, size);
    return this.#torus.follow(this.#centre);
  }

  #unit(): number {
    this.#state = nextState(this.#state);
    return unitOf(this.#state);
  }

  /** Puts a cell's points in `slot`. Every point takes its numbers, lit or not: a change of mood moves no other. */
  readonly write = (slot: number, cell: Point): void => {
    const { perCell, salt, side, size } = this.#shell;
    this.#spot.x = (cell.x + 0.5) * size;
    this.#spot.y = (cell.y + 0.5) * size;
    this.#spot.z = (cell.z + 0.5) * size;
    moodAt(this.#mood, this.#spot);
    const lit = Math.round(perCell * Math.min(1, LEAST + this.#mood.density));
    this.#state = cellHash(salt, cell);
    for (let point = 0; point < perCell; point += 1) {
      const at = slot * perCell + point;
      this.positions[at * 3] = wrapTo(cell.x, side) + this.#unit() * INSIDE;
      this.positions[at * 3 + 1] = wrapTo(cell.y, side) + this.#unit() * INSIDE;
      this.positions[at * 3 + 2] = wrapTo(cell.z, side) + this.#unit() * INSIDE;
      this.#light(at, point < lit);
    }
  };

  #light(at: number, lit: boolean): void {
    const heat = this.#unit();
    const light = 1 + Math.floor(this.#unit() ** this.#shell.steep * 254);
    this.tints[at * 4] = lit ? tintOf(heat, 0) : 0;
    this.tints[at * 4 + 1] = lit ? tintOf(heat, 1) : 0;
    this.tints[at * 4 + 2] = lit ? tintOf(heat, 2) : 0;
    this.tints[at * 4 + 3] = lit ? light : 0;
  }
}
