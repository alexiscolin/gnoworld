import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { cellHash, nextState, textHash, unitOf } from "./cell.ts";

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

// Worked out apart from this code, in Python: FNV-1a over a text's UTF-16 units, finished by a cell's mixer.
describe("textHash", () => {
  it.each([
    ["", 723595804],
    ["a", 3999464523],
    ["gnoswap", 3039431222],
    ["system gnoswap", 1383802465],
    ["\u00e9t\u00e9", 3608156030],
    ["\u{1f600}", 3228936062],
  ])("holds its value for %j", (text, expected) => {
    expect(textHash(text)).toBe(expected);
  });

  it("gives a text a whole number of 32 bits", () => {
    fc.assert(
      fc.property(fc.string(), (text) => {
        const hash = textHash(text);
        expect(Number.isInteger(hash)).toBe(true);
        expect(hash).toBeGreaterThanOrEqual(0);
        expect(hash).toBeLessThan(2 ** 32);
      }),
    );
  });

  it("reads every unit of a text: one unit changed, another hash", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 40 }), fc.nat(), (text, at) => {
        const place = at % text.length;
        const changed =
          text.slice(0, place) + String.fromCharCode((text.charCodeAt(place) + 1) % 65536) + text.slice(place + 1);
        expect(textHash(changed)).not.toBe(textHash(text));
      }),
    );
  });

  it("spreads near names over all its bits: no pattern a map would show", () => {
    const ones = new Array<number>(32).fill(0);
    const names = 4096;
    for (let name = 0; name < names; name += 1) {
      const hash = textHash(`ns${String(name)}`);
      for (let bit = 0; bit < 32; bit += 1) ones[bit] = (ones[bit] ?? 0) + ((hash >>> bit) & 1);
    }
    for (const count of ones) expect(Math.abs(count / names - 0.5)).toBeLessThan(0.05);
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
