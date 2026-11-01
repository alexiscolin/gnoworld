// A cube of cloud that tiles on all three axes (ADR-0002 §10, "Space views": computed): gradient noise at a few scales, each a whole
// number of periods across the cube. The sky reads it at whole multiples of its offset, so nothing jumps when an offset wraps.
import { cellHash, type Point } from "./cell.ts";
import { smoothstep } from "./smooth.ts";

const SALT = 91;
const COARSEST = 4;
const ROUGHNESS = 0.5;
const CONTRAST = 0.9;
const TURN = 2 * Math.PI;
const WORD = 2 ** 32;

const lerp = (from: number, to: number, by: number): number => from + (to - from) * by;

interface Lattice {
  readonly grid: Float32Array;
  readonly period: number;
}

// One random unit vector for each point of a lattice that wraps at `period`.
function gradients(period: number): Float32Array {
  const grid = new Float32Array(period ** 3 * 3);
  for (let at = 0; at < period ** 3; at += 1) {
    const cell = { x: at % period, y: Math.floor(at / period) % period, z: Math.floor(at / period ** 2) };
    const turn = (cellHash(SALT + period, cell) / WORD) * TURN;
    const height = (cellHash(SALT + period + 1, cell) / WORD) * 2 - 1;
    const flat = Math.sqrt(1 - height * height);
    grid.set([flat * Math.cos(turn), flat * Math.sin(turn), height], at * 3);
  }
  return grid;
}

// The gradient of the lattice point `corner` (bits x, y, z) of the cell at `p`, dotted with the way to `p`.
function slope({ grid, period }: Lattice, p: Point, corner: number): number {
  const [dx, dy, dz] = [corner & 1, (corner >> 1) & 1, corner >> 2];
  const [ix, iy, iz] = [Math.floor(p.x) + dx, Math.floor(p.y) + dy, Math.floor(p.z) + dz];
  const at = ((ix % period) + (iy % period) * period + (iz % period) * period ** 2) * 3;
  const [fx, fy, fz] = [p.x + dx - ix, p.y + dy - iy, p.z + dz - iz];
  return (grid[at] ?? 0) * (fx - dx) + (grid[at + 1] ?? 0) * (fy - dy) + (grid[at + 2] ?? 0) * (fz - dz);
}

function gradientNoise(scale: Lattice, p: Point): number {
  const [u, v, w] = [smoothstep(0, 1, p.x % 1), smoothstep(0, 1, p.y % 1), smoothstep(0, 1, p.z % 1)];
  const along = (from: number): number => lerp(slope(scale, p, from), slope(scale, p, from + 1), u);
  const across = (from: number): number => lerp(along(from), along(from + 2), v);
  return lerp(across(0), across(4), w);
}

// Adds one scale to the cube.
function addScale(cube: Float32Array, side: number, period: number): void {
  const grid = { grid: gradients(period), period };
  const weight = 0.6 * ROUGHNESS ** Math.log2(period / COARSEST);
  const step = period / side;
  cube.forEach((level, at) => {
    const p = {
      x: (at % side) * step,
      y: (Math.floor(at / side) % side) * step,
      z: Math.floor(at / side ** 2) * step,
    };
    cube[at] = level + gradientNoise(grid, p) * weight;
  });
}

/** A `side`³ cube of levels, x first; its opposite faces meet. The same cube each time, a few ms at 32. */
export function tilingNoise(side: number): Uint8Array {
  const cube = new Float32Array(side ** 3);
  for (let period = COARSEST; period < side; period *= 2) addScale(cube, side, period);
  return Uint8Array.from(cube, (level) => Math.round(Math.min(1, Math.max(0, level * CONTRAST + 0.5)) * 255));
}
