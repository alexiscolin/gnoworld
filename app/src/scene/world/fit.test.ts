import { describe, expect, it } from "vitest";
import { fitOf } from "./fit.ts";

// A world's share of its circle (Alexis, 2026-11-02, F4307; ADR-0002 §3, the chief's reading): its use against its universe, on a log scale.
// The universe's busiest fill it, as frame 104's Bubble, 336 px of radius at 1728 by 1080; the quietest stand as frame 22's GovDAO, 172 px;
// while the universe's file carries no counts, the scale's middle, claiming neither; a seed stays a small heart.
const QUIET = 172 / 336;

describe("a world's share of its circle", () => {
  it("fills it for the universe's busiest, as frame 104's Bubble", () => {
    expect(fitOf(1, 1)).toBe(1);
  });

  it("stands the universe's quietest as frame 22's GovDAO against frame 104's Bubble", () => {
    expect(fitOf(1, 0)).toBeCloseTo(QUIET, 12);
  });

  it("stands at the scale's middle while the universe's file carries no counts, claiming neither quiet nor busy", () => {
    expect(fitOf(1, undefined)).toBeCloseTo((1 + QUIET) / 2, 12);
  });

  it("grows with its use, never past its circle nor under the quietest, a use out of range held to the ends", () => {
    const fits = [-1, 0, 0.25, 0.5, 0.75, 1, 2].map((used) => fitOf(1, used));
    for (let at = 1; at < fits.length; at += 1) expect(fits[at]).toBeGreaterThanOrEqual(fits[at - 1] ?? Infinity);
    expect(Math.max(...fits)).toBe(1);
    expect(Math.min(...fits)).toBeCloseTo(QUIET, 12);
  });

  it("keeps a seed a small heart, whatever its universe says: a seed of 0.3 under a third of the quietest", () => {
    expect(fitOf(0.3, 1)).toBeLessThan(fitOf(1, 0) / 3);
    expect(fitOf(0.3, undefined)).toBeLessThan(fitOf(1, 0) / 3);
    expect(fitOf(0.3, 1)).toBeGreaterThan(0);
  });
});
