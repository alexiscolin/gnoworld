import { Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { SUN_REST } from "../earth/view.ts";
import { sideLight, starAt } from "./light.ts";

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

  it("varies a little with the seed, and the same seed gives the same star", () => {
    const low = sideLight(bytes(0), new Vector3());
    expect(low.distanceTo(sideLight(bytes(255), new Vector3()))).toBeGreaterThan(0.1);
    expect(low.distanceTo(sideLight(bytes(0), new Vector3()))).toBe(0);
  });
});
