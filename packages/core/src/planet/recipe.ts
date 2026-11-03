// A world's recipe, ADR-0002 §3's layers 1 to 3 beyond its look: its minor class, its surface generated from the seed and its palette in
// Lab, turned by its system's hue. The generated worlds' chunk draws it (app/src/scene/planet/generated.ts), so neither the scene's
// chunk nor the cosmos's carries it. Only + - * / reach a value. Tier 1 (docs/REVIEW.md).
import { REALM_PREFIX } from "../chain/realm.ts";
import type { Anchor, MapName, Ramp, Rgb } from "./anchors.ts";
import { anchorOf, minorOf, moreSeed, type Nature } from "./choice.ts";
import { ramp } from "./colours.ts";
import { asciiBytes, planetSeed, worldPath } from "./look.ts";
import {
  labOf,
  linearOf,
  NO_TURN,
  paletteOf,
  turnedLab,
  turnOf,
  type Lab,
  type Palette,
  type Turn,
} from "./palette.ts";
import { ROWS } from "./rows.ts";
import { sha256 } from "./sha256.ts";
import { seedShare } from "./shares.ts";
import { surfaceOf, type Surface } from "./surface.ts";

export interface Recipe {
  /** The class mixed under the world's own, and its share of the surface, 0.4 at most: the dominant keeps 60%. */
  readonly minor: Anchor;
  readonly minorShare: number;
  /** The real map the minor's regions take their detail from. */
  readonly minorMap: MapName;
  readonly surface: Surface;
  readonly palette: Palette;
  readonly minorPalette: Palette;
  /** Its sea's shallow and deep colours turned by its system's hue, in Lab and as linear sRGB; none on a world without a sea. */
  readonly sea: { readonly lab: readonly [Lab, Lab]; readonly linear: readonly [Rgb, Rgb] } | null;
}

/** A world of continents' bare ground, the Earth's own off its day map, cold to hot: Patagonia's cold steppe, the outback's ochre, the
 * Sahara's sand; the Gobi, the outback's west, the Sahara's east. */
export const BARE: readonly [Ramp, Ramp] = [ramp(0x72624f, 0x927461, 0xe8d2b8), ramp(0x9f8b75, 0x96765f, 0xdfc5aa)];
/** A world of continents has a sea of less than this (an ocean world's starts there): the program draws its land and its climate. */
export const CONTINENTS_SEA = 0.8;
/** Whether a world's surface makes it a world of continents, its minor its bare ground. */
export const ofContinents = ({ sea }: Pick<Surface, "sea">): boolean => sea > 0 && sea < CONTINENTS_SEA;
const MAX_MINOR = 0.4;
const LIGHTNESS = [0.9, 1.1] as const;
const CHROMA = [0.8, 1] as const;
const SLASH = 47;
const SYSTEM = asciiBytes("gnoworld/system/v1");
const REALMS = asciiBytes(REALM_PREFIX);

// A system's hue: sha256 of its own domain and the namespace, the path's first folder under gno.land/r/; none outside a realm's path.
function hueOf(path: Uint8Array): Turn {
  if (REALMS.some((byte, at) => path[at] !== byte)) return NO_TURN;
  const rest = path.subarray(REALMS.length);
  const end = rest.indexOf(SLASH);
  const namespace = end < 0 ? rest : rest.subarray(0, end);
  if (namespace.length === 0) return NO_TURN;
  const message = new Uint8Array(SYSTEM.length + namespace.length);
  message.set(SYSTEM);
  message.set(namespace, SYSTEM.length);
  const seed = sha256(message);
  return turnOf(((seed[0] ?? 0) * 256 + (seed[1] ?? 0)) / 65535);
}

// A Lab colour's hue lies between two directions of the a-b plane, the first turned anticlockwise to the second (under half a turn), its
// chroma past `least`: cross products alone, as every value here.
const within = (
  [, a, b]: Lab,
  [from, to]: readonly [readonly [number, number], readonly [number, number]],
  least: number,
) => a * a + b * b >= least * least && from[0] * b - from[1] * a >= 0 && a * to[1] - b * to[0] >= 0;
// Olive and moss are hues 105 to 160 degrees, a sea's blue -160 to -60; a system's hue turns a palette 12 degrees at most (palette.ts),
// so a ramp's centre keeps that far from them: 93 to 172, -172 to -48, as the cosine and sine of each end.
const GREEN = [
  [-0.0523, 0.9986],
  [-0.9903, 0.1392],
] as const;
const BLUE = [
  [-0.9903, -0.1392],
  [0.6691, -0.7431],
] as const;

// A minor brings a colour of gas or rock (Alexis, 2026-11-03, "les retirer"): its dominant's kind, no sea world's, no green past a grey,
// no saturated blue under a world not blue itself; under a sea world or a dark giant (whose minor the program matches in light at 0.6
// only), each ramp within 25 of its dominant's lightness, or it reads as ice taken for cloud, a black pit, or a pock.
function fitsUnder(dominant: Anchor): (minor: Anchor) => boolean {
  const own = ROWS[dominant].palettes.map(([, centre]) => labOf(centre));
  const [first = [0, 0, 0] as Lab] = own;
  const blue = within(first, BLUE, 12);
  const held = ROWS[dominant].sea !== undefined || (ROWS[dominant].banded === true && first[0] < 20);
  const fits = (centre: Lab, ramp: number) => {
    const gap = centre[0] - (own[ramp] ?? first)[0];
    return !within(centre, GREEN, 8) && (blue || !within(centre, BLUE, 12)) && (!held || gap * gap <= 25 * 25);
  };
  return (minor) =>
    (ROWS[minor].banded === true) === (ROWS[dominant].banded === true) &&
    ROWS[minor].sea === undefined &&
    ROWS[minor].palettes.every(([, centre], ramp) => fits(labOf(centre), ramp));
}

// A world's sea turns by its system's hue as its palettes do (Alexis, 2026-11-03, "bleu-vert variant").
function seaOf(anchor: Anchor, turn: Turn): Recipe["sea"] {
  const sea = ROWS[anchor].sea;
  if (sea === undefined) return null;
  const [shallow, deep] = [turnedLab(labOf(sea.shallow), turn), turnedLab(labOf(sea.deep), turn)];
  return { lab: [shallow, deep], linear: [linearOf(shallow), linearOf(deep)] };
}

/** The recipe a seed gives as `anchor`, turned by its system's hue. */
export function seededRecipe(seed: Uint8Array, anchor: Anchor, turn: Turn): Recipe {
  const more = moreSeed(seed);
  const minor = minorOf(more, anchor, fitsUnder(anchor));
  const surface = surfaceOf(more, anchor);
  const grade = {
    blend: ((seed[12] ?? 0) * 256 + (seed[13] ?? 0)) / 65535,
    lightness: LIGHTNESS[0] + (LIGHTNESS[1] - LIGHTNESS[0]) * seedShare(more, 28),
    chroma: CHROMA[0] + (CHROMA[1] - CHROMA[0]) * seedShare(more, 29),
    turn,
  };
  // A world of continents keeps its own map, a rock's craters would ring them, and its minor is its bare ground, which its climate lays.
  const continents = ofContinents(surface);
  return {
    minor,
    minorShare: seedShare(seed, 15) * MAX_MINOR,
    minorMap: ROWS[continents ? anchor : minor].maps[0],
    surface,
    palette: paletteOf(ROWS[anchor].palettes, grade),
    minorPalette: paletteOf(continents ? BARE : ROWS[minor].palettes, grade),
    sea: seaOf(anchor, turn),
  };
}

/** The recipe of `path` as `anchor`: the lab names one, and a world takes the one its seed chose (`worldRecipe`). */
export const planetRecipe = (path: Uint8Array, anchor: Anchor): Recipe =>
  seededRecipe(planetSeed(path), anchor, hueOf(path));

/** The recipe of a world by its id, at its anchor as `worldLook` reads it. An id is ASCII by its schema. */
export function worldRecipe(id: string, nature: Nature | null = null): Recipe {
  const path = worldPath(id);
  const seed = planetSeed(path);
  return seededRecipe(seed, anchorOf(seed, nature), hueOf(path));
}
