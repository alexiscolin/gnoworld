import type { Page } from "./fixtures.ts";
import type { Circle } from "./lab.ts";
import { reading, type Tools } from "./pixels.ts";

// What a glance takes from a world on a still (ADR-0002 §3, "variety is measured"; F4218: on what is drawn): the mean colour of its lit
// ground in CIE Lab, how much its lightness varies, and its texture's energy at four scales, each over its own lightness. A close view's
// fine detail, and two pictures' differences.
export interface Portrait {
  readonly lab: readonly [number, number, number];
  readonly spread: number;
  readonly energy: readonly number[];
  /** Its lit pixels' count, and its lightness on a 16 by 16 grid over its box, as standard scores (null where unlit). */
  readonly lit: number;
  readonly grid: readonly (number | null)[];
}
export interface Detail {
  readonly variance: number;
  readonly coarse: number;
  /** The finest scale's share over the next one's: a blur lowers it, grain raises it, a world's own contrast leaves it. */
  readonly sharpness: number;
  readonly luma: number;
  /** The energy of the lightness's steps along a latitude over across it: a giant's streaks stretched five times read about 0.1. */
  readonly along: number;
}
/** Two pictures of one view, apart: per disc, the share of lit pixels moved, and the mean move of 8-pixel blocks and of pixels. */
export interface Apart {
  readonly moved: number;
  readonly blocks: number;
  readonly fine: number;
}

// The lit ground of each disc, inside nine tenths of it and past the night: its colour, spread, and at each scale the mean absolute
// Laplacian of the lightness over blocks of that size, over the mean lightness.
const portraitsOf = (discs: readonly Circle[]) => {
  const { images, labAt, block } = Reflect.get(globalThis, "__pixels") as Tools;
  const [image] = images;
  if (image === undefined) throw new Error("no picture");
  return discs.map(({ x, y, r }) => {
    const inside = (px: number, py: number) => (px - x) ** 2 + (py - y) ** 2 < (0.9 * r) ** 2;
    const [left, top] = [Math.ceil(x - r), Math.ceil(y - r)];
    const lit: [number, number][] = [];
    let [l, a, b, l2] = [0, 0, 0, 0];
    for (let py = top; py < y + r; py++)
      for (let px = left; px < x + r; px++) {
        const [pl, pa, pb] = labAt(image, px, py);
        if (!inside(px, py) || pl < 8) continue;
        lit.push([px, py]);
        [l, a, b, l2] = [l + pl, a + pa, b + pb, l2 + pl * pl];
      }
    const n = Math.max(lit.length, 1);
    const mean = l / n;
    const energy = [1, 2, 4, 8].map((s) => {
      let [total, count] = [0, 0];
      for (const [px, py] of lit) {
        const near = [
          [px - s, py],
          [px + s, py],
          [px, py - s],
          [px, py + s],
        ] as const;
        if ((px - left) % s !== 0 || (py - top) % s !== 0 || !near.every(([nx, ny]) => inside(nx, ny))) continue;
        const around = near.reduce((sum, at) => sum + block(image, s, at), 0);
        [total, count] = [total + Math.abs(4 * block(image, s, [px, py]) - around), count + 1];
      }
      return count === 0 || mean === 0 ? 0 : total / count / mean;
    });
    const spread = Math.sqrt(Math.max(l2 / n - mean * mean, 0));
    const cells = Array.from({ length: 256 }, () => [0, 0]);
    for (const [px, py] of lit) {
      const cell =
        cells[
          Math.min(15, Math.floor(((py - top) / (2 * r)) * 16)) * 16 +
            Math.min(15, Math.floor(((px - left) / (2 * r)) * 16))
        ];
      if (cell !== undefined) [cell[0], cell[1]] = [(cell[0] ?? 0) + labAt(image, px, py)[0], (cell[1] ?? 0) + 1];
    }
    const grid = cells.map(([sum = 0, count = 0]) =>
      count < 4 || spread === 0 ? null : (sum / count - mean) / spread,
    );
    return { lab: [mean, a / n, b / n] as [number, number, number], spread, energy, lit: lit.length, grid };
  });
};

/** The day side's box of a world lit from the right, as the Earth's is read: left, right, top, bottom. */
export function dayBox({ x, y, r }: Circle): [number, number, number, number] {
  return [Math.round(x + 0.1 * r), Math.round(x + 0.5 * r), Math.round(y - 0.3 * r), Math.round(y + 0.3 * r)];
}

/** The Laplacian of a picture's `value` at (i, j): four times it less its four neighbours. */
export function laplacian(value: (i: number, j: number) => number, i: number, j: number): number {
  return 4 * value(i, j) - value(i - 1, j) - value(i + 1, j) - value(i, j - 1) - value(i, j + 1);
}
/** A picture's `value` at half size: each the mean of the 2 by 2 block at (2i, 2j). */
export function halved(value: (i: number, j: number) => number): (i: number, j: number) => number {
  return (i, j) =>
    (value(2 * i, 2 * j) + value(2 * i + 1, 2 * j) + value(2 * i, 2 * j + 1) + value(2 * i + 1, 2 * j + 1)) / 4;
}

// The day side's box: the Laplacian's variance at full size and at half.
const detailsOf = (discs: readonly Circle[]) => {
  const { images, luma } = Reflect.get(globalThis, "__pixels") as Tools;
  const [image] = images;
  if (image === undefined) throw new Error("no picture");
  return discs.map((disc) => {
    const [x0, x1, y0, y1] = dayBox(disc);
    const variance = (value: (i: number, j: number) => number, w: number, h: number) => {
      let [n, s, q] = [0, 0, 0];
      for (let j = 1; j < h - 1; j++)
        for (let i = 1; i < w - 1; i++) {
          const lap = laplacian(value, i, j);
          [n, s, q] = [n + 1, s + lap, q + lap * lap];
        }
      return q / n - (s / n) ** 2;
    };
    const at = (i: number, j: number) => luma(image, x0 + i, y0 + j);
    const half = halved(at);
    let [total, along, across] = [0, 0, 0];
    for (let j = 0; j < y1 - y0; j++)
      for (let i = 0; i < x1 - x0; i++)
        [total, along, across] = [
          total + at(i, j),
          along + (at(i + 1, j) - at(i, j)) ** 2,
          across + (at(i, j + 1) - at(i, j)) ** 2,
        ];
    const full = variance(at, x1 - x0, y1 - y0);
    const coarse = variance(half, Math.floor((x1 - x0) / 2), Math.floor((y1 - y0) / 2));
    const mean = total / ((x1 - x0) * (y1 - y0));
    return { variance: full, coarse, sharpness: full / coarse, luma: mean, along: along / Math.max(across, 1e-6) };
  });
};

// Two pictures of one disc: lit pixels moved past 8 of 255, and the mean move of 8-pixel blocks and of pixels over the lightness.
const apartOf = (discs: readonly Circle[]) => {
  const { images, labAt, block } = Reflect.get(globalThis, "__pixels") as Tools;
  const [first, second] = images;
  if (first === undefined || second === undefined) throw new Error("two pictures");
  return discs.map(({ x, y, r }) => {
    const [left, top] = [Math.ceil(x - r), Math.ceil(y - r)];
    let [lit, moved, blocks, fine, count, light] = [0, 0, 0, 0, 0, 0];
    for (let py = top; py < y + r; py++)
      for (let px = left; px < x + r; px++) {
        const [one, other] = [labAt(first, px, py)[0], labAt(second, px, py)[0]];
        if ((px - x) ** 2 + (py - y) ** 2 >= (0.9 * r) ** 2 || one < 8) continue;
        const at = (py * first.width + px) * 4;
        const gap = Math.max(...[0, 1, 2].map((c) => Math.abs((first.data[at + c] ?? 0) - (second.data[at + c] ?? 0))));
        [lit, moved, light, fine] = [lit + 1, moved + (gap > 8 ? 1 : 0), light + one, fine + Math.abs(one - other)];
        if ((px - left) % 8 !== 0 || (py - top) % 8 !== 0) continue;
        [blocks, count] = [blocks + Math.abs(block(first, 8, [px, py]) - block(second, 8, [px, py])), count + 1];
      }
    const mean = light / Math.max(lit, 1);
    return {
      moved: moved / Math.max(lit, 1),
      blocks: blocks / Math.max(count, 1) / mean,
      fine: fine / Math.max(lit, 1) / mean,
    };
  });
};

export const portraits = (page: Page, picture: Buffer, places: readonly Circle[]): Promise<Portrait[]> =>
  reading(page, [picture], [portraitsOf, places]);
export const details = (page: Page, picture: Buffer, places: readonly Circle[]): Promise<Detail[]> =>
  reading(page, [picture], [detailsOf, places, [dayBox, laplacian, halved].map(String).join("\n")]);
export const apart = (
  page: Page,
  [before, after]: readonly [Buffer, Buffer],
  places: readonly Circle[],
): Promise<Apart[]> => reading(page, [before, after], [apartOf, places]);

// Steps a glance misses: core's 10 in Lab for the colour (variety.ts), a lightness spread within 4, each scale's energy within 30%; and
// one picture: their lightness grids correlate past 0.8 where both are lit (a world turned another way is another picture).
const SAME_COLOUR = 10;
const SAME_SPREAD = 4;
const SAME_ENERGY = Math.log(1.3);
const SAME_PICTURE = 0.8;
const CELLS_TO_JUDGE = 32;

function correlation(one: readonly (number | null)[], other: readonly (number | null)[]): number {
  const both = one.flatMap((value, at) => {
    const twin = other[at];
    return value === null || twin === null || twin === undefined ? [] : [[value, twin] as const];
  });
  if (both.length < CELLS_TO_JUDGE) return 1;
  const mean = (values: readonly number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const [ma, mb] = [mean(both.map(([a]) => a)), mean(both.map(([, b]) => b))];
  const [ab, aa, bb] = both.reduce(
    ([x, y, z], [a, b]) => [x + (a - ma) * (b - mb), y + (a - ma) ** 2, z + (b - mb) ** 2],
    [0, 0, 0],
  );
  return aa === 0 || bb === 0 ? 1 : ab / Math.sqrt(aa * bb);
}

export function alikeOnScreen(one: Portrait, other: Portrait): boolean {
  const [dl, da, db] = [0, 1, 2].map((at) => (one.lab[at] ?? 0) - (other.lab[at] ?? 0)) as [number, number, number];
  return (
    Math.hypot(dl, da, db) < SAME_COLOUR &&
    Math.abs(one.spread - other.spread) < SAME_SPREAD &&
    one.energy.every((value, at) => Math.abs(Math.log(value / (other.energy[at] ?? 0))) < SAME_ENERGY) &&
    correlation(one.grid, other.grid) > SAME_PICTURE
  );
}

/** The pairs a glance would take for one world, among a view's. */
export function alikePairs(all: readonly Portrait[]): [number, number][] {
  const pairs: [number, number][] = [];
  for (let one = 0; one < all.length; one += 1)
    for (let other = one + 1; other < all.length; other += 1) {
      const [first, second] = [all[one], all[other]];
      if (first !== undefined && second !== undefined && alikeOnScreen(first, second)) pairs.push([one, other]);
    }
  return pairs;
}

/** At each scale, how far a view's textures spread: the ratio of their 90th to their 10th percentile, over the discs that hold one. */
export function textureSpread(all: readonly Portrait[]): number[] {
  return [0, 1, 2, 3].map((scale) => {
    const values = all
      .map(({ energy }) => energy[scale] ?? 0)
      .filter((value) => value > 0)
      .sort((one, other) => one - other);
    const at = (share: number) => values[Math.floor(share * (values.length - 1))] ?? 0;
    return at(0.1) === 0 ? 0 : at(0.9) / at(0.1);
  });
}
