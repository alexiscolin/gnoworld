// A bounded choice of the nearest (F3568): candidates come in a grid's order, the nearest go out first, ties by index, so a cap that binds
// drops the far and faint and never the near. It runs on a look, off the frame: one sort of what was offered.

export class Nearest {
  readonly #at: Int32Array;
  readonly #away: Float64Array;
  #count = 0;

  /** Room for `most` candidates: at most what a look can offer. */
  constructor(most: number) {
    this.#at = new Int32Array(most);
    this.#away = new Float64Array(most);
  }

  clear(): void {
    this.#count = 0;
  }

  offer(at: number, away: number): void {
    if (this.#count === this.#at.length) throw new RangeError("nearest: more candidates than its room");
    this.#at[this.#count] = at;
    this.#away[this.#count] = away;
    this.#count += 1;
  }

  /** Writes the nearest `most`, nearest first, into `out`, and says how many. */
  drain(out: Int32Array, most: number): number {
    const order = Array.from({ length: this.#count }, (_, index) => index);
    const away = this.#away;
    const at = this.#at;
    order.sort((a, b) => (away[a] ?? 0) - (away[b] ?? 0) || (at[a] ?? 0) - (at[b] ?? 0));
    const taken = Math.min(most, order.length);
    for (let index = 0; index < taken; index += 1) out[index] = at[order[index] ?? 0] ?? 0;
    return taken;
  }
}
