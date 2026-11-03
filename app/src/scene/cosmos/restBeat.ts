// The sun's beat on the stage (slice 7d3; ADR-0001 §7, "gno.land as the sun, pulsing on each block"), in the view at rest's chunk: what the
// great star's light lifts by on a frame, from core's beat on the wall's time, the chain's. It moves only while the worlds' clock runs,
// which reduced motion stands still, as every orbit.
import { beatAt } from "@gnoworld/core";

// A fifth at the top: seen, never a flash.
const LIFT = 0.18;

export class Beat {
  #seconds = Number.NaN;
  #written: string | undefined;
  #read = Number.NaN;

  /** The lift on a frame `seconds` on the worlds' clock, from a file written at `written`, read when it first came: none while the clock
   * stands. */
  lift(written: string | undefined, seconds: number): number {
    if (written !== this.#written) this.#read = Date.now();
    this.#written = written;
    const moving = seconds > this.#seconds;
    this.#seconds = seconds;
    return moving ? LIFT * beatAt(Date.parse(written ?? ""), Date.now(), this.#read) : 0;
  }
}
