// The galaxy's places (D454): a saucer, thick at its heart and flat at its rim, the home at the heart and every other system round it on
// the sunflower's rule, the heaviest nearest (Alexis, 2026-11-09: "la soucoupe avec un placement math comme en B").
import { hashOf } from "./hash.ts";
import type { Vec } from "./layout.ts";

/** The galaxy's heart, where the home stands. */
export const HEART: Vec = { x: 0, y: 0, z: 0 };
// raw: the saucer's height at its heart, a share of its radius, how fast it falls to the rim and what it keeps there (Alexis, 2026-11-09)
const SAUCER = { heart: 0.24, fall: 1.6, rim: 0.012 } as const;
// raw: the room kept between two systems' outer orbits, and how far a crowded place steps out to find it
const GAP = 40;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

/** Where the `ids` stand, the heaviest first, round the home (its orbits `heart` wide): the golden angle loosened by a turn each id draws,
 * the radius by its rank's power a little under the root, the heart denser; the first `count` fill the disc, the rest stand past its rim,
 * so nothing of the file moves for them. Each steps out till its orbits clear those before it. */
// ponytail: n² steps (10⁴ at 100 systems); a grid by reach if the cosmos passes a few thousand.
export function placesOf(ids: readonly string[], reaches: readonly number[], { disc, count, heart }: Room): Vec[] {
  const placed = [{ at: HEART, reach: heart }];
  return ids.map((id, rank) => {
    const turn = rank * GOLDEN + hashOf(id, 8) * 0.6;
    const reach = reaches[rank] ?? 0;
    let r = disc * ((rank + 0.5) / Math.max(count, 1)) ** 0.55;
    let at = saucerAt(r, turn, { disc, lift: hashOf(id, 9) });
    while (
      !placed.every(
        (other) => Math.hypot(other.at.x - at.x, other.at.y - at.y, other.at.z - at.z) > other.reach + reach + GAP,
      )
    ) {
      r += GAP;
      at = saucerAt(r, turn, { disc, lift: hashOf(id, 9) });
    }
    placed.push({ at, reach });
    return at;
  });
}

interface Room {
  readonly disc: number;
  readonly count: number;
  readonly heart: number;
}

/** How high the saucer of radius `disc` stands either side of its plane, `r` from the heart. */
export const saucerHeight = (r: number, disc: number): number =>
  disc * (SAUCER.heart * Math.max(0, 1 - r / disc) ** SAUCER.fall + SAUCER.rim);

// A place `r` from the heart at `turn`, its height within the saucer's there: `lift`, 0 to 1, from its floor to its roof.
function saucerAt(r: number, turn: number, { disc, lift }: { disc: number; lift: number }): Vec {
  const height = saucerHeight(r, disc);
  return { x: Math.cos(turn) * r, y: (2 * lift - 1) * height, z: Math.sin(turn) * r };
}
