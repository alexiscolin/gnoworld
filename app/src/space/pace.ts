// How often the scene draws and how sharp (P100, P103, P106): ambient drawing at 60 Hz at most, 30 where the window has no focus; the
// pixel ratio stepped down by itself only where the frames cannot keep up.
import type { Need } from "./redraw.ts";

const AMBIENT_MS = 16.7;
const UNFOCUSED_MS = 33.3;

/** The least time between two frames the loop works on: none for what moves by the hand or by an ease. */
export const gapFor = (need: Need, focused: boolean): number =>
  need === "full" ? 0 : focused ? AMBIENT_MS : UNFOCUSED_MS;

// A 60 Hz period and a half: past it the median frame misses its beat. Over 3 s of frames, none of a stall (a load, a hidden tab).
const SLOW_MS = 1.3 * 16.7;
// A beat missed unevenly (a GPU at its limit: frames of 17, 33, 50 ms) spreads the 10th to the 90th percentile; a steady cap (a browser
// that gives 30 Hz to save the battery) does not: it is no weak GPU, and the ratio stays.
const UNEVEN_MS = 8;
// A window this quick is one that keeps up; this many in a row (30 s) let the ratio rise a step again.
const KEEPING_MS = 18;
const KEEPING_WINDOWS = 10;
const WINDOW_MS = 3000;
const STALL_MS = 250;
const MOST_FRAMES = 20;

export type Verdict = "down" | "up" | undefined;

/** Says when the frames cannot keep up ("down"), and when they have kept up long enough to try a step back ("up"), over windows of 3 s. */
export class Governor {
  #deltas: number[] = [];
  #span = 0;
  #keeping = 0;
  #raised = false;
  #locked = false;

  /** A frame that came `delta` ms after the last. */
  feed(delta: number): Verdict {
    if (delta > STALL_MS) return undefined;
    this.#deltas.push(delta);
    this.#span += delta;
    if (this.#span < WINDOW_MS) return undefined;
    const sorted = this.#deltas.toSorted((a, b) => a - b);
    const at = (share: number) => sorted[Math.floor((sorted.length - 1) * share)] ?? 0;
    const counted = sorted.length >= MOST_FRAMES;
    this.reset();
    if (!counted) return undefined;
    const median = sorted[sorted.length >> 1] ?? 0;
    if (median > SLOW_MS && at(0.9) - at(0.1) > UNEVEN_MS) {
      this.#keeping = 0;
      // A step down right after a step back up: this machine cannot hold the higher ratio, and does not try again.
      this.#locked = this.#raised;
      this.#raised = false;
      return "down";
    }
    this.#keeping = median <= KEEPING_MS ? this.#keeping + 1 : 0;
    if (this.#keeping < KEEPING_WINDOWS || this.#locked) return undefined;
    this.#keeping = 0;
    this.#raised = true;
    return "up";
  }

  /** A place changed, a context came back, the page woke: the window starts anew. */
  reset(): void {
    this.#deltas = [];
    this.#span = 0;
  }
}

/** The ratio a step down gives: a quarter less, 1 at the least, a ratio already under 1 (a phone's) as it is. */
export const lowered = (ratio: number): number => (ratio > 1 ? Math.max(1, ratio - 0.25) : ratio);

/** The cap a step up gives: a quarter more, none (the screen's own) once it reaches 2. */
export const raised = (ratio: number): number => (ratio + 0.25 >= 2 ? Infinity : ratio + 0.25);
