// Layer 3 of ADR-0002 §3, a world's palette: its anchor's two real ramps interpolated in CIE Lab under D65, its lightness and chroma
// graded, turned by its system's hue, and given as linear sRGB, the space three draws in. Only + - * / reach a colour (look.ts): a power
// and a cube root are fixed runs of Newton's steps, so every engine gives one palette. Tier 1 (docs/REVIEW.md).
import type { Ramp, Rgb } from "./anchors.ts";

export type Lab = readonly [number, number, number];
type Trio<T> = readonly [T, T, T];

/** A world's three colours, low to high: in Lab (L from 0 to 100), and as linear sRGB in [0, 1], clamped. */
export interface Palette {
  readonly lab: Trio<Lab>;
  readonly linear: Trio<Rgb>;
}

/** A turn of the a-b plane, as its cosine and sine. */
export interface Turn {
  readonly cos: number;
  readonly sin: number;
}

/** Where a palette sits between its two ramps, how its lightness and chroma are graded, and how its hue turns. */
export interface Grade {
  readonly blend: number;
  readonly lightness: number;
  readonly chroma: number;
  readonly turn: Turn;
}

export const NO_TURN: Turn = { cos: 1, sin: 0 };
// tan(6°): a rotation written from half its angle's tangent stays exact in + - * /, and reaches 12 degrees at most.
const TAN_SIX = 0.10510423526567646;
const WHITE = [0.95047, 1, 1.08883] as const;
const EDGE = 6 / 29;
const STEPS = 32;
const LIGHTEST = 100;

// The cube and fifth roots of a share by Newton's steps from 1, from above: monotone, and close to an ulp long before the last step.
function cubeRoot(value: number): number {
  let root = 1;
  for (let step = 0; step < STEPS; step += 1) root = (2 * root + value / (root * root)) / 3;
  return root;
}

function fifthRoot(value: number): number {
  let root = 1;
  for (let step = 0; step < STEPS; step += 1) root = (4 * root + value / (root * root * root * root)) / 5;
  return root;
}

// sRGB's curve undone: x to the power 2.4 is x² times the fifth root of x².
function decoded(channel: number): number {
  if (channel <= 0.04045) return channel / 12.92;
  const base = (channel + 0.055) / 1.055;
  return base * base * fifthRoot(base * base);
}

const curve = (value: number): number =>
  value > EDGE * EDGE * EDGE ? cubeRoot(value) : value / (3 * EDGE * EDGE) + 4 / 29;
const uncurve = (value: number): number => (value > EDGE ? value * value * value : 3 * EDGE * EDGE * (value - 4 / 29));
const clamped = (value: number): number => Math.min(1, Math.max(0, value));

/** An sRGB colour, each channel in [0, 1], as CIE Lab under D65. */
export function labOf([red, green, blue]: Rgb): Lab {
  const [r, g, b] = [decoded(red), decoded(green), decoded(blue)];
  const x = curve((0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / WHITE[0]);
  const y = curve(0.2126729 * r + 0.7151522 * g + 0.072175 * b);
  const z = curve((0.0193339 * r + 0.119192 * g + 0.9503041 * b) / WHITE[2]);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

/** A Lab colour as linear sRGB, held inside sRGB's gamut. */
export function linearOf([l, a, b]: Lab): Rgb {
  const fy = (l + 16) / 116;
  const [x, y, z] = [WHITE[0] * uncurve(fy + a / 500), uncurve(fy), WHITE[2] * uncurve(fy - b / 200)];
  return [
    clamped(3.2404542 * x - 1.5371385 * y - 0.4985314 * z),
    clamped(-0.969266 * x + 1.8760108 * y + 0.041556 * z),
    clamped(0.0556434 * x - 0.2040259 * y + 1.0572252 * z),
  ];
}

/** The turn of a system's hue from a share of its seed: 12 degrees either way at most. */
export function turnOf(share: number): Turn {
  const tangent = (share * 2 - 1) * TAN_SIX;
  const across = 1 + tangent * tangent;
  return { cos: (1 - tangent * tangent) / across, sin: (2 * tangent) / across };
}

function graded(from: Lab, to: Lab, { blend, lightness, chroma, turn }: Grade): Lab {
  const [l, a, b] = [0, 1, 2].map((at) => (from[at] ?? 0) + ((to[at] ?? 0) - (from[at] ?? 0)) * blend) as [
    number,
    number,
    number,
  ];
  const [ca, cb] = [a * chroma, b * chroma];
  return [Math.min(LIGHTEST, l * lightness), ca * turn.cos - cb * turn.sin, ca * turn.sin + cb * turn.cos];
}

/** A palette from an anchor's two real ramps: never past their chroma, for the grade only lowers it and a turn keeps it. */
export function paletteOf([one, other]: readonly [Ramp, Ramp], grade: Grade): Palette {
  const lab: Trio<Lab> = [
    graded(labOf(one[0]), labOf(other[0]), grade),
    graded(labOf(one[1]), labOf(other[1]), grade),
    graded(labOf(one[2]), labOf(other[2]), grade),
  ];
  return { lab, linear: [linearOf(lab[0]), linearOf(lab[1]), linearOf(lab[2])] };
}
