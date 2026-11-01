// The mood of space (ADR-0002 §10): colour, haze and density as a smooth field of position, with no list of places, no count, no border
// and nothing stored. It means nothing on chain. Two scales of value noise over a hashed lattice, its coordinates doubles, so the far
// reaches are as fine as home. The colours are a ring of real space photography's: dust's rust, sulphur's amber, hydrogen's rose,
// oxygen's teals, a reflection nebula's indigo, in linear light.
import { mix, salted, settle, type Point } from "./cell.ts";
import { smootherstep, smoothstep } from "./smooth.ts";
import { nearestCell, Torus } from "./torus.ts";

export interface Mood {
  red: number;
  green: number;
  blue: number;
  haze: number;
  density: number;
}

/** The field's lattice, in world units: about a cluster's width (a system's cell is 10). */
export const MOOD_SCALE = 340;
/** The volume the sky reads: `MOOD_SIDE` points a side, `MOOD_STEP` apart. */
export const MOOD_SIDE = 16;
export const MOOD_STEP = 160;

// Wider than the haze: the shells of one view then mix one colour, where two far apart would mix to grey.
const TONE_SCALE = MOOD_SCALE * 2.5;
const WORD = 2 ** 32;
const TONE = 1;
const HAZE = 2;
const DENSITY = 3;
// prettier-ignore
const RING = [
  0.2541, 0.0497, 0.006,
  0.552, 0.1946, 0.0252,
  0.1946, 0.0176, 0.0395,
  0.006, 0.0497, 0.0844,
  0.0137, 0.159, 0.162,
  0.0232, 0.0284, 0.1559,
];
const HUES = RING.length / 3;

const side = (bit: number, by: number): number => (bit === 0 ? 1 - by : by);

// Value noise: eight hashed corners blended, in [0, 1].
function lattice(salt: number, at: Point, scale: number): number {
  const x = at.x / scale;
  const y = at.y / scale;
  const z = at.z / scale;
  const u = smootherstep(x - Math.floor(x));
  const v = smootherstep(y - Math.floor(y));
  const w = smootherstep(z - Math.floor(z));
  let total = 0;
  for (let corner = 0; corner < 8; corner += 1) {
    const dx = corner & 1;
    const dy = (corner >> 1) & 1;
    const dz = corner >> 2;
    const hash = mix(mix(mix(salted(salt), Math.floor(x) + dx), Math.floor(y) + dy), Math.floor(z) + dz);
    total += (settle(hash) / WORD) * side(dx, u) * side(dy, v) * side(dz, w);
  }
  return total;
}

const field = (salt: number, at: Point, scale: number): number =>
  lattice(salt, at, scale) * 0.7 + lattice(salt + 9, at, scale / 2.1) * 0.3;

const ringAt = (hue: number, channel: number): number => RING[((hue + HUES) % HUES) * 3 + channel] ?? 0;

/** A mood to read into: one a caller keeps, for a frame makes nothing. */
export const newMood = (): Mood => ({ red: 0, green: 0, blue: 0, haze: 0, density: 0 });

/** The mood at a position, the same on every device. */
export function moodAt(out: Mood, at: Point): void {
  const tone = ((field(TONE, at, TONE_SCALE) - 0.2) / 0.6) * HUES + HUES;
  const hue = Math.floor(tone);
  const by = smootherstep(tone - hue);
  out.red = ringAt(hue % HUES, 0) * (1 - by) + ringAt((hue + 1) % HUES, 0) * by;
  out.green = ringAt(hue % HUES, 1) * (1 - by) + ringAt((hue + 1) % HUES, 1) * by;
  out.blue = ringAt(hue % HUES, 2) * (1 - by) + ringAt((hue + 1) % HUES, 2) * by;
  out.haze = smoothstep(0.42, 0.72, field(HAZE, at, MOOD_SCALE * 1.4)) ** 1.6;
  out.density = Math.min(1, Math.max(0, (field(DENSITY, at, MOOD_SCALE * 0.8) - 0.25) * 2));
}

/** The field on a lattice around the eye, four bytes a point, for the sky to read as a volume. */
export function moodCells() {
  const data = new Uint8Array(MOOD_SIDE ** 3 * 4);
  const mood = newMood();
  const spot = { x: 0, y: 0, z: 0 };
  const centre = { x: 0, y: 0, z: 0 };
  const torus = new Torus(MOOD_SIDE, (slot, cell) => {
    spot.x = cell.x * MOOD_STEP;
    spot.y = cell.y * MOOD_STEP;
    spot.z = cell.z * MOOD_STEP;
    moodAt(mood, spot);
    data[slot * 4] = Math.round(mood.red * 255);
    data[slot * 4 + 1] = Math.round(mood.green * 255);
    data[slot * 4 + 2] = Math.round(mood.blue * 255);
    data[slot * 4 + 3] = Math.round(mood.haze * 255);
  });
  return {
    data,
    /** Moves the volume to the eye; whether a byte changed. */
    follow(eye: Point): boolean {
      centre.x = nearestCell(eye.x, MOOD_STEP);
      centre.y = nearestCell(eye.y, MOOD_STEP);
      centre.z = nearestCell(eye.z, MOOD_STEP);
      return torus.follow(centre);
    },
  };
}
