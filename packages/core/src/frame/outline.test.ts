import { describe, expect, it } from "vitest";
import { outlineOf } from "./outline.ts";

const SCREEN = [1728, 1080] as const;
const FOCAL = 1000;

describe("a ball's outline on the screen", () => {
  it("is a circle about the middle on the view's axis, a little wider than its radius over its depth", () => {
    const { left, right, top, bottom } = outlineOf({ across: 0, up: 0, depth: 10, radius: 2 }, FOCAL, SCREEN);
    const half = (FOCAL * 2) / Math.sqrt(10 ** 2 - 2 ** 2);
    [left, right, top, bottom].forEach((edge, at) => {
      expect(edge).toBeCloseTo([864 - half, 864 + half, 540 - half, 540 + half][at] ?? NaN, 9);
    });
  });

  // The tangent through the eye at 45 degrees off the axis: the far edge leans out more than the near one.
  it("stretches outward off the view's axis: its outer edge farther from its centre than its inner one", () => {
    const { left, right, top, bottom } = outlineOf({ across: 10, up: 0, depth: 10, radius: 2 }, FOCAL, SCREEN);
    const centre = 864 + FOCAL;
    expect(right - centre).toBeGreaterThan(centre - left);
    expect(bottom - top).toBeLessThan(right - left);
    expect(right).toBeCloseTo(864 + FOCAL * ((100 + 2 * Math.sqrt(100 + 96)) / 96), 9);
  });

  it("covers the whole screen when the eye stands in it", () => {
    const { left, right, top, bottom } = outlineOf({ across: 0, up: 0, depth: 1, radius: 2 }, FOCAL, SCREEN);
    expect([left, right, top, bottom]).toEqual([-Infinity, Infinity, -Infinity, Infinity]);
  });
});
