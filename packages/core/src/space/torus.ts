// A box of cells that follows a moving centre, with no list and no end (slice-7 §5): each cell is held in the slot its coordinates wrap
// to, so a step writes only the cells that entered, a shader finds any of them by the same wrap, and the box costs the same anywhere.
import type { Point } from "./cell.ts";

/** `value` in [0, period), keeping what a 32-bit float would lose: the exact remainder of a double. */
export const wrapTo = (value: number, period: number): number => ((value % period) + period) % period;

/** The cell whose centre is nearest, in cells of `size`: the box stays centred on the eye. */
export const nearestCell = (value: number, size: number): number => Math.floor(value / size + 0.5);

// The cell of the box around `centre` that wraps to `slot`.
function cellIn(centre: number, slot: number, side: number): number {
  const low = centre - Math.floor(side / 2);
  return low + wrapTo(slot - low, side);
}

export class Torus {
  readonly #side: number;
  readonly #write: (slot: number, cell: Point) => void;
  readonly #cell = { x: NaN, y: NaN, z: NaN };
  // Three numbers a slot: what each holds, a double, as a cell can pass 32 bits.
  readonly #held: Float64Array;
  readonly #centre = { x: NaN, y: NaN, z: NaN };

  constructor(side: number, write: (slot: number, cell: Point) => void) {
    this.#side = side;
    this.#write = write;
    this.#held = new Float64Array(side ** 3 * 3).fill(NaN);
  }

  /** Moves the box to `centre`, writing what entered it; whether anything did. The cell it writes with is reused. */
  follow(centre: Point): boolean {
    const { x, y, z } = this.#centre;
    if (centre.x === x && centre.y === y && centre.z === z) return false;
    this.#centre.x = centre.x;
    this.#centre.y = centre.y;
    this.#centre.z = centre.z;
    const side = this.#side;
    for (let slot = 0; slot < side ** 3; slot += 1) {
      this.#cell.x = cellIn(centre.x, slot % side, side);
      this.#cell.y = cellIn(centre.y, Math.floor(slot / side) % side, side);
      this.#cell.z = cellIn(centre.z, Math.floor(slot / side ** 2), side);
      this.#visit(slot);
    }
    return true;
  }

  #visit(slot: number): void {
    const at = slot * 3;
    const { x, y, z } = this.#cell;
    if (this.#held[at] === x && this.#held[at + 1] === y && this.#held[at + 2] === z) return;
    this.#held[at] = x;
    this.#held[at + 1] = y;
    this.#held[at + 2] = z;
    this.#write(slot, this.#cell);
  }
}
