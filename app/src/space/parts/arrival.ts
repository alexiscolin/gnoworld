import { smoothstep } from "@gnoworld/core";

// When a planet counts as ready to be seen as itself, and how it comes in: eased over a short fade, at once where motion is reduced.

/** How long a planet takes to come in from its skeleton, in seconds (D13969). */
export const FADE_S = 0.6;

export interface Readiness {
  /** Its shaders compiled. */
  readonly compiled: boolean;
  /** Its maps not yet on the GPU. */
  readonly uploads: number;
  /** Among the planets drawn as themselves. */
  readonly wanted: boolean;
  /** The page's planet (-1 when none): the only one drawn as itself where a page shows one. */
  readonly alone: number;
  readonly index: number;
}

/** Whether a planet stands as itself: made whole, wanted, and the page's own when a page shows one. */
export const ready = ({ compiled, uploads, wanted, alone, index }: Readiness): boolean =>
  compiled && uploads === 0 && wanted && (alone < 0 || alone === index);

/** The longest frame the fade counts: a stalled frame (a first draw, an upload) never swallows it. */
const LONGEST_S = 1 / 20;

/** The share `share` (0 to 1) of a planet's arrival, `delta` seconds on. */
export const advance = (share: number, delta: number, still: boolean): number =>
  still ? 1 : Math.min(1, share + Math.min(delta, LONGEST_S) / FADE_S);

/** One frame of a held planet's arrival: its eased share, 0 to 1. The frame it is first shown stands at 0, whatever the one before cost. */
export function step(
  held: { fresh: boolean; arrive: number },
  { delta, still }: { delta: number; still: boolean },
): number {
  if (held.fresh) held.fresh = false;
  else held.arrive = advance(held.arrive, delta, still);
  return eased(held.arrive);
}

/** A share eased in and out. */
export const eased = (share: number): number => smoothstep(0, 1, share);
