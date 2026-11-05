import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ENTERS, figuresOf, FLIGHT, flightSeconds, phaseOf, wayAt, type Figures } from "./flight.ts";

// A flight (7g; ADR-0001 §7, "travel like a ship"; docs/DESIGN-SYSTEM.md, "Motion"): 1.3 to 3.2 s by distance, a slow start out of orbit, a
// crossing and a slow arrival, and the panel's instruments read from it (frames 18, 36, 88, 89, 101, 128, 142).
const anyDistance = fc.double({ min: 0, max: 1e7, noNaN: true });
const anyAlong = fc.double({ min: 0, max: 1, noNaN: true });

const read = (flight: { distance: number; seconds: number }, along: number): Figures => {
  const out = { distance: NaN, speed: NaN, eta: NaN };
  figuresOf(flight, along, out);
  return out;
};

describe("how long a flight takes", () => {
  it("takes 1.3 s to a neighbour and 3.2 s across the disc, the design system's span, and never more or less", () => {
    expect(flightSeconds(0)).toBe(FLIGHT.least);
    expect(flightSeconds(10)).toBe(FLIGHT.least);
    expect(flightSeconds(1000)).toBe(FLIGHT.most);
    expect(flightSeconds(1e9)).toBe(FLIGHT.most);
    expect([FLIGHT.least, FLIGHT.most]).toEqual([1.3, 3.2]);
  });

  it("takes longer the farther it goes, by the log of the distance: ten times as far is not ten times as long", () => {
    fc.assert(
      fc.property(anyDistance, anyDistance, (a, b) => {
        const [near, far] = a < b ? [a, b] : [b, a];
        expect(flightSeconds(near)).toBeLessThanOrEqual(flightSeconds(far));
      }),
    );
    // A hundred units, the geometric middle of 10 and 1,000, takes the middle of the span.
    expect(flightSeconds(100)).toBeCloseTo((FLIGHT.least + FLIGHT.most) / 2, 9);
  });

  it("takes the longest flight for a distance it cannot read, and the shortest for none", () => {
    expect(flightSeconds(Number.NaN)).toBe(FLIGHT.most);
    expect(flightSeconds(Number.POSITIVE_INFINITY)).toBe(FLIGHT.most);
    expect(flightSeconds(-5)).toBe(FLIGHT.least);
  });

  it("is a crossfade of the design system's base motion under reduced motion", () => {
    expect(FLIGHT.crossfade).toBe(0.2);
  });
});

describe("the panel's phase", () => {
  it("leaves orbit, crosses, then enters orbit", () => {
    expect(phaseOf(0)).toBe("leaving");
    expect(phaseOf(0.1)).toBe("leaving");
    expect(phaseOf(0.5)).toBe("transit");
    expect(phaseOf(0.9)).toBe("entering");
    expect(phaseOf(1)).toBe("entering");
  });

  it("changes where the speed passes a third of its peak, on the way out and on the way in", () => {
    const flight = { distance: 100, seconds: 2 };
    const peak = read(flight, 0.5).speed;
    for (const along of [0.17, 0.83]) expect(read(flight, along).speed).toBeLessThan(peak / 3);
    for (const along of [0.18, 0.82]) expect(read(flight, along).speed).toBeGreaterThan(peak / 3);
    expect(phaseOf(0.17)).toBe("leaving");
    expect(phaseOf(0.18)).toBe("transit");
    expect(phaseOf(0.82)).toBe("transit");
    expect(phaseOf(0.83)).toBe("entering");
  });

  it("reads a progress outside the flight as its nearest end", () => {
    expect(phaseOf(-1)).toBe("leaving");
    expect(phaseOf(2)).toBe("entering");
    expect(phaseOf(Number.NaN)).toBe("leaving");
  });
});

describe("the eye's way", () => {
  it("eases out of orbit and into the next: none at its start, all at its end, half at its middle, its ends held", () => {
    expect([wayAt(0), wayAt(0.5), wayAt(1)]).toEqual([0, 0.5, 1]);
    expect([wayAt(-1), wayAt(Number.NaN), wayAt(2)]).toEqual([0, 0, 1]);
    expect(wayAt(0.1)).toBeLessThan(0.01);
    expect(1 - wayAt(0.9)).toBeLessThan(0.01);
  });

  it("enters orbit at the last instant of the transit: a flight that waits there is in transit", () => {
    expect(phaseOf(ENTERS)).toBe("transit");
    expect(phaseOf(ENTERS + 1e-9)).toBe("entering");
  });
});

describe("the panel's instruments", () => {
  it("start at the whole distance, at rest, the whole flight ahead, and end at nothing", () => {
    const flight = { distance: 100, seconds: flightSeconds(100) };
    expect(read(flight, 0)).toEqual({ distance: 5, speed: 0, eta: flight.seconds });
    expect(read(flight, 1)).toEqual({ distance: 0, speed: 0, eta: 0 });
  });

  it("count the distance and the time left down all the way, the time evenly, and peak the speed half way", () => {
    fc.assert(
      fc.property(fc.double({ min: 1, max: 5000, noNaN: true }), anyAlong, anyAlong, (distance, a, b) => {
        const flight = { distance, seconds: flightSeconds(distance) };
        const [early, late] = a < b ? [a, b] : [b, a];
        expect(read(flight, late).distance).toBeLessThanOrEqual(read(flight, early).distance);
        expect(read(flight, late).eta).toBeLessThanOrEqual(read(flight, early).eta);
        expect(read(flight, early).speed).toBeLessThanOrEqual(read(flight, 0.5).speed * (1 + 1e-12));
      }),
    );
    const flight = { distance: 100, seconds: 2 };
    expect(read(flight, 0.25).eta).toBeCloseTo(1.5, 12);
  });

  it("read in the video's ranges: a jump of a hundred units starts at 5 AU and peaks between 500 and 2,000 km/s", () => {
    const flight = { distance: 100, seconds: flightSeconds(100) };
    expect(read(flight, 0).distance).toBeCloseTo(5, 12);
    expect(read(flight, 0.5).speed).toBeGreaterThan(500);
    expect(read(flight, 0.5).speed).toBeLessThan(2000);
    // Frame 89, entering orbit: "0.00 AU" a breath from the end.
    expect(read(flight, 0.97).distance.toFixed(2)).toBe("0.00");
  });

  it("read a neighbour's jump and a jump across the disc in their own scale", () => {
    for (const [distance, start] of [
      [10, 0.5],
      [1000, 50],
    ] as const) {
      const flight = { distance, seconds: flightSeconds(distance) };
      expect(read(flight, 0).distance).toBeCloseTo(start, 12);
      expect(read(flight, 0.5).speed).toBeCloseTo((1.875 * distance * 22) / flight.seconds, 9);
    }
  });

  it("clamp a progress outside the flight to its ends", () => {
    const flight = { distance: 100, seconds: 2 };
    expect(read(flight, -1)).toEqual(read(flight, 0));
    expect(read(flight, 3)).toEqual(read(flight, 1));
  });
});
