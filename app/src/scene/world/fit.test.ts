import { SIZE_BUSIEST } from "@gnoworld/core";
import { describe, expect, it } from "vitest";
import { fitOf } from "./fit.ts";

// A world's share of its circle by its size, read on the frames (Alexis, 2026-11-02, F4307): the busiest fills it, as frame 104's
// Bubble, 336 px of radius at 1728 by 1080; one at rest is frame 22's quieter GovDAO, 172 px; a seed is a small heart under it.
describe("a world's share of its circle", () => {
  it("fills it at the busiest, as frame 104's Bubble", () => {
    expect(fitOf(SIZE_BUSIEST)).toBe(1);
  });

  it("stands at rest as frame 22's GovDAO against frame 104's Bubble, about half", () => {
    expect(fitOf(1)).toBeCloseTo(172 / 336, 2);
  });

  it("grows with its size from rest to the busiest, and never past its circle", () => {
    const sizes = [0.22, 0.3, 0.6, 1, 1.15, 1.3, 1.45, SIZE_BUSIEST, 2, 10];
    const fits = sizes.map(fitOf);
    for (let at = 1; at < fits.length; at += 1) expect(fits[at]).toBeGreaterThanOrEqual(fits[at - 1] ?? Infinity);
    expect(Math.max(...fits)).toBe(1);
  });

  it("keeps a seed a small heart: a seed of 0.3 under a third of a world at rest", () => {
    expect(fitOf(0.3)).toBeLessThan(fitOf(1) / 3);
    expect(fitOf(0.3)).toBeGreaterThan(0);
  });
});
