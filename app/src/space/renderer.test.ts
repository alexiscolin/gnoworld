import { describe, expect, it } from "vitest";
import { beforeGrade, graded } from "./renderer.ts";

describe("beforeGrade", () => {
  it.each([
    ["the plate's fill", [0.118, 0.13, 0.176]],
    ["a mid grey", [0.5, 0.5, 0.5]],
    ["a warm light", [0.9, 0.78, 0.5]],
  ] as const)("gives %s back on screen once graded", (_, screen) => {
    const shown = graded(beforeGrade(screen));
    for (const [at, value] of shown.entries()) expect(value).toBeCloseTo(screen[at] ?? Number.NaN, 3);
  });
});
