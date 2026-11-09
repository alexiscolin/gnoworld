// A station's draws: one stream from its seed, read in a fixed order, so the same name always builds the same station.
import { nextState, textHash, unitOf } from "../space/cell.ts";

export class Draws {
  #state: number;

  constructor(seed: string) {
    this.#state = textHash(`station ${seed}`);
  }

  /** A number in [0, 1). */
  unit(): number {
    this.#state = nextState(this.#state);
    return unitOf(this.#state);
  }

  between(low: number, high: number): number {
    return low + (high - low) * this.unit();
  }

  /** A whole number from `low` to `high`, both included. */
  count(low: number, high: number): number {
    return Math.min(high, low + Math.floor(this.unit() * (high - low + 1)));
  }

  chance(share: number): boolean {
    return this.unit() < share;
  }

  /** One of `from`, all alike likely. */
  one<T>(from: readonly [T, ...T[]]): T {
    return from[this.count(0, from.length - 1)] ?? from[0];
  }
}
