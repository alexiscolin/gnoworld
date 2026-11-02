// A world's share of the circle its page keeps (Alexis, 2026-11-02, F4307; ADR-0002 §3, the chief's reading): its use against its universe,
// on a log scale. The universe's busiest fill it, as frame 104's Bubble (336 px of radius at 1728 by 1080); the quietest stand as frame 22's
// GovDAO (172 px); while the universe's file has no count, the scale's middle, claiming neither; a seed is a small heart under the quietest.
import { share } from "@gnoworld/core";

/** The universe's quietest, frame 22's GovDAO against frame 104's Bubble. */
const QUIET = 172 / 336;
/** Where a world stands while its universe's use is not known. */
const UNKNOWN = 0.5;

/** The share of its circle a world of `size` fills, `used` its use against its universe (reading.ts), none when not known. */
export function fitOf(size: number, used: number | undefined): number {
  if (size < 1) return QUIET * Math.max(0, size);
  return QUIET + (1 - QUIET) * (used === undefined ? UNKNOWN : share(used));
}
