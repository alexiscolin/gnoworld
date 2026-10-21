import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { partsFrom } from "./parts.ts";

// An address's shape: g1, then 38 letters of bech32's alphabet. The checksum is not the face's.
const BECH32 = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const address = fc
  .array(fc.constantFrom(...BECH32.split("")), { minLength: 38, maxLength: 38 })
  .map((letters) => `g1${letters.join("")}`);

// Strings an address's check could take for one: a letter short or over, a letter bech32 leaves out,
// space or a line's end around it, a capital, a letter beyond the BMP, or 10,000 letters.
const nearMiss = fc.oneof(
  address.map((a) => a.slice(0, -1)),
  address.map((a) => `${a}q`),
  fc
    .tuple(address, fc.nat(37), fc.constantFrom("b", "i", "o", "1", "B", "Q"))
    .map(([a, at, letter]) => `${a.slice(0, 2 + at)}${letter}${a.slice(3 + at)}`),
  fc
    .tuple(address, fc.constantFrom(" ", "\n", "\t", "\u00a0"))
    .chain(([a, space]) => fc.constantFrom(`${space}${a}`, `${a}${space}`)),
  address.map((a) => a.toUpperCase()),
  address.map((a) => `${a.slice(0, -1)}\u{1F30C}`),
  address.map((a) => a.repeat(250)),
);

// The angle of a point of the 48-unit disc, from its centre, in degrees from 0 to 360.
const angle = ([x, y]: readonly [number, number]) => (Math.atan2(y - 24, x - 24) * 180) / Math.PI + 180;
// How far apart two hues are round the wheel.
const apart = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
// Whether some turn of five 72-degree sectors holds one angle in each: if one does, so does the turn
// whose boundary falls just past one of the angles, so those five turns are enough to try.
const onePerFifth = (angles: readonly number[]) =>
  angles.some(
    (start) => new Set(angles.map((a) => Math.floor(((((a - start - 1e-9) % 360) + 360) % 360) / 72))).size === 5,
  );

describe("partsFrom", () => {
  it("gives the same address the same parts, every time", () => {
    fc.assert(
      fc.property(address, (a) => {
        expect(partsFrom(a)).toEqual(partsFrom(a));
      }),
    );
  });

  it("gives two addresses one letter apart, wherever it is, two faces", () => {
    fc.assert(
      fc.property(address, fc.nat(37), fc.constantFrom(...BECH32.split("")), (a, at, letter) => {
        const other = `${a.slice(0, 2 + at)}${letter}${a.slice(3 + at)}`;
        fc.pre(other !== a);
        expect(partsFrom(other)).not.toEqual(partsFrom(a));
      }),
    );
  });

  // Memoised: a list of 200 people draws each face's parts once, and a cache of every address ever
  // seen would grow with each stranger, so the oldest leave it.
  it("hands an address the parts it already drew, and forgets the oldest of many", () => {
    const first = `g1${"q".repeat(38)}`;
    const parts = partsFrom(first);
    expect(partsFrom(first)).toBe(parts);
    for (let n = 0; n < 10_000; n++)
      partsFrom(
        `g1${n
          .toString(32)
          .padStart(38, "q")
          .replace(/[1bio]/g, "p")}`,
      );
    expect(partsFrom(first)).not.toBe(parts);
    expect(partsFrom(first)).toEqual(parts);
  });

  it("draws three hues round the whole wheel, each at least 60 degrees from the others", () => {
    const bins = new Set<number>();
    fc.assert(
      fc.property(address, (a) => {
        const hues = partsFrom(a)?.hues ?? [];
        expect(hues).toHaveLength(3);
        for (const hue of hues) expect(hue >= 0 && hue < 360).toBe(true);
        for (const hue of hues) bins.add(Math.floor(hue / 30));
        const [h0 = 0, h1 = 0, h2 = 0] = hues;
        for (const [x, y] of [
          [h0, h1],
          [h1, h2],
          [h0, h2],
        ] as const)
          expect(apart(x, y)).toBeGreaterThanOrEqual(60);
      }),
      { numRuns: 300 },
    );
    expect(bins.size).toBe(12);
  });

  it("places three clouds inside the disc", () => {
    fc.assert(
      fc.property(address, (a) => {
        const clouds = partsFrom(a)?.clouds ?? [];
        expect(clouds).toHaveLength(3);
        for (const [x, y] of clouds) expect(x >= 0.1 && x <= 0.9 && y >= 0.1 && y <= 0.9).toBe(true);
      }),
    );
  });

  // Readable at 20 px: no star at the centre or the edge, and none on another (5 units, 2 px at 20 px).
  it("puts five stars in the disc's ring, one in each fifth, apart, so the shape stays open", () => {
    fc.assert(
      fc.property(address, (a) => {
        const stars = partsFrom(a)?.stars ?? [];
        expect(stars).toHaveLength(5);
        for (const [x, y] of stars) {
          expect(Math.hypot(x - 24, y - 24)).toBeLessThanOrEqual(24 * 0.85);
          expect(Math.hypot(x - 24, y - 24)).toBeGreaterThanOrEqual(24 * 0.4);
        }
        expect(onePerFifth(stars.map(angle))).toBe(true);
        for (const [i, [x, y]] of stars.entries())
          for (const [u, v] of stars.slice(i + 1)) expect(Math.hypot(x - u, y - v)).toBeGreaterThanOrEqual(5);
      }),
    );
  });

  it("tells two stars in one fifth from one in each, so the fifths' test is not blind", () => {
    expect(onePerFifth([0, 100, 200, 300, 310])).toBe(false);
    expect(onePerFifth([10, 82, 154, 226, 298])).toBe(true);
    expect(onePerFifth([71, 72.5, 150, 230, 300])).toBe(true);
  });

  it("joins the stars in one of three orders, one of them bright, each order and star in use", () => {
    const [orders, brights] = [new Set<number>(), new Set<number>()];
    fc.assert(
      fc.property(address, (a) => {
        const parts = partsFrom(a);
        expect([0, 1, 2]).toContain(parts?.order);
        expect([0, 1, 2, 3, 4]).toContain(parts?.bright);
        orders.add(parts?.order ?? -1);
        brights.add(parts?.bright ?? -1);
      }),
      { numRuns: 300 },
    );
    expect([...orders].sort()).toEqual([0, 1, 2]);
    expect([...brights].sort()).toEqual([0, 1, 2, 3, 4]);
  });

  it("draws no face, and never throws, for what is not an address", () => {
    fc.assert(
      fc.property(fc.string(), (text) => {
        fc.pre(!/^g1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{38}$/.test(text));
        expect(partsFrom(text)).toBeNull();
      }),
    );
    fc.assert(
      fc.property(nearMiss, (text) => {
        expect(partsFrom(text)).toBeNull();
      }),
    );
    for (const text of ["", "g1", `g1${"b".repeat(38)}`, `G1${"q".repeat(38)}`, `g1${"q".repeat(39)}`])
      expect(partsFrom(text)).toBeNull();
  });
});
