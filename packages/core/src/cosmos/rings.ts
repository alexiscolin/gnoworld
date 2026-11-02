// Cells in rings (ADR-0002 §10; F3520). Ring r holds 6r cells, and each system a ray from the centre, a turn in [0, 1) that never changes.
// By rank, each takes the first free cell along its ray, so an arrival only pushes others outward along their own rays and nothing piles
// up. A ring at a time, each cell the best rank left among the rays through it, gives the same seats: every cell looked at seats a system,
// so n seats cost n log n, whatever the rays, where walking each ray costs n^1.5, and n^2 if they are one ray.

export interface Seat {
  /** From 1: the centre is gno.land's. */
  readonly ring: number;
  /** From 0, less than 6 * ring. */
  readonly cell: number;
}

const CELLS_A_RING = 6;
const NOBODY = 0x7fffffff;

const cellOf = (turn: number, cells: number): number => Math.floor(turn * cells);
// A cell's number over all rings: ring r starts after the 3r(r - 1) cells inside it.
const slotOf = (ring: number, cell: number): number => 3 * ring * (ring - 1) + cell;

// The first position past `from` whose turn leaves the cell of `from`.
function endOfCell(sorted: Float64Array, from: number, cells: number): number {
  const cell = cellOf(sorted[from] ?? 0, cells);
  let low = from;
  let high = sorted.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (cellOf(sorted[middle] ?? 0, cells) > cell) high = middle;
    else low = middle + 1;
  }
  return low;
}

// The rays not yet seated, by position in order of turn, with their ranks: a tree of minima to ask the best of a run, and links past
// the seated to find the next one left.
class Waiting {
  readonly #size: number;
  readonly #best: Int32Array;
  readonly #next: Int32Array;

  constructor(ranks: readonly number[]) {
    this.#size = ranks.length;
    this.#best = new Int32Array(2 * this.#size);
    this.#best.set(ranks, this.#size);
    for (let node = this.#size - 1; node >= 1; node -= 1) this.#settle(node);
    this.#next = Int32Array.from({ length: this.#size + 1 }, (_, at) => at);
  }

  #settle(node: number): void {
    this.#best[node] = Math.min(this.#best[2 * node] ?? NOBODY, this.#best[2 * node + 1] ?? NOBODY);
  }

  /** The best rank of positions `from` to `to`, `to` left out. */
  best(from: number, to: number): number {
    let least = NOBODY;
    let low = from + this.#size;
    let high = to + this.#size;
    while (low < high) {
      if (low & 1) {
        least = Math.min(least, this.#best[low] ?? NOBODY);
        low += 1;
      }
      if (high & 1) {
        high -= 1;
        least = Math.min(least, this.#best[high] ?? NOBODY);
      }
      low >>= 1;
      high >>= 1;
    }
    return least;
  }

  seat(position: number): void {
    this.#next[position] = position + 1;
    this.#best[position + this.#size] = NOBODY;
    for (let node = (position + this.#size) >> 1; node >= 1; node >>= 1) this.#settle(node);
  }

  /** The first position from `at` not yet seated, or the size. */
  nextFrom(at: number): number {
    let found = at;
    while ((this.#next[found] ?? found) !== found) {
      const hop = this.#next[found] ?? found;
      this.#next[found] = this.#next[hop] ?? hop;
      found = hop;
    }
    return found;
  }
}

/** A seat for each ray, the rays given by rank, best first. Two rays may be one: the better rank goes inward. No system takes a `reserved` seat. */
export function seatInRings(turns: readonly number[], reserved: readonly Seat[] = []): Seat[] {
  if (turns.some((turn) => !(turn >= 0 && turn < 1))) throw new RangeError("cosmos: a turn is at least 0 and under 1");
  const count = turns.length;
  const turnOf = (rank: number): number => turns[rank] ?? 0;
  const byTurn = [...turns.keys()].sort((a, b) => turnOf(a) - turnOf(b));
  const sorted = Float64Array.from(byTurn, turnOf);
  const positions = new Int32Array(count);
  byTurn.forEach((rank, position) => {
    positions[rank] = position;
  });
  const waiting = new Waiting(byTurn);
  const kept = new Set(reserved.map(({ ring, cell }) => slotOf(ring, cell)));
  const seats: Seat[] = [];
  for (let ring = 1, seated = 0; seated < count; ring += 1) {
    const cells = CELLS_A_RING * ring;
    for (let at = waiting.nextFrom(0); at < count;) {
      const end = endOfCell(sorted, at, cells);
      const cell = cellOf(sorted[at] ?? 0, cells);
      if (!kept.has(slotOf(ring, cell))) {
        const rank = waiting.best(at, end);
        seats[rank] = { ring, cell };
        waiting.seat(positions[rank] ?? 0);
        seated += 1;
      }
      at = waiting.nextFrom(end);
    }
  }
  return seats;
}
