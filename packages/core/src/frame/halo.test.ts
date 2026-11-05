import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { systemsOf, type StarSystem } from "../cosmos/system.ts";
import { glowsAt, HALO_FAR, haloAt, mainSizeOf, OTHER_SUN, pointReach, sunReach } from "./halo.ts";

// A star's halo by its distance from the eye (7d6, 7d3), and a sun's size on the screen: whole near, a point far, and no two suns at
// different distances one size, the nearer the larger, every other under half the main light's (the not-a-planetarium rule).
const system = (namespace: string, worlds = 3) =>
  systemsOf(
    Array.from({ length: worlds }, (_, at) => ({ id: `${namespace}/w${String(at)}`, namespace, use: at * 40 })),
  ).find(({ id }) => id === namespace);
const FOCAL = 1200;

describe("a star's halo", () => {
  it("is whole to 40 units, gone by 120, and never grows as the eye goes", () => {
    expect([0, 40, 80, HALO_FAR, 500].map(haloAt)).toEqual([1, 1, 0.5, 0, 0]);
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 400, noNaN: true }),
        fc.double({ min: 0, max: 400, noNaN: true }),
        (a, b) => {
          expect(haloAt(Math.max(a, b))).toBeLessThanOrEqual(haloAt(Math.min(a, b)));
        },
      ),
    );
  });

  it("glows as a second sun while three quarters of its halo or more shows", () => {
    expect(glowsAt(40)).toBe(true);
    expect(glowsAt(120)).toBe(false);
    const edge = [...Array.from({ length: 801 }, (_, at) => 40 + at / 10)].find((distance) => !glowsAt(distance)) ?? 0;
    expect(haloAt(edge)).toBeLessThan(0.75);
    expect(haloAt(edge - 0.1)).toBeGreaterThanOrEqual(0.75);
  });
});

describe("a sun's size", () => {
  const star = system("gnoswap", 9);
  if (star === undefined) throw new Error("no system");

  it("is no size with no main light, and the main light's at most 320 pixels", () => {
    expect(mainSizeOf(undefined, { x: 0, y: 0, z: 0 }, FOCAL)).toBe(Infinity);
    expect(mainSizeOf(star, star.place, FOCAL)).toBeCloseTo(320 / FOCAL, 12);
    const far = { x: star.place.x + 1000, y: star.place.y, z: star.place.z };
    expect(mainSizeOf(star, far, FOCAL)).toBeLessThan(320 / FOCAL);
  });

  it("is its point with no halo shown, its whole reach with all of it, and between them in between", () => {
    const sight = { distance: 60, focal: FOCAL };
    const point = sunReach(star, { ...sight, halo: 0 });
    const whole = sunReach(star, { ...sight, halo: 1 });
    expect(point).toBeCloseTo(Math.min(whole, pointReach(60, FOCAL)), 12);
    expect(sunReach(star, { ...sight, halo: 0.5 })).toBeCloseTo((point + whole) / 2, 12);
    expect(whole).toBeGreaterThan(point);
  });

  it("stands every other sun under its share of the main light's size, the nearer the larger on the screen", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 5, max: 400, noNaN: true }),
        fc.double({ min: 1.01, max: 3, noNaN: true }),
        (near, by) => {
          const most = OTHER_SUN * (320 / FOCAL);
          const seen = (distance: number) => sunReach(star, { distance, focal: FOCAL, halo: 1, most }) / distance;
          expect(seen(near)).toBeLessThanOrEqual(most + 1e-12);
          expect(seen(near * by)).toBeLessThan(seen(near));
        },
      ),
    );
  });
});

// 8r: halo.ts's numbers, pinned where StrykerJS found them loose (8n's run, 2026-11-05). A star of size 4 reaches 7.5 * 2 + 2 = 17 on
// the map; a point is 10 pixels of radius; the main light's halo is 320 pixels at its widest.
describe("a sun's reach in numbers", () => {
  const sized = (star: number): StarSystem => ({
    id: "test",
    place: { x: 0, y: 0, z: 0 },
    star,
    warmth: 0.5,
    spin: 0,
    tilt: 0,
    node: 0,
    belt: false,
    worlds: [],
  });

  it("a point's reach grows with its distance and shrinks with the lens: 10 pixels at 20 units through 2 is 100", () => {
    expect(pointReach(20, 2)).toBe(100);
    expect(pointReach(40, 2)).toBe(200);
  });

  it("the main light, its halo whole and room on the screen, reaches its own 7.5 times the root of its size plus 2", () => {
    expect(sunReach(sized(4), { distance: 1, focal: 1, halo: 1 })).toBe(17);
    expect(sunReach(sized(16), { distance: 1, focal: 1, halo: 1 })).toBe(32);
  });

  it("the main light never draws past its widest halo, 320 pixels: through a lens of 320 at 1 unit it reaches 1, not its own 17", () => {
    expect(sunReach(sized(4), { distance: 1, focal: 320, halo: 1 })).toBe(1);
  });

  it("any other sun stands under `most` times its distance, and near it when its own reach is far past it", () => {
    const reach = sunReach(sized(4), { distance: 4, focal: 1, halo: 1, most: 0.5 });
    expect(reach).toBeLessThan(2);
    expect(reach).toBeCloseTo(2, 3);
    const far = sunReach(sized(4), { distance: 400, focal: 1, halo: 1, most: 0.5 });
    expect(far).toBeLessThan(17);
    expect(far).toBeCloseTo(17, 3);
  });
});
