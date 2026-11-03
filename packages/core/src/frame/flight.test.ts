import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { systemsOf, type StarSystem, type WorldHeld } from "../cosmos/system.ts";
import { distanceOf, type Point } from "../space/cell.ts";
import { stopNear, ENTERS, figuresOf, FLIGHT, flightSeconds, phaseOf, wayAt, type Figures } from "./flight.ts";

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

// A few systems as the map places them, some with worlds and one without.
const held = (systems: number, each: number): WorldHeld[] =>
  Array.from({ length: systems }, (_, system) =>
    Array.from({ length: each }, (__, world) => ({
      id: `s${String(system)}/w${String(world)}`,
      namespace: `s${String(system)}`,
      use: 1 + ((system * 7 + world * 3) % 11) * 15,
    })),
  ).flat();
// Built inside each test, as StrykerJS needs (F2356).
const someSystems = () => systemsOf(held(40, 3));
// The plane's normal, the way core's onPlane turns `up`.
const normalOf = ({ tilt, node }: StarSystem): Point => ({
  x: -Math.sin(node) * Math.sin(tilt),
  y: Math.cos(tilt),
  z: Math.cos(node) * Math.sin(tilt),
});
const minus = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y + a.z * b.z;
const arrive = (system: StarSystem, from: Point): Point => {
  const out = { x: NaN, y: NaN, z: NaN };
  stopNear(system, from, out);
  return out;
};
const FROMS: Point[] = [
  { x: 0, y: 30, z: 120 },
  { x: -400, y: -12, z: 15 },
  { x: 37, y: 2, z: -260 },
];
const reachOf = ({ worlds }: StarSystem) => Math.max(0, ...worlds.map(({ orbit, radius }) => orbit + radius));

describe("where a flight to a star stops", () => {
  it("stands the eye far enough from the star for its whole system in view, and near enough to read it: 6 to 16 units", () => {
    for (const system of someSystems())
      for (const from of FROMS) {
        const away = distanceOf(arrive(system, from), system.place);
        expect(away).toBeGreaterThanOrEqual(6);
        expect(away).toBeLessThanOrEqual(16);
        expect(away).toBeGreaterThanOrEqual(Math.min(16, 2 * reachOf(system)));
      }
  });

  it("comes in on the side it came from, a little over the system's plane, never on its edge or over its pole", () => {
    for (const system of someSystems())
      for (const from of FROMS) {
        const offset = minus(arrive(system, from), system.place);
        const normal = normalOf(system);
        const height = dot(offset, normal) / Math.hypot(offset.x, offset.y, offset.z);
        // 20 degrees off the plane, on the side of the plane the eye came from.
        expect(Math.abs(height)).toBeCloseTo(Math.sin((20 * Math.PI) / 180), 9);
        expect(Math.sign(height)).toBe(Math.sign(dot(minus(from, system.place), normal)) || 1);
        // Seen round from the way it came: its part in the plane points to the eye's.
        const inPlane = (point: Point) => {
          const along = dot(point, normal);
          return { x: point.x - along * normal.x, y: point.y - along * normal.y, z: point.z - along * normal.z };
        };
        const [a, b] = [inPlane(offset), inPlane(minus(from, system.place))];
        expect(dot(a, b) / Math.hypot(a.x, a.y, a.z) / Math.hypot(b.x, b.y, b.z)).toBeCloseTo(1, 9);
      }
  });

  it("is the same stop for the same system from the same place", () => {
    const [system] = someSystems();
    if (system === undefined) throw new Error("no system");
    expect(arrive(system, { x: 5, y: 6, z: 7 })).toEqual(arrive(system, { x: 5, y: 6, z: 7 }));
  });

  it("stops at 6 units by a bare star and at 16 by a system as wide as a cell, the two bounds", () => {
    const [lone] = systemsOf([{ id: "solo/w", namespace: "solo", use: 1 }]);
    if (lone === undefined) throw new Error("no system");
    const bare = { ...lone, worlds: [] };
    const wide = { ...lone, worlds: [{ id: "solo/far", radius: 1, orbit: 9, phase: 0 }] };
    expect(distanceOf(arrive(bare, FROMS[0] ?? lone.place), bare.place)).toBeCloseTo(6, 9);
    expect(distanceOf(arrive(wide, FROMS[0] ?? lone.place), wide.place)).toBeCloseTo(16, 9);
  });

  it("comes in from over the pole as from anywhere: finite, in its bounds, 20 degrees off the plane", () => {
    for (const system of someSystems().slice(0, 5)) {
      const normal = normalOf(system);
      const from = {
        x: system.place.x + 50 * normal.x,
        y: system.place.y + 50 * normal.y,
        z: system.place.z + 50 * normal.z,
      };
      const offset = minus(arrive(system, from), system.place);
      const length = Math.hypot(offset.x, offset.y, offset.z);
      expect(length).toBeGreaterThanOrEqual(6);
      expect(length).toBeLessThanOrEqual(16);
      expect(dot(offset, normal) / length).toBeCloseTo(Math.sin((20 * Math.PI) / 180), 9);
    }
  });

  it("stops by a lone star, and by one the eye is already at", () => {
    const [lone] = systemsOf([{ id: "solo/w", namespace: "solo", use: 1 }]);
    if (lone === undefined) throw new Error("no system");
    const bare = { ...lone, worlds: [] };
    for (const from of [...FROMS, bare.place]) {
      const at = arrive(bare, from);
      expect(Number.isFinite(at.x + at.y + at.z)).toBe(true);
      expect(distanceOf(at, bare.place)).toBeGreaterThanOrEqual(6);
    }
  });
});
