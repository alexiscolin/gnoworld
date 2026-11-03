// A world's appearance on this reader's first visit (decision rows F4103 and 2026-11-03; frames 20, 21 and 102 to 105): once the world
// rests, a band of light runs down it from its north pole drawing a grid behind it, which then fades; a seed grows to its world's size in one
// step from the same frame, and a wave of light runs out from it a little longer. Under reduced motion a still grid shows and fades, and a
// seed is its world at once, with no wave. A seed's part starts on the first resting frame that knows it is one: its file may come later.
import { smoothstep, type WorldSigns } from "@gnoworld/core";
import { eased } from "../earth/marks.ts";
import type { WorldReading } from "./reading.ts";

const GROW = 1.4;
const RUN = 3;
// Timed on the frames, one a second: landed at 102, the band just under the equator at 103, the grid whole and strong at 104, gone by 105.
const SWEEP = 1.6;
const FADE = 0.8;
/** Where the band stands before it comes and once it has gone, in the world's own height: past a pole by more than its glow. */
export const BAND_REACH = 1.4;

type Growing = { -readonly [Key in keyof WorldSigns]: WorldSigns[Key] };

/** How the world stands on a frame: under reduced motion, and at rest, no flight bringing it. */
export interface Pose {
  readonly still: boolean;
  readonly resting: boolean;
}

/** Where an appearance stands, kept across a context restored: it never plays twice, nor starts again. */
export interface Kept {
  readonly drawn: number | undefined;
  readonly woke: number | undefined;
}

export class Wake {
  #drawn: number | undefined;
  #woke: number | undefined;
  #growing: Growing | undefined;
  /** What is left of a seed's wave, 1 as it starts and 0 once gone. */
  left = 0;
  /** Where the band stands, in the world's own height: 1 at its north pole, -1 at its south. */
  band = -BAND_REACH;
  /** How much of the grid shows, 1 whole and 0 none. */
  grid = 0;

  /** The appearance at `seconds`, and the signs it gives the world: none starts while a flight brings the world, not yet `resting`. */
  at(reading: WorldReading | undefined, seconds: number, { still, resting }: Pose): WorldSigns | undefined {
    if (resting && reading?.first === true) this.#drawn ??= seconds;
    if (resting && reading?.wake === true) this.#woke ??= seconds;
    this.#draw(seconds, still);
    return this.#grow(reading, seconds, still);
  }

  #draw(seconds: number, still: boolean): void {
    const age = this.#drawn === undefined ? Infinity : seconds - this.#drawn;
    this.band = still || age >= SWEEP ? -BAND_REACH : BAND_REACH * (1 - (2 * age) / SWEEP);
    this.grid = 1 - smoothstep(SWEEP, SWEEP + FADE, age);
  }

  #grow(reading: WorldReading | undefined, seconds: number, still: boolean): WorldSigns | undefined {
    this.left = 0;
    if (reading?.woken === undefined || !reading.wake) return reading?.signs;
    if (still) return reading.woken;
    if (this.#woke === undefined) return reading.signs;
    const age = seconds - this.#woke;
    const grown = eased(Math.min(age / GROW, 1));
    this.left = Math.max(0, 1 - age / RUN);
    const { signs, woken } = reading;
    if (grown >= 1) return woken;
    // Written into what the wake keeps: nothing is made on a frame.
    const growing = (this.#growing ??= { ...signs });
    Object.assign(growing, signs);
    growing.size = signs.size + (woken.size - signs.size) * grown;
    growing.signal = signs.signal * (1 - grown);
    return growing;
  }

  reset(): void {
    this.#drawn = undefined;
    this.#woke = undefined;
    this.left = 0;
  }

  keep(): Kept {
    return { drawn: this.#drawn, woke: this.#woke };
  }

  restore({ drawn, woke }: Kept): void {
    this.#drawn = drawn;
    this.#woke = woke;
  }
}
