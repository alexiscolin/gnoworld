import { describe, expect, it } from "vitest";
import { glideAt, zoomPath, zoomSeconds, type ZoomStep } from "./zoomPath.ts";

// The flights of the demo Alexis validated: from the universe to a planet, between systems, between planets far apart, and back up.
const TRIPS = [
  ["the universe to a planet", 700, 6200, 6],
  ["the universe to a far system", 2400, 6200, 140],
  ["a system to its planet", 15, 104, 6],
  ["a planet to its neighbour", 6, 6, 5],
  ["a planet to one far away", 1500, 6, 6],
  ["a system to the next", 400, 120, 110],
  ["a planet up to its system", 15, 6, 104],
  ["a zoom alone", 0, 100, 6],
] as const;

const walk = (apart: number, from: number, to: number) => {
  const path = zoomPath(apart, { from, to });
  const step: ZoomStep = { along: 0, width: 0 };
  return Array.from({ length: 201 }, (_, i) => {
    glideAt(path, i / 200, step);
    return { ...step, off: ((1 - step.along) * apart) / step.width };
  });
};

describe("the dive's path", () => {
  it.each(TRIPS)("from %s, it starts where the camera is and ends where it is asked", (_, ...trip) => {
    const [, from, to] = trip;
    const steps = walk(...trip);
    expect(steps[0]?.along).toBe(0);
    expect(steps[0]?.width).toBeCloseTo(from, 6);
    expect(steps.at(-1)?.along).toBe(1);
    expect(steps.at(-1)?.width).toBe(to);
  });

  it.each(TRIPS)("from %s, it goes straight on and never back", (_, ...trip) => {
    const steps = walk(...trip);
    for (let i = 1; i < steps.length; i++) expect(steps[i]?.along).toBeGreaterThanOrEqual(steps[i - 1]?.along ?? 0);
  });

  it.each(TRIPS)("from %s, what it goes to only ever comes nearer the screen's middle", (_, ...trip) => {
    const steps = walk(...trip);
    for (let i = 1; i < steps.length; i++) expect(steps[i]?.off).toBeLessThanOrEqual((steps[i - 1]?.off ?? 0) + 1e-9);
  });

  it("rises only when the two views are far apart for their sizes", () => {
    const peak = (apart: number, from: number, to: number) =>
      Math.max(...walk(apart, from, to).map((step) => step.width));
    expect(peak(15, 104, 6)).toBeCloseTo(104, 6);
    expect(peak(1500, 6, 6)).toBeGreaterThan(1000);
  });

  it("takes 1.3 to 3.4 seconds, longer for a longer path", () => {
    expect(zoomSeconds(0)).toBe(1.3);
    expect(zoomSeconds(2)).toBeCloseTo(1.99, 6);
    expect(zoomSeconds(9)).toBe(3.4);
  });
});
