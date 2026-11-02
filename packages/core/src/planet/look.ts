// A world's look, a pure function of its path (ADR-0002 §3): sha256("gnoworld/planet/v1" ‖ path), whose 256 bits feed continuous values
// inside an anchor's row. Only + - * / reach a value, so every engine gives the same look: rotations stay angles, and the app does
// the trigonometry. Tier 1 (docs/REVIEW.md). The path comes in as bytes: core has no TextEncoder.
import { ANCHORS, MAPS, type Anchor, type AnchorRow, type MapName, type Ramp, type Rgb } from "./anchors.ts";
import { ROWS } from "./rows.ts";
import { sha256 } from "./sha256.ts";

export { ANCHORS, MAPS, type Anchor, type MapName };

/** Above this the warp smears a map's real detail (Alexis's review of the mock-up, 2026-11-01). */
export const MAX_WARP_FREQUENCY = 2.4;
const MIN_WARP_FREQUENCY = 0.9;
const TURN = Math.PI * 2;
const OFFSET = 16;
const MAX_SECOND_SHARE = 0.4;
const MAX_TILT = 0.45;
const MAX_LEAN = 0.25;
const RING_LEAN = [0.3, 0.65] as const;
const RING_INNER = [1.25, 1.45] as const;
const RING_WIDTH = [0.62, 0.95] as const;
const RING_OPACITY = [0.34, 0.72] as const;
// The strange ones stay rare, about one world in ten (ADR-0002 §3): 26 of a hash byte's 256.
const STRANGE: readonly Anchor[] = ["tidally locked", "shattered"];
const STRANGE_BELOW = 26;

/** A text's bytes, for want of a TextEncoder: a path or a world's id is ASCII by its schema. */
export const asciiBytes = (text: string): Uint8Array => Uint8Array.from(text, (character) => character.charCodeAt(0));

const DOMAIN = asciiBytes("gnoworld/planet/v1");

export interface PlanetLook {
  readonly anchor: Anchor;
  readonly map: MapName;
  readonly second: MapName | null;
  /** How much of the surface the second map takes, 0.4 at most: the dominant stays 60% or more. */
  readonly secondShare: number;
  /** About the pole, then the two other axes, in radians. */
  readonly spin: Rgb;
  readonly tilt: number;
  /** How far its axis leans towards or away from the eye, so a ring is never seen edge on. */
  readonly lean: number;
  readonly warp: { readonly amount: number; readonly frequency: number; readonly offset: Rgb };
  readonly ramp: Ramp;
  readonly recolour: number;
  readonly contrast: number;
  readonly relief: number;
  readonly caps: number;
  readonly clouds: number;
  readonly rifts: number;
  readonly cracks: number;
  readonly locked: boolean;
  readonly sea: { readonly shallow: Rgb; readonly deep: Rgb } | null;
  readonly glow: { readonly colour: Rgb; readonly level: number } | null;
  readonly rim: { readonly colour: Rgb; readonly thickness: number } | null;
  readonly rings: {
    readonly inner: number;
    readonly outer: number;
    readonly tint: Rgb;
    readonly opacity: number;
  } | null;
}

/** The 32 bytes a path's look is read from. */
export function planetSeed(path: Uint8Array): Uint8Array {
  const message = new Uint8Array(DOMAIN.length + path.length);
  message.set(DOMAIN);
  message.set(path, DOMAIN.length);
  return sha256(message);
}

/** `share` of the way across a span. */
export const between = ([from, to]: readonly [number, number], share: number): number => from + (to - from) * share;
/** Byte `index` of a seed, as a share. */
export const seedShare = (seed: Uint8Array, index: number): number => (seed[index] ?? 0) / 255;
const mixed = (from: Rgb, to: Rgb, share: number): Rgb => [
  between([from[0], to[0]], share),
  between([from[1], to[1]], share),
  between([from[2], to[2]], share),
];

// Words 0 to 5 turn and offset the map, word 6 mixes the palette; each byte from 14 on is one value of its own, in [0, 1], and a
// byte may serve two values no anchor has together: rifts and cracks; caps and a banded world's contrast.
const reader = (seed: Uint8Array) => ({
  word: (index: number): number => ((seed[index * 2] ?? 0) * 256 + (seed[index * 2 + 1] ?? 0)) / 65535,
  byte: (index: number): number => seedShare(seed, index),
});
type Reader = ReturnType<typeof reader>;

function rampOf(row: AnchorRow, { word }: Reader): Ramp {
  const [one, other] = row.palettes;
  const share = word(6);
  return [mixed(one[0], other[0], share), mixed(one[1], other[1], share), mixed(one[2], other[2], share)];
}

function leanOf(ringed: boolean, { byte }: Reader): number {
  const share = byte(13) * 2 - 1;
  if (!ringed) return share * MAX_LEAN;
  return between(RING_LEAN, Math.abs(share)) * (share < 0 ? -1 : 1);
}

function ringsOf(row: AnchorRow, ramp: Ramp, { byte }: Reader): PlanetLook["rings"] {
  if (byte(24) >= (row.rings ?? 0)) return null;
  const inner = between(RING_INNER, byte(25));
  return {
    inner,
    outer: inner + between(RING_WIDTH, byte(26)),
    tint: mixed(ramp[2], ramp[1], byte(27)),
    opacity: between(RING_OPACITY, byte(28)),
  };
}

function waters(row: AnchorRow, { byte }: Reader): Pick<PlanetLook, "sea" | "glow" | "rim"> {
  const { sea, glow, rim } = row;
  return {
    sea: sea ?? null,
    glow: glow === undefined ? null : { colour: glow.colour, level: between(glow.level, byte(29)) },
    rim:
      rim === undefined
        ? null
        : { colour: mixed(rim.colours[0], rim.colours[1], byte(31)), thickness: between(rim.thickness, byte(21)) },
  };
}

/** The anchor a seed gives, from a hash of it: all 32 of its own bytes are taken. */
export function anchorOf(seed: Uint8Array): Anchor {
  const common = ANCHORS.filter((anchor) => !STRANGE.includes(anchor));
  const byte = sha256(seed)[0] ?? 0;
  return (byte < STRANGE_BELOW ? STRANGE[byte % STRANGE.length] : common[byte % common.length]) ?? "rocky";
}

/** The look of `path` as `anchor`. */
export function planetLook(path: Uint8Array, anchor: Anchor): PlanetLook {
  const seed = reader(planetSeed(path));
  const { word, byte } = seed;
  const row = ROWS[anchor];
  const ramp = rampOf(row, seed);
  const rings = ringsOf(row, ramp, seed);
  const turn = word(0) * TURN;
  return {
    anchor,
    map: row.maps[Math.floor(byte(23) * 0.999 * row.maps.length)] ?? row.maps[0],
    second: row.second ?? null,
    secondShare: row.second === undefined ? 0 : byte(15) * MAX_SECOND_SHARE,
    spin: row.banded === true ? [turn, 0, 0] : [turn, word(1) * TURN, word(2) * TURN],
    tilt: (byte(16) * 2 - 1) * MAX_TILT,
    lean: leanOf(rings !== null, seed),
    warp: {
      amount: between(row.warp, byte(14)),
      frequency: between([MIN_WARP_FREQUENCY, MAX_WARP_FREQUENCY], byte(30)),
      offset: [word(3) * OFFSET, word(4) * OFFSET, word(5) * OFFSET],
    },
    ramp,
    recolour: between(row.recolour, byte(19)),
    contrast: between(row.contrast ?? [1, 1], byte(22)),
    relief: between(row.relief, byte(17)),
    caps: between(row.caps ?? [0, 0], byte(22)),
    clouds: between(row.clouds ?? [0, 0], byte(20)),
    rifts: between(row.rifts ?? [0, 0], byte(18)),
    cracks: between(row.cracks ?? [0, 0], byte(18)),
    locked: row.locked === true,
    ...waters(row, seed),
    rings,
  };
}

/** The look of a world by its id, at its path on gno.land: a world keeps it across versions. */
export function worldLook(id: string): PlanetLook {
  const path = asciiBytes(`gno.land/r/${id}`);
  return planetLook(path, anchorOf(planetSeed(path)));
}
