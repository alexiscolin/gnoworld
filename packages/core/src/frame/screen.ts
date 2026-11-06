// What a body on screen keeps (ADR-0002 §3): no pole towards the eye, a ring open 30 degrees at most, and room for the page's text. Plain
// numbers, for a frame reaches them.
import { smoothstep } from "../space/smooth.ts";

const MOST_LEAN = 0.5235987755982988;
// Over this many pixels from the box of the page's text, a body comes out whole.
const CLEAR_MARGIN = 28;

/** A place on screen and a size there, in pixels. */
export interface ScreenSpot {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

/** A box of the page's text, in its pixels: nothing drawn stands under it. */
export interface ClearBox {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** How far to lean a body whose look leans `lean`, seen `seen` radians off the view's axis: no world shows its pole, a ring opens 30 degrees at most. */
export const leanFor = (lean: number, seen: number): number => Math.max(-MOST_LEAN, Math.min(lean, MOST_LEAN)) + seen;

/** How much of a round thing at a place on screen may show: from 0 at the box's edge to 1 a little way out. */
export function clearOf({ x, y, radius }: ScreenSpot, box: ClearBox): number {
  return smoothstep(0, CLEAR_MARGIN, Math.max(box.left - x, x - box.right, box.top - y, y - box.bottom) - radius);
}
