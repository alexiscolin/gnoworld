import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { textHash } from "../space/cell.ts";
import { seatInRings, type Seat } from "./rings.ts";

// core/cosmos's cells (slice 7, 7d1; ADR-0002 §10; F3520): ring r holds 6r cells, each system has a ray from the centre, and by rank
// each takes the first cell free along its ray. `walked` is that sentence as plain code, a ring at a time for each ray in turn: it costs
// n^1.5 steps and the real one must not, so it is the oracle here and never the product.
const cellOn = (turn: number, ring: number): number => Math.floor(turn * 6 * ring);

function walked(turns: readonly number[]): Seat[] {
  const taken = new Set<number>();
  return turns.map((turn) => {
    for (let ring = 1; ; ring += 1) {
      const slot = 3 * ring * (ring - 1) + cellOn(turn, ring);
      if (!taken.has(slot)) {
        taken.add(slot);
        return { ring, cell: cellOn(turn, ring) };
      }
    }
  });
}

const turn = fc.double({ min: 0, max: 1, maxExcluded: true, noNaN: true });
const rays = fc.array(turn, { maxLength: 300 });
// Few distinct turns, so rays share their cells all the way out.
const crowded = fc.array(
  fc.integer({ min: 0, max: 7 }).map((step) => step / 8),
  { maxLength: 200 },
);
const scattered = (count: number): number[] => Array.from({ length: count }, (_, at) => textHash(String(at)) / 2 ** 32);

describe("seatInRings, by hand", () => {
  it("seats nobody for no ray", () => {
    expect(seatInRings([])).toEqual([]);
  });

  it("gives the best rank the first cell of ring 1 on its ray, and leaves the centre empty", () => {
    expect(seatInRings([0.1])).toEqual([{ ring: 1, cell: 0 }]);
    expect(seatInRings([0.5])).toEqual([{ ring: 1, cell: 3 }]);
  });

  it("gives rays in different cells of a ring their own cell there", () => {
    expect(seatInRings([0.1, 0.9])).toEqual([
      { ring: 1, cell: 0 },
      { ring: 1, cell: 5 },
    ]);
  });

  it("sends the worse rank of two in one cell outward along its own ray, whichever turn comes first", () => {
    expect(seatInRings([0.5, 0.52])).toEqual([
      { ring: 1, cell: 3 },
      { ring: 2, cell: 6 },
    ]);
    expect(seatInRings([0.52, 0.5])).toEqual([
      { ring: 1, cell: 3 },
      { ring: 2, cell: 6 },
    ]);
  });

  it("stacks rays that are one ray, one ring each, in rank order", () => {
    expect(seatInRings([0.1, 0.1, 0.1])).toEqual([
      { ring: 1, cell: 0 },
      { ring: 2, cell: 1 },
      { ring: 3, cell: 1 },
    ]);
  });

  it("parts rays in the next ring when they share a cell in one", () => {
    expect(seatInRings([0.26, 0.31, 0.2])).toEqual([
      { ring: 1, cell: 1 },
      { ring: 2, cell: 3 },
      { ring: 2, cell: 2 },
    ]);
  });

  it("holds the last turn before a whole turn in the last cell of its ring, and turn 0 in the first", () => {
    const last = 1 - 2 ** -32;
    expect(seatInRings([last, 0])).toEqual([
      { ring: 1, cell: 5 },
      { ring: 1, cell: 0 },
    ]);
  });

  it("puts a turn on a cell's exact edge in the cell it starts", () => {
    expect(seatInRings([0.5, 0.5 - 2 ** -32])).toEqual([
      { ring: 1, cell: 3 },
      { ring: 1, cell: 2 },
    ]);
  });
});

describe("seatInRings refuses what is no turn", () => {
  it.each([Number.NaN, 1, -0.1, 1.5, Number.POSITIVE_INFINITY])("refuses a turn of %j with a RangeError", (bad) => {
    expect(() => seatInRings([0.5, bad])).toThrow(new RangeError("cosmos: a turn is at least 0 and under 1"));
  });
});

describe("seatInRings, for any rays", () => {
  it("gives what walking each ray in turn gives, whatever the rays (property)", () => {
    fc.assert(
      fc.property(rays, (turns) => {
        expect(seatInRings(turns)).toEqual(walked(turns));
      }),
    );
  });

  it("gives what walking gives when rays share their cells all the way out (property)", () => {
    fc.assert(
      fc.property(crowded, (turns) => {
        expect(seatInRings(turns)).toEqual(walked(turns));
      }),
    );
  });

  it("gives what walking gives for 10,000 rays, past every ring's rim", () => {
    const turns = scattered(10_000);
    expect(seatInRings(turns)).toEqual(walked(turns));
  });

  it("seats every ray in a cell of its ring, on its ray, and no two in one cell (property)", () => {
    fc.assert(
      fc.property(rays, (turns) => {
        const seats = seatInRings(turns);
        expect(seats).toHaveLength(turns.length);
        seats.forEach(({ ring, cell }, rank) => {
          expect(cell).toBe(cellOn(turns[rank] ?? NaN, ring));
          expect(cell).toBeLessThan(6 * ring);
        });
        expect(new Set(seats.map(({ ring, cell }) => `${String(ring)}/${String(cell)}`)).size).toBe(seats.length);
      }),
    );
  });

  it("leaves no free cell inward of a seat on its ray (property)", () => {
    fc.assert(
      fc.property(rays, (turns) => {
        const seats = seatInRings(turns);
        const holders = new Map(seats.map(({ ring, cell }, rank) => [`${String(ring)}/${String(cell)}`, rank]));
        seats.forEach(({ ring }, rank) => {
          for (let inward = 1; inward < ring; inward += 1) {
            const holder = holders.get(`${String(inward)}/${String(cellOn(turns[rank] ?? NaN, inward))}`);
            expect(holder).toBeLessThan(rank);
          }
        });
      }),
    );
  });

  it("only ever pushes a seat outward when a ray joins, at any rank (property)", () => {
    fc.assert(
      fc.property(rays, turn, fc.nat(), (turns, added, at) => {
        const rank = at % (turns.length + 1);
        const joined = seatInRings([...turns.slice(0, rank), added, ...turns.slice(rank)]);
        joined.splice(rank, 1);
        seatInRings(turns).forEach(({ ring }, index) => {
          expect(joined[index]?.ring).toBeGreaterThanOrEqual(ring);
        });
      }),
    );
  });

  it("fills every ring inward of its rim, for scattered rays: nothing piles up and no hole opens", () => {
    const rings = new Map<number, number>();
    for (const { ring } of seatInRings(scattered(10_000))) rings.set(ring, (rings.get(ring) ?? 0) + 1);
    for (let ring = 1; ring <= 40; ring += 1) expect(rings.get(ring)).toBe(6 * ring);
    expect(Math.max(...rings.keys())).toBeLessThanOrEqual(80);
  });
});

// The worst rays a walk can meet, 30 ms measured. No clock here, for two bounds on one failed at load 20 and 34 (F3551): the test's own
// timeout is the bound, and a plain walk, at 7 billion steps, never reaches it.
describe("its cost: n log n at most, whatever the rays", () => {
  it("seats 120,000 rays that are one ray, a ring each", () => {
    expect(seatInRings(new Array<number>(120_000).fill(0.25)).at(-1)?.ring).toBe(120_000);
  });

  it("seats 120,000 rays on eight turns: each cell looked at seats one", () => {
    const eight = Array.from({ length: 120_000 }, (_, at) => (at % 8) / 8);
    expect(seatInRings(eight).at(-1)?.ring).toBe(15_000);
  });
});
