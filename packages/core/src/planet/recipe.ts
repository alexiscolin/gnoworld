// A world's recipe, ADR-0002 §3's layers 1 to 3 beyond today's look: its minor class, its surface generated from the seed and its
// palette in Lab, turned by its system's hue. 7b5 draws it; today's shader reads `planetLook`, which this leaves as it was, and no page
// imports this yet, so it weighs nothing in the scene's chunk until then. Only + - * / reach a value. Tier 1 (docs/REVIEW.md).
import { REALM_PREFIX } from "../chain/realm.ts";
import type { Anchor, MapName } from "./anchors.ts";
import { anchorOf, minorOf, moreSeed, type Nature } from "./choice.ts";
import { asciiBytes, planetSeed } from "./look.ts";
import { NO_TURN, paletteOf, turnOf, type Palette, type Turn } from "./palette.ts";
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
}

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

function recipeOf(seed: Uint8Array, anchor: Anchor, turn: Turn): Recipe {
  const more = moreSeed(seed);
  const minor = minorOf(more, anchor);
  const grade = {
    blend: ((seed[12] ?? 0) * 256 + (seed[13] ?? 0)) / 65535,
    lightness: LIGHTNESS[0] + (LIGHTNESS[1] - LIGHTNESS[0]) * seedShare(more, 28),
    chroma: CHROMA[0] + (CHROMA[1] - CHROMA[0]) * seedShare(more, 29),
    turn,
  };
  return {
    minor,
    minorShare: seedShare(seed, 15) * MAX_MINOR,
    minorMap: ROWS[minor].maps[0],
    surface: surfaceOf(more, anchor),
    palette: paletteOf(ROWS[anchor].palettes, grade),
    minorPalette: paletteOf(ROWS[minor].palettes, grade),
  };
}

/** The recipe of `path` as `anchor`: the lab names one, and a world takes the one its seed chose (`worldRecipe`). */
export const planetRecipe = (path: Uint8Array, anchor: Anchor): Recipe =>
  recipeOf(planetSeed(path), anchor, hueOf(path));

/** The recipe of a world by its id, at its anchor as `worldLook` reads it. An id is ASCII by its schema. */
export function worldRecipe(id: string, nature: Nature | null = null): Recipe {
  const path = asciiBytes(`${REALM_PREFIX}${id}`);
  const seed = planetSeed(path);
  return recipeOf(seed, anchorOf(seed, nature), hueOf(path));
}
