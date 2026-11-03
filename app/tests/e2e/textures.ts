import type { Page } from "./fixtures.ts";
import type { Circle } from "./lab.ts";
import { dayBox } from "./portraits.ts";
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
/** A world's face as a glance takes it: the mean Lab colour of its sea and of its land (null where it shows none), and the shares of its
 * lit disc under cloud, sea and land. */
export interface Face {
  readonly sea: readonly [number, number, number] | null;
  readonly land: readonly [number, number, number] | null;
  readonly clouds: number;
  readonly shares: { readonly sea: number; readonly land: number };
}
/** A part a world shows covers a tenth of its lit disc at least, a share's glance step (core's variety.ts): on a few pixels it reads
 * nothing. */
const SHOWN = 0.1;
export const shownPart = (face: Face, part: "sea" | "land") => (face.shares[part] >= SHOWN ? face[part] : null);
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

// Each pixel of a tile less the mean of the square `reach` pixels around it, 9 by 9 unless asked: the broad shading out.
function fineIn(left: number, top: number, reach = 4): Float64Array {
  const { image, luma } = Reflect.get(globalThis, "__pixels") as Tools;
  const side = 2 * reach + 1;
  return Float64Array.from({ length: 24 * 24 }, (_, i) => {
    const [x, y] = [left + (i % 24), top + Math.floor(i / 24)];
    let sum = 0;
    for (let at = 0; at < side * side; at++)
      sum += luma(image, x + (at % side) - reach, y + Math.floor(at / side) - reach);
    return luma(image, x, y) - sum / (side * side);
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

// How far a disc's finest detail (fineIn at a reach of 2, a 5 by 5 mean) follows from one row to the next, a correlation over the close
// detail's box in 24-pixel tiles: hairs a pixel or two tall along a latitude, a giant's fivefold streak, break it.
function rowsOf(discs: readonly Circle[]): number[] {
  return discs.map((disc) => {
    const [x0, x1, y0, y1] = dayBox(disc);
    let [n, one, next, both, ones, nexts] = [0, 0, 0, 0, 0, 0];
    for (let tile = 0; tile < Math.floor((x1 - x0) / 24) * Math.floor((y1 - y0) / 24); tile++) {
      const across = Math.floor((x1 - x0) / 24);
      const fine = fineIn(x0 + 24 * (tile % across), y0 + 24 * Math.floor(tile / across), 2);
      for (let i = 0; i < 24 * 23; i++) {
        const [a, b] = [fine[i] ?? 0, fine[i + 24] ?? 0];
        [n, one, next, both, ones, nexts] = [n + 1, one + a, next + b, both + a * b, ones + a * a, nexts + b * b];
      }
    }
    const [ma, mb] = [one / n, next / n];
    return (both / n - ma * mb) / Math.max(Math.sqrt((ones / n - ma * ma) * (nexts / n - mb * mb)), 1e-9);
  });
}

// A lit pixel (luma over 25) inside 0.9 of a disc's radius: cloud where it is pale (past L* 55, under 8 of chroma), which is neither land
// nor sea; sea where its blue leads its red and green; else land.
function kindOf({ x, y, r }: Circle, px: number, py: number): "sea" | "land" | "cloud" | null {
  const { image, luma, rgbAt, labAt } = Reflect.get(globalThis, "__pixels") as Tools;
  if ((px - x) ** 2 + (py - y) ** 2 > (0.9 * r) ** 2 || luma(image, px, py) <= 25) return null;
  const [lightness, a, b] = labAt(image, px, py);
  if (lightness > 55 && Math.hypot(a, b) < 8) return "cloud";
  const [red, green, blue] = rgbAt(image, px, py);
  return blue > red + 8 && blue >= green ? "sea" : "land";
}

// Land's pieces join by their sides.
function landOf(discs: readonly Circle[]): Land[] {
  return discs.map((disc) => {
    const { x, y, r } = disc;
    const [x0, y0, w] = [Math.ceil(x - r), Math.ceil(y - r), Math.floor(2 * r)];
    const [land, seen] = [new Uint8Array(w * w), new Uint8Array(w * w)];
    let lit = 0;
    for (let i = 0; i < w * w; i++) {
      const kind = kindOf(disc, x0 + (i % w), y0 + Math.floor(i / w));
      if (kind === null || kind === "cloud") continue;
      lit += 1;
      land[i] = kind === "land" ? 1 : 0;
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
export const rows = (page: Page, picture: Buffer, discs: readonly Circle[]): Promise<number[]> =>
  reading(page, [picture], [rowsOf, discs, [fineIn, dayBox].map(String).join("\n")]);
function facesOf(discs: readonly Circle[]): Face[] {
  const { image, labAt, inside } = Reflect.get(globalThis, "__pixels") as Tools;
  const mean = ([l, a, b, n]: readonly number[]) =>
    (n ?? 0) === 0 ? null : ([(l ?? 0) / (n ?? 1), (a ?? 0) / (n ?? 1), (b ?? 0) / (n ?? 1)] as const);
  return discs.map((disc) => {
    const sums = { sea: [0, 0, 0, 0], land: [0, 0, 0, 0] };
    let [lit, clouds] = [0, 0];
    for (const [px, py] of inside(disc, 0.9)) {
      const kind = kindOf(disc, px, py);
      if (kind === null) continue;
      [lit, clouds] = [lit + 1, clouds + Number(kind === "cloud")];
      if (kind === "cloud") continue;
      const [l, a, b] = labAt(image, px, py);
      const [sl = 0, sa = 0, sb = 0, n = 0] = sums[kind];
      sums[kind] = [sl + l, sa + a, sb + b, n + 1];
    }
    const share = ([, , , n = 0]: readonly number[]) => n / Math.max(lit, 1);
    return {
      sea: mean(sums.sea),
      land: mean(sums.land),
      clouds: clouds / Math.max(lit, 1),
      shares: { sea: share(sums.sea), land: share(sums.land) },
    };
  });
}

export const facesOn = (page: Page, picture: Buffer, discs: readonly Circle[]): Promise<Face[]> =>
  reading(page, [picture], [facesOf, discs, String(kindOf)]);
export const landOn = (page: Page, picture: Buffer, discs: readonly Circle[]): Promise<Land[]> =>
  reading(page, [picture], [landOf, discs, String(kindOf)]);
