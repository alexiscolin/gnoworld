// The colony's hull, drawn in the code at 512 px (D13741): plates of uneven widths in rows, their seams, a few raised boxes, each plate its
// own shade and roughness; a glazed band for the habitat, its windows lit behind the glass. No file, no dependency, the same for a seed.
import { DataTexture, LinearFilter, LinearMipmapLinearFilter, RepeatWrapping, SRGBColorSpace } from "three";

/** Each map's side, in texels. */
export const SIZE = 512;
// raw: the rows of plates, a plate's width range in texels, the raised boxes' share, a seam's depth and a box's height
const ROWS = 16;
const PLATE = { least: 12, most: 56 } as const;
const BOXES = 30;
const LEVEL = { seam: 0.3, plate: 0.5, box: 0.75, mullion: 0.65 } as const;
// How steep the hull's relief reads in its normals.
const STEEP = 6;

export interface HullMaps {
  readonly map: DataTexture;
  readonly normalMap: DataTexture;
  readonly roughnessMap: DataTexture;
  readonly emissiveMap?: DataTexture;
}

interface Layers {
  readonly albedo: Uint8Array;
  readonly rough: Uint8Array;
  readonly height: Float32Array;
}

// A stream of numbers from `seed`, the same each time (mulberry32).
function streamOf(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), state | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The texel `x`, `y` of a map wrapped round both ways.
const at = (x: number, y: number): number => ((y + SIZE) % SIZE) * SIZE + ((x + SIZE) % SIZE);

function paint(layers: Layers, texel: number, { shade, rough }: { shade: readonly number[]; rough: number }): void {
  for (const [channel, value] of shade.entries()) layers.albedo[texel * 4 + channel] = value;
  layers.albedo[texel * 4 + 3] = 255;
  layers.rough[texel * 4 + 1] = rough;
  layers.rough[texel * 4 + 3] = 255;
}

// One row of plates, from the texel row `top` to `bottom`, each plate a shade, a roughness and a lift of its own.
function rowOf(layers: Layers, { top, bottom }: { top: number; bottom: number }, next: () => number): void {
  let x = Math.floor(next() * PLATE.most);
  const end = x + SIZE;
  while (x < end) {
    const width = PLATE.least + Math.floor(next() * (PLATE.most - PLATE.least));
    const grey = 150 + next() * 55 - (next() < 0.08 ? 50 : 0);
    const look = { shade: [grey, grey, grey + 4], rough: 90 + next() * 110 };
    const lift = (next() - 0.5) * 0.04;
    for (let y = top; y < bottom; y += 1)
      for (let across = x; across < Math.min(x + width, end); across += 1) {
        const seam = y - top < 1 || bottom - y <= 1 || across - x < 1;
        const texel = at(across, y);
        paint(layers, texel, seam ? { shade: [70, 72, 80], rough: look.rough } : look);
        layers.height[texel] = seam ? LEVEL.seam : LEVEL.plate + lift;
      }
    x += width;
  }
}

// The raised boxes and vents, light or dark, a few over the plates.
function boxesOf(layers: Layers, next: () => number): void {
  for (let box = 0; box < BOXES; box += 1) {
    const [x0, y0] = [Math.floor(next() * SIZE), Math.floor(next() * SIZE)];
    const [width, tall] = [2 + Math.floor(next() * 9), 2 + Math.floor(next() * 5)];
    const shade = next() < 0.5 ? [70, 72, 80] : [210, 212, 215];
    for (let y = y0; y < y0 + tall; y += 1)
      for (let x = x0; x < x0 + width; x += 1) {
        paint(layers, at(x, y), { shade, rough: 120 });
        layers.height[at(x, y)] = LEVEL.box;
      }
  }
}

// The band `from` to `to` (shares of the height) glazed: dark smooth glass between mullions, and behind it the windows' light, some
// stretches dark, a few cold.
function glaze(layers: Layers, glow: Uint8Array, { band, next }: { band: readonly [number, number]; next: () => number }): void {
  const rows = { top: Math.round(band[0] * SIZE), bottom: Math.round(band[1] * SIZE) };
  for (let x = 0; x < SIZE; x += 1) {
    const mullion = x % 8 === 0;
    const on = mullion ? 0 : (Math.sin(Math.floor(x / 8) * 12.9898 + band[0]) * 43758.5453) % 1;
    const lit = Math.abs(on) > 0.25 ? [255, 200 + next() * 30, 125 + next() * 30, 255] : [0, 0, 0, 255];
    column({ layers, glow }, { x, mullion, lit }, rows);
  }
}

// One column of the glazed band: a mullion or glass, its frame's rows raised, the glass's light behind it.
function column(
  { layers, glow }: { layers: Layers; glow: Uint8Array },
  { x, mullion, lit }: { x: number; mullion: boolean; lit: readonly number[] },
  { top, bottom }: { top: number; bottom: number },
): void {
  for (let y = top; y < bottom; y += 1) {
    const texel = at(x, y);
    paint(layers, texel, mullion ? { shade: [89, 96, 112], rough: 60 } : { shade: [18, 23, 34], rough: 24 });
    layers.height[texel] = mullion || y === top || y === bottom - 1 ? LEVEL.mullion : LEVEL.plate;
    if (y > top + 1 && y < bottom - 2) glow.set(lit, texel * 4);
  }
}

// The normals of the relief `height`: its slope across and along, by the neighbours' difference, packed as a normal map's bytes.
function normalsOf(height: Float32Array): Uint8Array {
  const data = new Uint8Array(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y += 1)
    for (let x = 0; x < SIZE; x += 1) {
      const dx = ((height[at(x + 1, y)] ?? 0) - (height[at(x - 1, y)] ?? 0)) * STEEP;
      const dy = ((height[at(x, y + 1)] ?? 0) - (height[at(x, y - 1)] ?? 0)) * STEEP;
      const length = Math.hypot(dx, dy, 1);
      data.set([((-dx / length) * 0.5 + 0.5) * 255, ((dy / length) * 0.5 + 0.5) * 255, ((1 / length) * 0.5 + 0.5) * 255, 255], at(x, y) * 4);
    }
  return data;
}

function textureOf(data: Uint8Array, colour: boolean): DataTexture {
  const texture = new DataTexture(data, SIZE, SIZE);
  if (colour) texture.colorSpace = SRGBColorSpace;
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

/** The hull's maps for `seed`; with `band`, the share of its height glazed, its windows' light too. */
export function hullMaps(seed: number, band?: readonly [number, number]): HullMaps {
  const next = streamOf(seed);
  const layers = { albedo: new Uint8Array(SIZE * SIZE * 4), rough: new Uint8Array(SIZE * SIZE * 4), height: new Float32Array(SIZE * SIZE) };
  for (let row = 0; row < ROWS; row += 1) rowOf(layers, { top: (row * SIZE) / ROWS, bottom: ((row + 1) * SIZE) / ROWS }, next);
  boxesOf(layers, next);
  const glow = band === undefined ? undefined : new Uint8Array(SIZE * SIZE * 4);
  if (glow !== undefined && band !== undefined) glaze(layers, glow, { band, next });
  return {
    map: textureOf(layers.albedo, true),
    normalMap: textureOf(normalsOf(layers.height), false),
    roughnessMap: textureOf(layers.rough, false),
    ...(glow === undefined ? {} : { emissiveMap: textureOf(glow, true) }),
  };
}
