// What the ladder's distances mean on screen, for what is drawn from them (ADR-0002 §3): how far a system opens from afar, its true places
// unchanged, and what the page's text leaves. Plain numbers, for a frame reaches them.
import { lerp, smoothstep } from "../space/smooth.ts";

/** How far a system opens, seen from afar: its worlds stand this many times further from their star on screen. */
export const SPREAD = 2.6;

const SPREAD_FROM = 8;
const SPREAD_TO = 26;
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

/** How far a system stands open at a distance: shut up close, wide from the arrival on. */
export const spreadAt = (distance: number): number => lerp(1, SPREAD, smoothstep(SPREAD_FROM, SPREAD_TO, distance));

/** How much of a round thing at a place on screen may show: from 0 at the box's edge to 1 a little way out. */
export function clearOf({ x, y, radius }: ScreenSpot, box: ClearBox): number {
  return smoothstep(0, CLEAR_MARGIN, Math.max(box.left - x, x - box.right, box.top - y, y - box.bottom) - radius);
}
