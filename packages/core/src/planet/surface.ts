// Layer 2 of ADR-0002 §3, a world's surface: each value read from its own byte of the second hash, inside its anchor's span (spans.ts),
// and the octaves that carry its structure down to the close view's finest scale, the Earth's map's. Tier 1 (docs/REVIEW.md).
import type { Anchor } from "./anchors.ts";
import { between, seedShare } from "./shares.ts";
import { spanOf, SURFACE, type SurfaceName } from "./spans.ts";

export type Surface = Readonly<Record<SurfaceName, number>> & {
  /** How many octaves of noise reach `FINEST` from `scale`, each `lacunarity` times finer. */
  readonly octaves: number;
};

/** Cycles per radius of the finest structure the close view shows: two texels of the Earth's 4096-wide map. */
export const FINEST = 2048 / (2 * Math.PI);
const FIRST_BYTE = 9;
const NAMES = Object.keys(SURFACE) as SurfaceName[];

export function surfaceOf(more: Uint8Array, anchor: Anchor): Surface {
  const values = Object.fromEntries(
    NAMES.map((name, at) => [name, between(spanOf(anchor, name), seedShare(more, FIRST_BYTE + at))]),
  ) as Record<SurfaceName, number>;
  let octaves = 1;
  for (let frequency = values.scale; frequency < FINEST; frequency *= values.lacunarity) octaves += 1;
  return { ...values, octaves };
}
