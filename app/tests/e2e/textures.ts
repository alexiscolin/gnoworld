import type { Page } from "./fixtures.ts";
import type { Circle } from "./lab.ts";
import { reading, type Tools } from "./pixels.ts";

// How a world's ground is ordered on a still: in 24-pixel tiles of its lit ground, the structure tensor of the lightness with its broad
// shading taken out (how much of a tile runs one way, and which way), and along that way the lightness's own echo (an autocorrelation:
// parallel grooves echo at their spacing); and its land (neither sea nor dark) as pieces.
export interface Grain {
  /** Of the bright tiles (a grooved world's lanes) coherent past 0.5, the share whose direction stands 45 degrees or more from their
   * commonest. */
  readonly crossing: number;
  /** Of the bright tiles, the share whose lightness echoes across them at 6 to 10 px. */
  readonly period: number;
}
export interface Land {
  readonly share: number;
  /** The share of the land in its largest piece. */
  readonly largest: number;
}
interface Tile {
  readonly coherence: number;
  readonly angle: number;
  readonly light: number;
  /** The lag, in pixels, where the lightness echoes best across the tile's grain, 0 when it never does past 0.35. */
  readonly echo: number;
}

// Each pixel of a tile less the mean of the 9 by 9 around it: the broad shading out.
function fineIn(left: number, top: number): Float64Array {
  const { image, luma } = Reflect.get(globalThis, "__pixels") as Tools;
  return Float64Array.from({ length: 24 * 24 }, (_, i) => {
    const [x, y] = [left + (i % 24), top + Math.floor(i / 24)];
    let sum = 0;
    for (let at = 0; at < 81; at++) sum += luma(image, x + (at % 9) - 4, y + Math.floor(at / 9) - 4);
    return luma(image, x, y) - sum / 81;
  });
}

// The best echo of a tile's `fine` lightness along the unit step (dx, dy), at 3 to 14 px: the lag of its first peak past 0.35.
function echoOf(fine: Float64Array, dx: number, dy: number): number {
  const at = (x: number, y: number) => fine[Math.round(y) * 24 + Math.round(x)] ?? 0;
  const correlation = (lag: number) => {
    let [product, energy] = [0, 0];
    for (let i = 0; i < 24 * 24; i++) {
      const [x, y] = [(i % 24) + lag * dx, Math.floor(i / 24) + lag * dy];
      if (x < 0 || y < 0 || x > 23 || y > 23) continue;
      [product, energy] = [product + at(i % 24, Math.floor(i / 24)) * at(x, y), energy + at(x, y) ** 2];
    }
    return energy > 0 ? product / energy : 0;
  };
  const echoes = Array.from({ length: 16 }, (_, lag) => correlation(lag));
  const peak = echoes.findIndex(
    (value, lag) =>
      lag >= 3 && lag <= 14 && value > 0.35 && value >= (echoes[lag - 1] ?? 0) && value >= (echoes[lag + 1] ?? 0),
  );
  return Math.max(peak, 0);
}

function tileOf(left: number, top: number): Tile {
  const { image, luma } = Reflect.get(globalThis, "__pixels") as Tools;
  const fine = fineIn(left, top);
  let [xx, yy, xy, light] = [0, 0, 0, 0];
  for (let i = 0; i < 22 * 22; i++) {
    const [x, y] = [1 + (i % 22), 1 + Math.floor(i / 22)];
    const gx = (fine[y * 24 + x + 1] ?? 0) - (fine[y * 24 + x - 1] ?? 0);
    const gy = (fine[(y + 1) * 24 + x] ?? 0) - (fine[(y - 1) * 24 + x] ?? 0);
    [xx, yy, xy, light] = [xx + gx * gx, yy + gy * gy, xy + gx * gy, light + luma(image, left + x, top + y)];
  }
  const across = 0.5 * Math.atan2(2 * xy, xx - yy);
  return {
    coherence: xx + yy > 0 ? Math.sqrt((xx - yy) ** 2 + 4 * xy * xy) / (xx + yy) : 0,
    angle: (across * 180) / Math.PI + 90,
    light: light / (22 * 22),
    echo: echoOf(fine, Math.cos(across), Math.sin(across)),
  };
}

function grainOf(discs: readonly Circle[]): Grain[] {
  const middle = (values: readonly number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;
  return discs.map(({ x, y, r }) => {
    const tiles: Tile[] = [];
    for (let top = Math.ceil(y - r); top + 24 < y + r; top += 24)
      for (let left = Math.ceil(x - r); left + 24 < x + r; left += 24)
        if ((left + 12 - x) ** 2 + (top + 12 - y) ** 2 <= (0.8 * r) ** 2) tiles.push(tileOf(left, top));
    const lit = tiles.filter(({ light }) => light >= 25);
    const bright = lit.filter(({ light }) => light >= middle(lit.map((tile) => tile.light)));
    const coherent = bright.filter(({ coherence }) => coherence >= 0.5);
    const counts = Array.from(
      { length: 12 },
      (_, bin) => coherent.filter(({ angle }) => Math.floor(angle / 15) % 12 === bin).length,
    );
    const common = (counts.indexOf(Math.max(...counts)) + 0.5) * 15;
    const apart = (angle: number) => Math.min(Math.abs(angle - common), 180 - Math.abs(angle - common));
    return {
      crossing: coherent.filter(({ angle }) => apart(angle) >= 45).length / Math.max(coherent.length, 1),
      period: bright.filter(({ echo }) => echo >= 6 && echo <= 10).length / Math.max(bright.length, 1),
    };
  });
}

const HELPERS = [fineIn, echoOf, tileOf].map(String).join("\n");

// Land is a lit pixel (luma over 25) whose blue does not lead its red and green, as sea's does, and no cloud (pale, past L* 55, under 8 of
// chroma): a cloud is neither land nor sea. Its pieces join by their sides.
function landOf(discs: readonly Circle[]): Land[] {
  const { image, luma, rgbAt, labAt } = Reflect.get(globalThis, "__pixels") as Tools;
  const cloud = (px: number, py: number) => {
    const [lightness, a, b] = labAt(image, px, py);
    return lightness > 55 && Math.hypot(a, b) < 8;
  };
  return discs.map(({ x, y, r }) => {
    const [x0, y0, w] = [Math.ceil(x - r), Math.ceil(y - r), Math.floor(2 * r)];
    const [land, seen] = [new Uint8Array(w * w), new Uint8Array(w * w)];
    let lit = 0;
    for (let i = 0; i < w * w; i++) {
      const [px, py] = [x0 + (i % w), y0 + Math.floor(i / w)];
      const [red, green, blue] = rgbAt(image, px, py);
      if ((px - x) ** 2 + (py - y) ** 2 > (0.9 * r) ** 2 || luma(image, px, py) <= 25 || cloud(px, py)) continue;
      lit += 1;
      land[i] = blue > red + 8 && blue >= green ? 0 : 1;
    }
    const sizes = [...land.keys()]
      .filter((i) => land[i] === 1)
      .map((start) => {
        let size = 0;
        const stack = seen[start] === 1 ? [] : [start];
        seen[start] = 1;
        for (let at = stack.pop(); at !== undefined; at = stack.pop()) {
          size += 1;
          for (const next of [at - 1, at + 1, at - w, at + w])
            if (land[next] === 1 && seen[next] !== 1) [seen[next], stack[stack.length]] = [1, next];
        }
        return size;
      });
    const total = sizes.reduce((sum, size) => sum + size, 0);
    return { share: total / Math.max(lit, 1), largest: Math.max(0, ...sizes) / Math.max(total, 1) };
  });
}

export const grain = (page: Page, picture: Buffer, discs: readonly Circle[]): Promise<Grain[]> =>
  reading(page, [picture], [grainOf, discs, HELPERS]);
export const landOn = (page: Page, picture: Buffer, discs: readonly Circle[]): Promise<Land[]> =>
  reading(page, [picture], [landOf, discs]);
