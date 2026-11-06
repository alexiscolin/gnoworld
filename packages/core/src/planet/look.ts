// A world's look, a pure function of its path and the anchor it is given (ADR-0002 §3): sha256("gnoworld/planet/v1" ‖ path), whose 256 bits feed continuous values
// inside an anchor's row. Only + - * / reach a value, so every engine gives the same look: rotations stay angles, and the app does
// the trigonometry. Tier 1 (docs/REVIEW.md). The path comes in as bytes: core has no TextEncoder.
import { REALM_PREFIX } from "../chain/realm.ts";
import { ANCHORS, MAPS, type Anchor, type AnchorRow, type MapName, type Ramp, type Rgb } from "./anchors.ts";
import { anchorOf, natureOf, worldAnchor, type Nature, type RealmFunctions } from "./choice.ts";
import { ROWS } from "./rows.ts";
import { sha256 } from "./sha256.ts";
import { between, seedShare } from "./shares.ts";

export { anchorOf, ANCHORS, MAPS, natureOf, type Anchor, type MapName, type Nature, type RealmFunctions };

/** Above this the warp smears a map's real detail (Alexis's review of the mock-up, 2026-11-01). */
export const MAX_WARP_FREQUENCY = 2.4;
const MIN_WARP_FREQUENCY = 0.9;
const TURN = Math.PI * 2;
const OFFSET = 16;
const MAX_TILT = 0.45;
const MAX_LEAN = 0.25;
const RING_LEAN = [0.3, 0.65] as const;
const RING_INNER = [1.25, 1.45] as const;
const RING_WIDTH = [0.62, 0.95] as const;
const RING_OPACITY = [0.34, 0.72] as const;
const LAST_ASCII = 127;

/** The bytes of a text that is ASCII by its schema, for want of a TextEncoder: past it a code unit would wrap, and two ids be one planet. */
export function asciiBytes(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length);
  for (let at = 0; at < text.length; at += 1) {
    const unit = text.charCodeAt(at);
    if (unit > LAST_ASCII) throw new RangeError("a text past ASCII");
    bytes[at] = unit;
  }
  return bytes;
}

const DOMAIN = asciiBytes("gnoworld/planet/v1");

export interface PlanetLook {
  readonly anchor: Anchor;
  /** The real map whose fine contrast the dominant class's ground takes: detail only, never its shapes. */
  readonly map: MapName;
  /** About the pole, then the two other axes, in radians. */
  readonly spin: Rgb;
  readonly tilt: number;
  /** How far its axis leans towards or away from the eye, so a ring is never seen edge on. */
  readonly lean: number;
  /** How the real map is warped where it is read, and where the generated structure's noise starts. */
  readonly warp: { readonly amount: number; readonly frequency: number; readonly offset: Rgb };
  /** Where the minor class's regions' noise starts, apart from the structure's. */
  readonly minorOffset: Rgb;
  /** The far dot's colours: the drawn palette is the recipe's. */
  readonly ramp: Ramp;
  /** How much of the real map's own colour the palette replaces. */
  readonly recolour: number;
  readonly relief: number;
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

const mixed = (from: Rgb, to: Rgb, share: number): Rgb => [
  between([from[0], to[0]], share),
  between([from[1], to[1]], share),
  between([from[2], to[2]], share),
];

// Words 0 to 5 turn and offset the map, word 6 mixes the palette; each byte from 14 on is one value of its own, in [0, 1]. Byte 13 serves
// word 6 and the lean, bytes 0 and 1 the spin and the light, byte 15 the recipe's minor share, and 18, 20 and 22 the minor's offset: all
// 32 are taken (F3476), and what comes after reads `moreSeed`.
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

/** The look a seed gives as `anchor`, its bytes read as stated above. */
export function seededLook(bytes: Uint8Array, anchor: Anchor): PlanetLook {
  const seed = reader(bytes);
  const { word, byte } = seed;
  const row = ROWS[anchor];
  const ramp = rampOf(row, seed);
  const rings = ringsOf(row, ramp, seed);
  const turn = word(0) * TURN;
  return {
    anchor,
    map: row.maps[Math.floor(byte(23) * 0.999 * row.maps.length)] ?? row.maps[0],
    spin: row.banded === true ? [turn, 0, 0] : [turn, word(1) * TURN, word(2) * TURN],
    tilt: (byte(16) * 2 - 1) * MAX_TILT,
    lean: leanOf(rings !== null, seed),
    warp: {
      amount: between(row.warp, byte(14)),
      frequency: between([MIN_WARP_FREQUENCY, MAX_WARP_FREQUENCY], byte(30)),
      offset: [word(3) * OFFSET, word(4) * OFFSET, word(5) * OFFSET],
    },
    minorOffset: [byte(18) * OFFSET, byte(20) * OFFSET, byte(22) * OFFSET],
    ramp,
    recolour: between(row.recolour, byte(19)),
    relief: between(row.relief, byte(17)),
    locked: row.locked === true,
    ...waters(row, seed),
    rings,
  };
}

/** The look of `path` as `anchor`: the lab names one, and a world takes the one its seed chose (`worldLook`). */
export const planetLook = (path: Uint8Array, anchor: Anchor): PlanetLook => seededLook(planetSeed(path), anchor);

/** A world's path on gno.land, the bytes its seed reads: one rule for the look, the recipe and the scene. An id is ASCII by its schema. */
export const worldPath = (id: string): Uint8Array => asciiBytes(`${REALM_PREFIX}${id}`);

/** The look of a world by its id, at its path on gno.land: `nature`, read once, leans its class. */
export function worldLook(id: string, nature: Nature | null = null): PlanetLook {
  const seed = planetSeed(worldPath(id));
  return seededLook(seed, worldAnchor(id, seed, nature));
}
