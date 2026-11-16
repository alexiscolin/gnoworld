import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { framedPlanet, wordsEnd } from "./planetFrame.ts";

// The plate's words end 230 px short of its width (the video's 578 at its 808), and the plate narrows with the window (--plate-w).
const plateW = (width: number) => Math.min(808, Math.max(560, 0.4676 * width));
const SPACE_S = 16;
const GLOW = 1.18;

describe("the plate's words end", () => {
  it("follow the plate's width, 578 px at the video's 808", () => {
    expect(wordsEnd(808)).toBe(578);
    expect(wordsEnd(600)).toBe(370);
  });
});

describe("a framed planet", () => {
  it("keeps the video's look at 1728 by 1080", () => {
    const { x, middle, radius } = framedPlanet({ wordsEnd: wordsEnd(plateW(1728)), width: 1728, height: 1080 });
    expect(x).toBeCloseTo(0.76 * 1728, 5);
    expect(middle).toBeCloseTo(0.68 * 1080, 5);
    expect(radius).toBeCloseTo((0.76 * 1728 - 578 - SPACE_S) / GLOW, 5);
  });

  it.each([
    [1728, 1080],
    [1491, 920],
    [1280, 800],
    [900, 700],
  ])("keeps its glow right of the plate's words at %i by %i, a step clear", (width, height) => {
    const end = wordsEnd(plateW(width));
    const { x, radius } = framedPlanet({ wordsEnd: end, width, height });
    expect(radius).toBeGreaterThan(0);
    expect(x - GLOW * radius).toBeGreaterThanOrEqual(end + SPACE_S - 1e-6);
  });

  it("keeps clear of a plate whose words run further than the plate's own measure", () => {
    const { x, radius } = framedPlanet({ wordsEnd: 900, width: 1491, height: 920 });
    expect(x - GLOW * radius).toBeGreaterThanOrEqual(900 + SPACE_S - 1e-6);
  });
});

describe("the globe's stylesheet", () => {
  // The node project turns a .module.css into its class map, so the text is read from the file.
  const css = readFileSync(new URL("../../routes/globe.module.css", import.meta.url), "utf8");
  it("derives the planet's start from the plate's width, no fixed 578 px", () => {
    expect(css).not.toMatch(/--_start:\s*578px/);
    expect(css).toMatch(/--_start:[^;]*--plate-w/);
  });
});
