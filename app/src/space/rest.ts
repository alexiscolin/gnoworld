// When the loop may stop asking for frames altogether (P102): the view is still, with nothing easing, flying or fading, and has been for a
// while. It sleeps till an input or a change wakes it, or a timer: the slowest orbit's half pixel, and a heartbeat for what no wake tells.
import type { Need } from "./redraw.ts";

/** How long nothing may have changed before the loop sleeps: maps still on their way and names still fading settle within it. */
export const CALM_MS = 5000;
/** The longest a sleeping loop goes without looking: data that changes the scene with no call to say so shows within it. */
export const HEARTBEAT_MS = 2000;
/**
 * The pace of a view that is still while something on it moves by itself (D13013): 15 frames a second. A planet's turn, clouds and a sun's
 * face are slow, so a quarter of the 60 Hz cost still shows them smooth (equal steps), where sleeping froze them.
 */
export const LIVELY_MS = 1000 / 15;
/** The pixels a second a slow motion moves at least, to count as something that moves on screen. */
export const LIVELY_PX = 1;
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
  /** Whether something visible moves by itself (a turning planet, a sun's face): the loop keeps drawing, at LIVELY_MS. */
  readonly lively: boolean;
}

/** The ms the loop may sleep for before it looks again; none, it stays awake. */
export function napFor({ need, moving, settled, calm, pxPerSecond, lively }: Calm): number | undefined {
  if (need === "full" || moving || !settled || calm < CALM_MS) return undefined;
  if (lively) return LIVELY_MS;
  if (need !== "none") return undefined;
  const nap = Math.min(HEARTBEAT_MS, pxPerSecond > 0 ? (HALF_PIXEL / pxPerSecond) * 1000 : HEARTBEAT_MS);
  return nap < SHORTEST_NAP_MS ? undefined : nap;
}
