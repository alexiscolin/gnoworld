import type { Page } from "./fixtures.ts";
import type { Circle } from "./lab.ts";
import { reading, type Tools } from "./pixels.ts";
import { colourKind, KINDS } from "./textures.ts";

// A temperate world's coasts as a still shows them (7b8), each pixel by textures.ts's colourKind on the disc's day side: its land in pieces,
// its coast's length against a smoothed copy of itself, the islands wholly at sea, and the sea's lift near a coast against the open sea's
// in the same part of the disc. The Earth's view is read the same way; climates.ts reads the land by latitude on the same grid.
export interface Shore {
  /** The land's share of the lit ground, cloud left out. */
  readonly share: number;
  /** Each piece's share of the land, largest first, pieces of a hundredth of it or more. */
  readonly pieces: readonly number[];
  /** The coast's length over its copy smoothed by a box a twentieth of the radius wide: 1 for a smooth shore. */
  readonly jagged: number;
  /** The smoothed coast's length over the root of the land's area: about 3.5 for one round piece, times the root of a count of them. */
  readonly broken: number;
  /** Pieces of land wholly at sea, of 12 px to a fiftieth of the land, and pieces of a twentieth of it or more. */
  readonly islands: number;
  readonly continents: number;
  /** The sea's lift in L* over the ring past it, in the same quarter-radius tile, so the light's fall over the disc counts little: a shelf,
   * 0 to 2% of the radius off a coast over 2% to 6%; a wide halo, 2% to 6% over 6% to 12%. */
  readonly shelf: number;
  readonly halo: number;
}
// colourKind as the reading page holds it: a function this module imports is a property of the import's binding once compiled, which that
// page does not have.
const byColour = (): typeof colourKind => Reflect.get(globalThis, "colourKind") as typeof colourKind;
export interface Grid {
  /** 0 nothing read, 1 sea, 2 land, 3 cloud. */
  readonly kinds: Uint8Array;
  readonly w: number;
  readonly x0: number;
  readonly y0: number;
}

// Sums of `values` over boxes of a w by w square, by its summed table: `box(at, reach)` sums the box `reach` pixels round pixel `at`.
function boxes(values: (at: number) => number, w: number): (at: number, reach: number) => number {
  const sum = new Float64Array((w + 1) * (w + 1));
  const cell = (x: number, y: number) => sum[y * (w + 1) + x] ?? 0;
  for (let at = 0; at < w * w; at++) {
    const [x, y] = [at % w, Math.floor(at / w)];
    sum[(y + 1) * (w + 1) + x + 1] = values(at) + cell(x + 1, y) + cell(x, y + 1) - cell(x, y);
  }
  return (at, reach) => {
    const [x, y] = [at % w, Math.floor(at / w)];
    const [x0, y0, x1, y1] = [
      Math.max(x - reach, 0),
      Math.max(y - reach, 0),
      Math.min(x + reach + 1, w),
      Math.min(y + reach + 1, w),
    ];
    return cell(x1, y1) - cell(x1, y0) - cell(x0, y1) + cell(x0, y0);
  };
}

// The disc's square, read on its day side inside 0.9 of its radius: a pixel over luma 8 whose box, a twenty-fifth of the radius wide, is
// over 12, so a dark sea in the sun reads, and neither the Earth's city lights in its night nor a world's night glow.
export function gridOf(disc: Circle): Grid {
  const { image, luma } = Reflect.get(globalThis, "__pixels") as Tools;
  const [x0, y0, w] = [Math.ceil(disc.x - disc.r), Math.ceil(disc.y - disc.r), Math.floor(2 * disc.r)];
  const codes = { sea: 1, land: 2, cloud: 3 } as const;
  const kinds = new Uint8Array(w * w);
  const lumaAt = (at: number) => luma(image, x0 + (at % w), y0 + Math.floor(at / w));
  const around = boxes(lumaAt, w);
  const reach = Math.max(2, Math.round(disc.r / 25));
  for (let at = 0; at < w * w; at++) {
    const [px, py] = [x0 + (at % w), y0 + Math.floor(at / w)];
    const inside = (px - disc.x) ** 2 + (py - disc.y) ** 2 <= (0.9 * disc.r) ** 2;
    if (!inside || lumaAt(at) <= 8 || around(at, reach) < 12 * (2 * reach + 1) ** 2) continue;
    kinds[at] = codes[byColour()(px, py)];
  }
  return { kinds, w, x0, y0 };
}

// One piece of land from `start`, joined by sides: its size, and whether every pixel beside it is sea.
function fill({ kinds, w }: Grid, seen: Uint8Array, start: number): { size: number; atSea: boolean } {
  const stack = [start];
  seen[start] = 1;
  let [size, atSea] = [0, true];
  for (let at = stack.pop(); at !== undefined; at = stack.pop()) {
    size += 1;
    for (const next of [at - 1, at + 1, at - w, at + w]) {
      const kind = kinds[next] ?? 0;
      if (kind === 2 && seen[next] !== 1) [seen[next], stack[stack.length]] = [1, next];
      atSea &&= kind === 1 || kind === 2;
    }
  }
  return { size, atSea };
}

// Sides between land and sea, of the grid or of a copy whose land is `land`, counted where both pixels are land or sea in the grid.
function coastOf({ kinds, w }: Grid, land: (at: number) => boolean): number {
  const known = (at: number) => kinds[at] === 1 || kinds[at] === 2;
  let sides = 0;
  for (let at = 0; at < kinds.length; at++)
    for (const next of [at + 1, at + w]) if (known(at) && known(next) && land(at) !== land(next)) sides += 1;
  return sides;
}

// The land smoothed: a pixel is land where most of the land or sea in the box `reach` pixels round it is land.
function smoothed({ kinds, w }: Grid, reach: number): (at: number) => boolean {
  const land = boxes((at) => Number(kinds[at] === 2), w);
  const known = boxes((at) => Number(kinds[at] === 1 || kinds[at] === 2), w);
  return (at) => land(at, reach) >= 0.5 * known(at, reach);
}

// How far each pixel lies from land, in pixels by sides, across sea and cloud: land 0, the rest Infinity.
function reachOf({ kinds, w }: Grid): Float32Array {
  const far = new Float32Array(kinds.length).fill(Infinity);
  const queue = [...kinds.keys()].filter((at) => kinds[at] === 2);
  for (const at of queue) far[at] = 0;
  for (const at of queue)
    for (const next of [at - 1, at + 1, at - w, at + w])
      if ((kinds[next] === 1 || kinds[next] === 3) && far[next] === Infinity)
        [far[next], queue[queue.length]] = [(far[at] ?? 0) + 1, next];
  return far;
}

// Adds `values` times `weight` into `sum`, entry by entry: nothing where there is no sum.
export function added(sum: number[] | undefined, values: readonly number[], weight: number): void {
  if (sum !== undefined) for (const [at, value] of values.entries()) sum[at] = (sum[at] ?? 0) + weight * value;
}

// The shelf's and the halo's lifts (Shore), 0 where a ring holds under 50 pixels in tiles holding 20 of it and 20 of the next. A tile
// holds each ring's count then its summed L*, ring by ring outward.
function liftsOf(grid: Grid, r: number): Pick<Shore, "shelf" | "halo"> {
  const { image, labAt } = Reflect.get(globalThis, "__pixels") as Tools;
  const [side, tiles] = [Math.max(1, Math.round(r / 4)), new Map<number, number[]>()];
  for (const [at, away] of reachOf(grid).entries()) {
    const ring = away < 0.02 * r ? 0 : away < 0.06 * r ? 2 : away < 0.12 * r ? 4 : -1;
    if (grid.kinds[at] !== 1 || !Number.isFinite(away) || ring < 0) continue;
    const [x, y] = [at % grid.w, Math.floor(at / grid.w)];
    const key = Math.floor(x / side) * 1000 + Math.floor(y / side);
    const values = [0, 0, 0, 0, 0, 0].map((_, entry): number => (entry === ring ? 1 : 0));
    values[ring + 1] = labAt(image, grid.x0 + x, grid.y0 + y)[0];
    tiles.set(key, tiles.get(key) ?? []);
    added(tiles.get(key), values, 1);
  }
  const lift = (ring: number) => {
    const held = [...tiles.values()].filter((tile) => (tile[ring] ?? 0) >= 20 && (tile[ring + 2] ?? 0) >= 20);
    const count = held.reduce((sum, tile) => sum + (tile[ring] ?? 0), 0);
    const beyond = (tile: readonly number[]) => ((tile[ring + 3] ?? 0) / (tile[ring + 2] ?? 1)) * (tile[ring] ?? 0);
    return count < 50 ? 0 : held.reduce((sum, tile) => sum + (tile[ring + 1] ?? 0) - beyond(tile), 0) / count;
  };
  return { shelf: lift(0), halo: lift(2) };
}

function shoresOf(discs: readonly Circle[]): Shore[] {
  return discs.map((disc) => {
    const grid = gridOf(disc);
    const seen = new Uint8Array(grid.kinds.length);
    const pieces: { size: number; atSea: boolean }[] = [];
    for (let at = 0; at < grid.kinds.length; at++)
      if (grid.kinds[at] === 2 && seen[at] !== 1) pieces.push(fill(grid, seen, at));
    const land = pieces.reduce((sum, { size }) => sum + size, 0);
    const known = grid.kinds.filter((kind) => kind === 1 || kind === 2).length;
    const coast = coastOf(grid, (at) => grid.kinds[at] === 2);
    const smooth = coastOf(grid, smoothed(grid, Math.max(2, Math.round(disc.r / 20))));
    const shares = pieces.map(({ size }) => size / Math.max(land, 1)).sort((a, b) => b - a);
    return {
      share: land / Math.max(known, 1),
      pieces: shares.filter((share) => share >= 0.01),
      jagged: coast / Math.max(smooth, 1),
      broken: smooth / Math.sqrt(Math.max(land, 1)),
      islands: pieces.filter(({ size, atSea }) => atSea && size >= 12 && size < 0.02 * land).length,
      continents: pieces.filter(({ size }) => size >= 0.05 * land).length,
      ...liftsOf(grid, disc.r),
    };
  });
}

/** What a page reading the grid needs: kindOf's colours, the box sums and the grid itself. */
export const READ = [KINDS, `const byColour = ${String(byColour)};`, boxes, gridOf, added].map(String).join("\n");
const SHORES = [READ, fill, coastOf, smoothed, reachOf, liftsOf].map(String).join("\n");

export const shoresOn = (page: Page, picture: Buffer, discs: readonly Circle[]): Promise<Shore[]> =>
  reading(page, [picture], [shoresOf, discs, SHORES]);
