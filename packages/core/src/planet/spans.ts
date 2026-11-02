// Layer 2 of ADR-0002 §3 as data: each surface value, its unit and its whole span, the one place 7b5 reads its uniforms' names from,
// and each anchor's span of it. A value no class of a kind can show is a point at 0: craters on a gas, bands on a ground. Tier 1.
import type { Anchor } from "./anchors.ts";
import { ROWS } from "./rows.ts";

type Span = readonly [number, number];

/** Each value, a uniform of the same name: its unit and its whole span. Read from the second hash in this order, from byte 9. */
export const SURFACE = {
  scale: { unit: "cycles per radius of the largest structure", span: [0.8, 4] },
  lacunarity: { unit: "an octave's frequency over the last's", span: [1.8, 2.3] },
  roughness: { unit: "an octave's height over the last's", span: [0.4, 0.65] },
  warp: { unit: "radii the structure is pushed by its own noise", span: [0, 0.6] },
  erosion: { unit: "share, rounded hills to carved valleys", span: [0, 1] },
  craters: { unit: "share of the ground under craters", span: [0, 1] },
  sea: { unit: "share of the surface under its sea", span: [0, 1] },
  caps: { unit: "share of the surface under polar ice", span: [0, 1] },
  rifts: { unit: "share, whole to riven", span: [0, 1] },
  bands: { unit: "bands from pole to pole", span: [0, 32] },
  turbulence: { unit: "share, straight bands to churned", span: [0, 1] },
  storms: { unit: "share, calm to stormy", span: [0, 1] },
  clouds: { unit: "share of the sky under cloud", span: [0, 1] },
  drift: { unit: "the clouds' speed over the Earth's", span: [0, 2] },
  detail: { unit: "share of a real map's detail in the structure", span: [0, 1] },
  halves: { unit: "share, how much darker one hemisphere is", span: [0, 1] },
  mix: { unit: "cycles per radius of the minor class's regions", span: [0.5, 2] },
} as const satisfies Record<string, { unit: string; span: Span }>;
export type SurfaceName = keyof typeof SURFACE;

type Spans = Partial<Record<SurfaceName, Span>>;
const FLAT: Span = [0, 0];
const EVERY: Spans = {
  scale: [0.9, 3.2],
  lacunarity: [1.85, 2.2],
  roughness: [0.42, 0.6],
  warp: [0.05, 0.5],
  drift: [0.6, 1.4],
  detail: [0.2, 0.5],
  mix: [0.6, 1.6],
};
const GROUND: Spans = { erosion: [0, 0.6], craters: [0, 0.4] };
const GAS: Spans = { bands: [8, 24], turbulence: [0.2, 0.8], storms: [0, 0.6] };

const SPANS: Record<Anchor, Spans> = {
  rocky: { craters: [0.55, 1], erosion: [0, 0.25], rifts: [0, 0.2] },
  temperate: { sea: [0.55, 0.78], erosion: [0.4, 0.9], craters: [0, 0.05], caps: [0.02, 0.12], clouds: [0.25, 0.6] },
  desert: { erosion: [0.2, 0.7], craters: [0.15, 0.6], caps: [0, 0.12], clouds: [0, 0.15], rifts: [0, 0.4] },
  ocean: { sea: [0.8, 0.95], erosion: [0.3, 0.8], craters: [0, 0.03], caps: [0, 0.15], clouds: [0.3, 0.65] },
  ice: { craters: [0, 0.25], erosion: [0, 0.3], rifts: [0.4, 1] },
  volcanic: { craters: [0, 0.05], erosion: [0.1, 0.5], rifts: [0.2, 0.6] },
  "gas giant": { bands: [12, 26], turbulence: [0.35, 0.9], storms: [0.2, 1] },
  "ice giant": { bands: [4, 11], turbulence: [0, 0.35], storms: [0, 0.5] },
  "cloud deck": { bands: [3, 10], turbulence: [0.2, 0.7], storms: [0, 0.25], clouds: [0.85, 1] },
  "tidally locked": {
    erosion: [0.2, 0.7],
    craters: [0.1, 0.5],
    caps: [0.15, 0.45],
    clouds: [0.05, 0.3],
    rifts: [0, 0.3],
  },
  "dark carbon": { craters: [0.3, 0.9], erosion: [0, 0.4] },
  shattered: { rifts: [0.55, 1], craters: [0.2, 0.7] },
  "nitrogen ice": { craters: [0, 0.35], erosion: [0.1, 0.6], rifts: [0.1, 0.5] },
  "grooved ice": { rifts: [0.5, 1], craters: [0.2, 0.6], erosion: [0, 0.3] },
  snowball: { caps: [0.75, 1], erosion: [0, 0.3], clouds: [0.05, 0.3], rifts: [0, 0.3] },
  hycean: { sea: [0.98, 1], craters: FLAT, erosion: FLAT, caps: [0, 0.1], clouds: [0.2, 0.6] },
  archean: { sea: [0.85, 0.97], erosion: [0.2, 0.6], craters: [0, 0.1], clouds: [0.3, 0.7] },
  "lava world": { craters: [0, 0.05], erosion: [0, 0.3], rifts: [0.3, 0.9] },
  "two-faced": { craters: [0.4, 0.9], halves: [0.6, 0.95] },
  "water cloud giant": { bands: [8, 20], turbulence: [0.1, 0.5], storms: [0, 0.5] },
  "azure giant": { bands: [6, 16], turbulence: [0.1, 0.5], storms: [0, 0.4] },
  "dark giant": { bands: [8, 20], turbulence: [0.2, 0.6], storms: [0, 0.3] },
  "hot giant": { bands: [4, 12], turbulence: [0.4, 1], storms: [0.2, 0.8] },
  "sub-Neptune": { bands: [2, 8], turbulence: [0, 0.3], storms: [0, 0.2], clouds: [0.5, 0.9] },
};

/** An anchor's span of a value: its own, else its kind's, else every world's, else none. */
export const spanOf = (anchor: Anchor, name: SurfaceName): Span =>
  SPANS[anchor][name] ?? (ROWS[anchor].banded === true ? GAS : GROUND)[name] ?? EVERY[name] ?? FLAT;
