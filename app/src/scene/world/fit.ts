// A world's share of the circle its page keeps, by its size, read on the frames (Alexis, 2026-11-02, F4307): the busiest fills it, as
// frame 104's Bubble (336 px of radius at 1728 by 1080, 214 here); one at rest is frame 22's quieter GovDAO (172 px, 38 here); a seed is
// a small heart under it. The page sizes the circle so that the busiest's ring stays clear of the plate's words and the dock.
import { SIZE_BUSIEST } from "@gnoworld/core";

/** A world at rest, frame 22's GovDAO against frame 104's Bubble. */
const REST = 172 / 336;

/** The share of its circle a world of `size` fills: its size times the rest's share up to rest, then on to the whole circle at the busiest. */
export function fitOf(size: number): number {
  if (size <= 1) return REST * Math.max(0, size);
  return Math.min(1, REST + ((1 - REST) * (size - 1)) / (SIZE_BUSIEST - 1));
}
