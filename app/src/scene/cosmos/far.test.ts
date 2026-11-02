import { Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { LIMB_LIGHT } from "../planet/planet.ts";
import { angleAt, FAR_ANGLE, limbAt, sideOf } from "./far.ts";

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
    // f0004's worlds right of the third star are lit across 0.68 to 0.72 of their width: (1 + cos p) / 2 = 0.70 gives about 65 degrees.
    expect((1 + Math.cos(FAR_ANGLE)) / 2).toBeCloseTo(0.71, 1);
    expect(FAR_ANGLE).toBeCloseTo((65 * Math.PI) / 180, 6);
  });

  it("moves by degrees, as the eye does", () => {
    const middle = angleAt(1.4, 18);
    expect(middle).toBeGreaterThan(FAR_ANGLE);
    expect(middle).toBeLessThan(1.4);
  });
});

describe("limbAt", () => {
  it("keeps the Earth's limb up close, and a fifth of it from afar", () => {
    expect(limbAt(4)).toBe(LIMB_LIGHT);
    expect(limbAt(60)).toBeCloseTo(LIMB_LIGHT * 0.2, 6);
    expect(limbAt(18)).toBeGreaterThan(limbAt(60));
    expect(limbAt(18)).toBeLessThan(limbAt(4));
  });
});
