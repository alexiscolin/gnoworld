// The wake (decision row F4103): a seed on this reader's first visit grows to its world's size in one step, and a wave of light runs out from
// it a little longer. Under reduced motion it is the world at once, with no wave.
import type { WorldSigns } from "@gnoworld/core";
import { eased } from "../earth/marks.ts";
import type { WorldReading } from "./reading.ts";

const GROW = 1.4;
const RUN = 3;

type Growing = { -readonly [Key in keyof WorldSigns]: WorldSigns[Key] };

export class Wake {
  #from: number | undefined;
  #growing: Growing | undefined;
  /** What is left of the wave, 1 as it starts and 0 once gone. */
  left = 0;

  /** A reading that wakes a seed starts the wake on the next frame. */
  read(reading: WorldReading, last: WorldReading | undefined): void {
    if (reading.wake && last?.wake !== true) this.#from = undefined;
  }

  /** The signs at `seconds`. */
  signsAt(reading: WorldReading | undefined, seconds: number, still: boolean): WorldSigns | undefined {
    this.left = 0;
    if (reading?.woken === undefined || !reading.wake) return reading?.signs;
    if (still) return reading.woken;
    this.#from ??= seconds;
    const age = seconds - this.#from;
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
    this.#from = undefined;
    this.left = 0;
  }

  /** Where the wake stands, kept across a context restored: a world that woke never wakes twice. */
  keep(): number | undefined {
    return this.#from;
  }

  restore(from: number | undefined): void {
    this.#from = from;
  }
}
