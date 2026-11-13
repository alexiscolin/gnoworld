// One stream of draws from a seed, read in a fixed order, so the same seed always gives the same numbers: a station's, a world's regions',
// the rocks' and the rounds' (a text is hashed whole; a number is already a state).
import { nextState, textHash, unitOf } from "../space/cell.ts";

export class Draws {
  #state: number;

  constructor(seed: string | number) {
    this.#state = typeof seed === "string" ? textHash(seed) : seed;
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
