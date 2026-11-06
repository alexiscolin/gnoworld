// A cube of cloud that tiles on all three axes (ADR-0002 §10, "Space views": computed): gradient noise at a few scales, each a whole
// number of periods across the cube. The sky reads it at whole multiples of its offset, so nothing jumps when an offset wraps.
// It runs once, on the main thread as the scene starts: plain loops, for 110,592 voxels at 4 scales make no garbage this way.
import { cellHash } from "./cell.ts";
import { clamp01, lerp, smoothstep } from "./smooth.ts";

const SALT = 91;
const COARSEST = 4;
const ROUGHNESS = 0.5;
const CONTRAST = 0.9;
const TURN = 2 * Math.PI;
const WORD = 2 ** 32;

// One random unit vector for each point of a lattice that wraps at `period`, and its noise at a point.
class Gradients {
  readonly #grid: Float32Array;
  readonly #period: number;
  #ix = 0;
  #iy = 0;
  #iz = 0;
  #fx = 0;
  #fy = 0;
  #fz = 0;

  constructor(period: number) {
    this.#period = period;
    this.#grid = new Float32Array(period ** 3 * 3);
    const cell = { x: 0, y: 0, z: 0 };
    for (let at = 0; at < period ** 3; at += 1) {
      cell.x = at % period;
      cell.y = Math.floor(at / period) % period;
      cell.z = Math.floor(at / period ** 2);
      const turn = (cellHash(SALT + period, cell) / WORD) * TURN;
      const height = (cellHash(SALT + period + 1, cell) / WORD) * 2 - 1;
      const flat = Math.sqrt(1 - height * height);
      this.#grid[at * 3] = flat * Math.cos(turn);
      this.#grid[at * 3 + 1] = flat * Math.sin(turn);
      this.#grid[at * 3 + 2] = height;
    }
  }

  // The gradient of a corner of the cell, dotted with the way from it.
  #slope(dx: number, dy: number, dz: number): number {
    const period = this.#period;
    const wrapped = (this.#ix + dx) % period;
    const at = (wrapped + ((this.#iy + dy) % period) * period + ((this.#iz + dz) % period) * period ** 2) * 3;
    const grid = this.#grid;
    return (
      (grid[at] ?? 0) * (this.#fx - dx) + (grid[at + 1] ?? 0) * (this.#fy - dy) + (grid[at + 2] ?? 0) * (this.#fz - dz)
    );
  }

  #along(dy: number, dz: number, u: number): number {
    return lerp(this.#slope(0, dy, dz), this.#slope(1, dy, dz), u);
  }

  at(x: number, y: number, z: number): number {
    this.#ix = Math.floor(x);
    this.#iy = Math.floor(y);
    this.#iz = Math.floor(z);
    this.#fx = x - this.#ix;
    this.#fy = y - this.#iy;
    this.#fz = z - this.#iz;
    const u = smoothstep(0, 1, this.#fx);
    const v = smoothstep(0, 1, this.#fy);
    const near = lerp(this.#along(0, 0, u), this.#along(1, 0, u), v);
    const far = lerp(this.#along(0, 1, u), this.#along(1, 1, u), v);
    return lerp(near, far, smoothstep(0, 1, this.#fz));
  }
}

// Adds one scale to the cube.
function addScale(cube: Float32Array, side: number, period: number): void {
  const gradients = new Gradients(period);
  const weight = 0.6 * ROUGHNESS ** Math.log2(period / COARSEST);
  const step = period / side;
  for (let at = 0; at < cube.length; at += 1) {
    const noise = gradients.at(
      (at % side) * step,
      (Math.floor(at / side) % side) * step,
      Math.floor(at / side ** 2) * step,
    );
    cube[at] = (cube[at] ?? 0) + noise * weight;
  }
}

/** A `side`³ cube of levels, x first; its opposite faces meet. The same cube each time. Its finest scale stays two voxels a wave and
 * more: finer, and a magnified read shows the voxels themselves, in straight lines. */
export function tilingNoise(side: number): Uint8Array {
  const cube = new Float32Array(side ** 3);
  for (let period = COARSEST; period * 2 <= side; period *= 2) addScale(cube, side, period);
  return Uint8Array.from(cube, (level) => Math.round(clamp01(level * CONTRAST + 0.5) * 255));
}
