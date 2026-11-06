import { Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { LIMB_LIGHT } from "../planet/planet.ts";
import { angleAt, behindAt, fadeAt, FAR_ANGLE, limbAt, sideOf } from "./far.ts";

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

// Frame 4's far worlds are a little softer and dimmer than its near ones (7d6): the planet's `faraway`, by the body's distance.
describe("fadeAt", () => {
  it("leaves a body crisp up close, and softens it by degrees to 0.45 afar", () => {
    const fades = [4, 14, 30, 45, 60, 200].map(fadeAt);
    expect(fades[0]).toBe(0);
    expect(fades[1]).toBe(0);
    for (let at = 1; at < fades.length; at += 1) expect(fades[at]).toBeGreaterThanOrEqual(fades[at - 1] ?? Infinity);
    expect(fades[2]).toBeGreaterThan(0);
    expect(fades[4]).toBeCloseTo(0.45, 9);
    expect(fades[5]).toBeCloseTo(0.45, 9);
  });
});

// The design review's second pass (F4468; Alexis's "depth everywhere"): a system's dynamic view drew its far worlds with its near ones'
// black point and colour. The 14:09 mock-up draws its two farthest, behind the star, at 85% and 70% of their light on the screen, which
// the planet's `faraway` gives at 0.425 and 0.85 (measured on gnoswap's view: 68% and 72% at 0.85).
describe("behindAt", () => {
  it("leaves a world before its star crisp, and greys and dims one behind it as the mock-up's far ones", () => {
    const star = 8;
    const fades = [0.5, 1, 1.05, 1.1, 1.2, 1.3, 1.35, 2].map((share) => behindAt(share * star, star));
    expect(fades.slice(0, 3)).toEqual([0, 0, 0]);
    for (let at = 1; at < fades.length; at += 1) expect(fades[at]).toBeGreaterThanOrEqual(fades[at - 1] ?? Infinity);
    expect(fades[3]).toBeGreaterThan(0);
    expect(fades[4]).toBeCloseTo(0.425, 9);
    expect(fades[6]).toBeCloseTo(0.85, 9);
    expect(fades[7]).toBeCloseTo(0.85, 9);
    expect(behindAt(1.2 * 20, 20)).toBeCloseTo(0.425, 9);
    expect(fadeAt(40)).toBeGreaterThan(0);
    expect(behindAt(40, 60)).toBe(fadeAt(40));
  });
});
