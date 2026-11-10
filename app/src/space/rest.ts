// When the loop may stop asking for frames altogether (P102): the view is still, with nothing easing, flying or fading, and has been for a
// while. It sleeps till an input or a change wakes it, or a timer: the slowest orbit's half pixel, and a heartbeat for what no wake tells.
import type { Need } from "./redraw.ts";

/** How long nothing may have changed before the loop sleeps: maps still on their way and names still fading settle within it. */
export const CALM_MS = 5000;
/** The longest a sleeping loop goes without looking: data that changes the scene with no call to say so shows within it. */
export const HEARTBEAT_MS = 2000;
// A slow motion that would draw sooner than this keeps the loop awake.
const SHORTEST_NAP_MS = 100;
const HALF_PIXEL = 0.5;

export interface Calm {
  readonly need: Need;
  /** A flight, the hand, an effect, an arrival or a close planet. */
  readonly moving: boolean;
  /** Whether no name is fading in or out (labels.ts). */
  readonly settled: boolean;
  /** How long since the last frame that was drawn or changed. */
  readonly calm: number;
  /** The pixels a second the fastest slow motion moves. */
  readonly pxPerSecond: number;
}

/** The ms the loop may sleep for before it looks again; none, it stays awake. */
export function napFor({ need, moving, settled, calm, pxPerSecond }: Calm): number | undefined {
  if (need !== "none" || moving || !settled || calm < CALM_MS) return undefined;
  const nap = Math.min(HEARTBEAT_MS, pxPerSecond > 0 ? (HALF_PIXEL / pxPerSecond) * 1000 : HEARTBEAT_MS);
  return nap < SHORTEST_NAP_MS ? undefined : nap;
}
