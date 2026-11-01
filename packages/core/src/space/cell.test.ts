import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { cellHash, nextState, unitOf } from "./cell.ts";

// Worked out apart from this code, in Python's unbounded integers: the same cell gives the same hash on every device. FNV-1a's
// prime over the salt and then each axis's low and high words, finished by murmur3's mixer with Mueller's constants.
describe("cellHash", () => {
  it.each([
    [0, { x: 0, y: 0, z: 0 }, 861695770],
    [1, { x: 0, y: 0, z: 0 }, 642243043],
    [0, { x: 1, y: 0, z: 0 }, 4074479869],
    [0, { x: 0, y: 1, z: 0 }, 2775014611],
    [0, { x: 0, y: 0, z: 1 }, 4028360839],
    [0, { x: -1, y: 2, z: 3 }, 3905288904],
    [7, { x: 2 ** 32, y: 0, z: 0 }, 1068022744],
    [5, { x: 2 ** 40, y: -(2 ** 40), z: 3 }, 943140222],
  ])("holds its value for salt %i at %o", (salt, cell, expected) => {
    expect(cellHash(salt, cell)).toBe(expected);
  });

  it("gives a cell a whole number of 32 bits", () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer(), fc.integer(), (x, y, z) => {
        const hash = cellHash(3, { x, y, z });
        expect(Number.isInteger(hash)).toBe(true);
        expect(hash).toBeGreaterThanOrEqual(0);
        expect(hash).toBeLessThan(2 ** 32);
      }),
    );
  });

  it("tells a far cell from the one its low word names", () => {
    expect(cellHash(7, { x: 2 ** 32, y: 0, z: 0 })).not.toBe(cellHash(7, { x: 0, y: 0, z: 0 }));
    expect(cellHash(7, { x: -1, y: 0, z: 0 })).not.toBe(cellHash(7, { x: 2 ** 32 - 1, y: 0, z: 0 }));
  });

  it("gives the three axes different words: a cell and its mirror differ", () => {
    expect(cellHash(0, { x: 5, y: 9, z: 0 })).not.toBe(cellHash(0, { x: 9, y: 5, z: 0 }));
    expect(cellHash(0, { x: 0, y: 5, z: 9 })).not.toBe(cellHash(0, { x: 0, y: 9, z: 5 }));
  });

  it("spreads a line of neighbours over all its bits: no pattern a lattice would show", () => {
    const ones = new Array<number>(32).fill(0);
    const cells = 4096;
    for (let x = 0; x < cells; x += 1) {
      const hash = cellHash(1, { x, y: 0, z: 0 });
      for (let bit = 0; bit < 32; bit += 1) ones[bit] = (ones[bit] ?? 0) + ((hash >>> bit) & 1);
    }
    for (const count of ones) expect(Math.abs(count / cells - 0.5)).toBeLessThan(0.05);
  });
});

describe("a cell's stream", () => {
  // mulberry32 from 12345, worked out apart from this code.
  it("holds its values", () => {
    const first = nextState(12345);
    const second = nextState(first);
    expect(first).toBe(1831578158);
    expect(second).toBe(3663143971);
    expect(unitOf(first)).toBeCloseTo(0.9797282677609473, 12);
    expect(unitOf(second)).toBeCloseTo(0.3067522644996643, 12);
  });

  it("stays in [0, 1)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2 ** 32 - 1 }), (state) => {
        const value = unitOf(state);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(1);
      }),
    );
  });

  it("averages a half, and walks a 32-bit state", () => {
    let state = 1;
    let sum = 0;
    const steps = 10_000;
    for (let step = 0; step < steps; step += 1) {
      state = nextState(state);
      expect(state).toBeLessThan(2 ** 32);
      sum += unitOf(state);
    }
    expect(Math.abs(sum / steps - 0.5)).toBeLessThan(0.02);
  });
});
