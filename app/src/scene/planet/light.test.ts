import { Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { SUN_REST } from "../earth/view.ts";
import { angleAt, FAR_ANGLE, sideLight, sideOf, starAt } from "./light.ts";

const EYE = new Vector3(0, 0, 1);
const bytes = (value: number) => new Uint8Array(32).fill(value);

describe("starAt, the Earth's own sun", () => {
  it("stands the star at the Earth's rest: 69 degrees right of the eye, as frame 39", () => {
    const sun = starAt(0, SUN_REST, new Vector3());
    expect(Math.acos(sun.dot(EYE))).toBeCloseTo((69 * Math.PI) / 180, 1);
    expect(sun.x).toBeGreaterThan(0.85);
  });

  it("lifts the star by the latitude", () => {
    expect(starAt(0.3, 0, new Vector3()).y).toBeCloseTo(Math.sin(0.3), 6);
  });
});

describe("sideLight, a generated world's star", () => {
  const angle = (seed: Uint8Array) => Math.acos(sideLight(seed, new Vector3()).dot(EYE));

  it("is a unit vector", () => {
    expect(sideLight(bytes(7), new Vector3()).length()).toBeCloseTo(1, 6);
  });

  it("lights the disc as the frames do, a half to three quarters, from the Earth's side, never from the front", () => {
    for (const value of [0, 64, 128, 200, 255]) {
      const seen = angle(bytes(value));
      expect(seen).toBeGreaterThanOrEqual((66 * Math.PI) / 180);
      expect(seen).toBeLessThanOrEqual((92 * Math.PI) / 180);
      expect(sideLight(bytes(value), new Vector3()).x).toBeGreaterThan(0.85);
    }
  });

  it.each([
    { first: 0, second: 0, away: 1.2, height: -0.3 },
    { first: 255, second: 0, away: 1.55, height: -0.3 },
    { first: 0, second: 255, away: 1.2, height: 0.34 },
    { first: 255, second: 255, away: 1.55, height: 0.34 },
  ])("takes its angle from the seed's first byte and its height from the second: $first, $second", (row) => {
    for (const rest of [0, 255]) {
      const seed = bytes(rest);
      seed[0] = row.first;
      seed[1] = row.second;
      const star = sideLight(seed, new Vector3());
      expect(Math.atan2(star.x, star.z)).toBeCloseTo(row.away, 10);
      expect(Math.asin(star.y)).toBeCloseTo(row.height, 10);
    }
  });

  it("varies a little with the seed, and the same seed gives the same star", () => {
    const low = sideLight(bytes(0), new Vector3());
    expect(low.distanceTo(sideLight(bytes(255), new Vector3()))).toBeGreaterThan(0.1);
    expect(low.distanceTo(sideLight(bytes(0), new Vector3()))).toBe(0);
  });
});

describe("sideOf", () => {
  const eye = new Vector3(0, 0, 1);
  const lit = (star: Vector3) => sideOf(star.clone().normalize(), eye, 1.3);

  it("keeps the side its star stands on, on screen", () => {
    const light = lit(new Vector3(-3, 1, 0.4));
    expect(light.x / light.y).toBeCloseTo(-3, 6);
  });

  it("stands always at the world's angle from the eye: a star behind the world or before it lights it the same", () => {
    for (const z of [-5, -1, 0, 1, 5]) {
      const light = lit(new Vector3(1, 0.2, z));
      expect(light.length()).toBeCloseTo(1, 6);
      expect(light.angleTo(eye)).toBeCloseTo(1.3, 6);
    }
  });

  it("still gives a light when the star stands dead on the axis", () => {
    expect(lit(new Vector3(0, 0, -1)).angleTo(eye)).toBeCloseTo(1.3, 6);
  });
});

describe("angleAt", () => {
  it("keeps a world's own angle up close: the marked night side stays for the close view", () => {
    expect(angleAt(1.4, 3)).toBe(1.4);
    expect(angleAt(1.4, 8)).toBe(1.4);
  });

  it("brings the light round to the eye from afar, a little off it, so a far world's whole disc reads", () => {
    expect(angleAt(1.4, 40)).toBe(FAR_ANGLE);
    expect(angleAt(1.2, 400)).toBe(FAR_ANGLE);
    expect(FAR_ANGLE).toBeGreaterThan(0.45);
    expect(FAR_ANGLE).toBeLessThan(0.95);
  });

  it("moves by degrees, as the eye does", () => {
    const middle = angleAt(1.4, 18);
    expect(middle).toBeGreaterThan(FAR_ANGLE);
    expect(middle).toBeLessThan(1.4);
  });
});
