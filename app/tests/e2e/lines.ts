// A glowing world's lines on a still, as a net: the glowing pixels thinned to their middle line (Zhang and Suen's thinning), its ends
// and junctions, its runs between them, and along it the lines' width and light. Cell edges meet at junctions and seldom end; a
// noise's zero lines never do, and a hairline breaking into dots ends everywhere. A junction is where three lines or more leave a pixel
// of the middle line (its crossing number), never a staircase's corner. The helpers run in the reading page, declared there.

import { correlation } from "@gnoworld/core";
import type { Page } from "./fixtures.ts";
import type { Circle } from "./lab.ts";
import { reading, type Tools } from "./pixels.ts";

type Kind = "veins" | "fractures";
interface Net {
  readonly mask: Uint8Array;
  readonly inside: Uint8Array;
  readonly w: number;
  readonly x0: number;
  readonly y0: number;
}
export interface Lines {
  /** The glowing share of the disc, inside 0.85 of its radius. */
  readonly glow: number;
  readonly length: number;
  readonly ends: number;
  readonly junctions: number;
  /** Windows of 60 px along the runs, and how many of them are straight: their chord 98.5% of their path at 10 px steps or more. */
  readonly windows: number;
  readonly straight: number;
  /** The lines' mean width in pixels, the spread of their width and of their light along their middle, each over its mean, and how
   * far their light follows their width (a correlation, -1 to 1). */
  readonly width: number;
  readonly widthSpread: number;
  readonly lightSpread: number;
  readonly widthLight: number;
}

// Gold to orange glow, a vein's; or any warm glow, a fracture's.
function glowing([red, green, blue]: readonly number[], light: number, kind: Kind): boolean {
  const [r = 0, g = 0, b = 0] = [red, green, blue];
  if (kind === "fractures") return light > 60 && r > b + 40;
  return r > 90 && r > g && g >= b && r - b > 50;
}

function netOf({ x, y, r }: Circle, kind: Kind): Net {
  const { image, luma, rgbAt } = Reflect.get(globalThis, "__pixels") as Tools;
  const [x0, y0, w] = [Math.ceil(x - r), Math.ceil(y - r), Math.floor(2 * r)];
  const [mask, inside] = [new Uint8Array(w * w), new Uint8Array(w * w)];
  for (let i = 0; i < w * w; i++) {
    const [px, py] = [x0 + (i % w), y0 + Math.floor(i / w)];
    if ((px - x) ** 2 + (py - y) ** 2 > (0.85 * r) ** 2) continue;
    inside[i] = 1;
    mask[i] = glowing(rgbAt(image, px, py), luma(image, px, py), kind) ? 1 : 0;
  }
  return { mask, inside, w, x0, y0 };
}

// The eight neighbours from the north, clockwise; the disc's mask is empty at its box's edges, so no index wraps onto a lit pixel.
function around(m: Uint8Array, w: number, i: number): number[] {
  return [-w, -w + 1, 1, w + 1, w, w - 1, -1, -w - 1].map((step) => ((m[i + step] ?? 0) > 0 ? 1 : 0));
}

// How many lines leave a pixel: the turns from out to in around its neighbours `n`.
function crossing(n: readonly number[]): number {
  return n.filter((value, at) => value === 0 && n[(at + 1) % 8] === 1).length;
}

// Zhang and Suen's test of a pixel by its neighbours `n` on `pass` 0 or 1: an edge pixel of a line thicker than one, not its end.
function removable(n: readonly number[], pass: number): boolean {
  const count = n.reduce((sum, value) => sum + value, 0);
  const turns = crossing(n);
  const [north = 0, east = 0, south = 0, west = 0] = [n[0], n[2], n[4], n[6]];
  const side = pass === 0 ? east * south * (north + west) : north * west * (east + south);
  return count >= 2 && count <= 6 && turns === 1 && side === 0;
}

function thinned(mask: Uint8Array, w: number): Uint8Array {
  const m = Uint8Array.from(mask);
  let changed = true;
  while (changed) {
    changed = false;
    for (const pass of [0, 1]) {
      const gone = [...m.keys()].filter((i) => m[i] === 1 && removable(around(m, w, i), pass));
      for (const i of gone) m[i] = 0;
      changed ||= gone.length > 0;
    }
  }
  return m;
}

// The distance of each pixel of the mask to its edge, by sides (1) and corners (the root of 2): one sweep forward, one back.
function distances(mask: Uint8Array, w: number): Float32Array {
  const d = Float32Array.from(mask, (value) => (value > 0 ? 1e9 : 0));
  const cost = (step: number) => (Math.abs(step) === 1 || Math.abs(step) === w ? 1 : Math.SQRT2);
  const sweep = (i: number, sign: number) => {
    for (const step of [1, w, w + 1, w - 1].map((one) => sign * one))
      d[i] = Math.min(d[i] ?? 0, (d[i + step] ?? 1e9) + cost(step));
  };
  for (let i = 0; i < d.length; i++) if ((d[i] ?? 0) > 0) sweep(i, -1);
  for (let i = d.length - 1; i >= 0; i--) if ((d[i] ?? 0) > 0) sweep(i, 1);
  return d;
}

function runsOf(s: Uint8Array, w: number): number[][] {
  const ring = [-w - 1, -w, -w + 1, -1, 1, w - 1, w, w + 1];
  const next = (i: number) => ring.map((step) => i + step).filter((n) => s[n] === 1);
  const node = (i: number) => crossing(around(s, w, i)) !== 2;
  const [used, runs] = [new Uint8Array(s.length), [] as number[][]];
  for (const start of [...s.keys()].filter((i) => s[i] === 1 && node(i)))
    for (const first of next(start).filter((i) => !node(i) && used[i] === 0)) {
      const run = [start];
      let at = first;
      while (at >= 0 && !node(at) && used[at] === 0) {
        used[at] = 1;
        run.push(at);
        at = next(at).find((n) => n !== run[run.length - 2] && used[n] === 0) ?? -1;
      }
      runs.push(at >= 0 && node(at) ? [...run, at] : run);
    }
  return runs;
}

function straightOf(runs: readonly number[][], w: number): { windows: number; straight: number } {
  const apart = (one: number, other: number) =>
    Math.hypot((one % w) - (other % w), Math.floor(one / w) - Math.floor(other / w));
  let [windows, straight] = [0, 0];
  for (const run of runs)
    for (let a = 0; a + 60 <= run.length; a += 10) {
      const path = [0, 10, 20, 30, 40, 50, 59].map((k) => run[a + k] ?? 0);
      const walked = path.slice(1).reduce((sum, at, k) => sum + apart(at, path[k] ?? at), 0);
      [windows, straight] = [windows + 1, straight + (apart(path[0] ?? 0, path[6] ?? 0) >= 0.985 * walked ? 1 : 0)];
    }
  return { windows, straight };
}

function meanOf(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
}

function spreadOf(values: readonly number[]): number {
  const mean = meanOf(values);
  return Math.sqrt(meanOf(values.map((value) => (value - mean) ** 2))) / Math.max(mean, 1e-6);
}

function linesOf({ discs, kind }: { discs: readonly Circle[]; kind: Kind }): Lines[] {
  const { image, luma } = Reflect.get(globalThis, "__pixels") as Tools;
  return discs.map((disc) => {
    const { mask, inside, w, x0, y0 } = netOf(disc, kind);
    const s = thinned(mask, w);
    const middle = [...s.keys()].filter((i) => s[i] === 1 && inside[i] === 1);
    const rings = middle.map((i) => around(s, w, i));
    // An end where a line leaves the read circle is the circle's, not the line's: only ends 2 px inside it count.
    const inner = (i: number) => Math.hypot(x0 + (i % w) - disc.x, y0 + Math.floor(i / w) - disc.y) < 0.85 * disc.r - 2;
    const lone = (n: readonly number[]) => crossing(n) === 1 && n.reduce((total, value) => total + value, 0) <= 2;
    const ends = middle.filter((i, at) => lone(rings[at] ?? []) && inner(i)).length;
    const forks = middle.filter((_, at) => crossing(rings[at] ?? []) >= 3);
    const touching = (one: number, other: number) =>
      Math.abs((one % w) - (other % w)) <= 1 && Math.abs(Math.floor(one / w) - Math.floor(other / w)) <= 1;
    const joined = forks.filter((i) => !forks.some((other) => other < i && touching(other, i)));
    const depth = distances(mask, w);
    const widths = middle.map((i) => 2 * (depth[i] ?? 0) - 1);
    const lights = middle.map((i) => luma(image, x0 + (i % w), y0 + Math.floor(i / w)));
    return {
      glow: meanOf([...mask].filter((_, i) => inside[i] === 1)),
      length: middle.length,
      ends,
      junctions: joined.length,
      ...straightOf(runsOf(s, w), w),
      width: meanOf(widths),
      widthSpread: spreadOf(widths),
      lightSpread: spreadOf(lights),
      widthLight: (Reflect.get(globalThis, "correlation") as typeof correlation)(
        widths.map((width, at) => [width, lights[at] ?? 0] as const),
      ),
    };
  });
}

const HELPERS = [
  glowing,
  netOf,
  around,
  crossing,
  removable,
  thinned,
  distances,
  runsOf,
  straightOf,
  meanOf,
  spreadOf,
  correlation,
]
  .map(String)
  .join("\n");

/** Each disc's glowing lines as a net: `veins` reads gold to orange glow, `fractures` any warm glow. */
export const lines = (page: Page, picture: Buffer, asked: { discs: readonly Circle[]; kind: Kind }): Promise<Lines[]> =>
  reading(page, [picture], [linesOf, asked, HELPERS]);

/** The ground between a glowing world's lines, inside 0.85 of its radius: the luma of its darkest quarter, and its mean red over its
 * mean blue as a difference (a dark maroon's warmth). */
export interface Cells {
  readonly floor: number;
  readonly warmth: number;
}

function cellsOf({ discs, kind }: { discs: readonly Circle[]; kind: Kind }): Cells[] {
  const { image, luma, rgbAt } = Reflect.get(globalThis, "__pixels") as Tools;
  return discs.map((disc) => {
    const { mask, inside, w, x0, y0 } = netOf(disc, kind);
    const off = [...inside.keys()].filter((i) => inside[i] === 1 && mask[i] === 0);
    const lumas = off.map((i) => luma(image, x0 + (i % w), y0 + Math.floor(i / w))).sort((one, other) => one - other);
    const warmth = off.reduce((sum, i) => {
      const [red, , blue] = rgbAt(image, x0 + (i % w), y0 + Math.floor(i / w));
      return sum + red - blue;
    }, 0);
    return { floor: lumas[Math.floor(lumas.length / 4)] ?? 0, warmth: warmth / Math.max(off.length, 1) };
  });
}

export const cells = (page: Page, picture: Buffer, asked: { discs: readonly Circle[]; kind: Kind }): Promise<Cells[]> =>
  reading(page, [picture], [cellsOf, asked, HELPERS]);
