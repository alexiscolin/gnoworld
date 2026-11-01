import { describe, expect, it } from "vitest";
import { tilingNoise } from "./noise.ts";

const SIDE = 16;

describe("tilingNoise", () => {
  it("fills a cube", () => {
    expect(tilingNoise(SIDE)).toHaveLength(SIDE ** 3);
  });

  it("is the same cube each time", () => {
    expect(tilingNoise(SIDE)).toEqual(tilingNoise(SIDE));
  });

  // Worked out apart from this code, in Python's integers and doubles, each level rounded as a 32-bit float would.
  it("holds its levels", () => {
    expect([...tilingNoise(8).slice(0, 16)]).toEqual([
      128, 136, 128, 139, 128, 140, 128, 95, 188, 167, 131, 111, 121, 151, 128, 139,
    ]);
    const cube = tilingNoise(16);
    expect([...cube.slice(0, 12)]).toEqual([128, 143, 136, 125, 128, 129, 139, 159, 128, 130, 140, 121]);
    expect(cube.reduce((sum, level) => sum + level, 0)).toBe(522268);
  });

  // At 24 a period of 16 would leave under two voxels a wave: a magnified read would show the voxels, in straight lines.
  it("stops at two voxels a wave", () => {
    const cube = tilingNoise(24);
    expect([...cube.slice(0, 8)]).toEqual([128, 140, 143, 136, 128, 124, 128, 128]);
    expect(cube.reduce((sum, level) => sum + level, 0)).toBe(1762618);
  });

  it("uses most of its range, around a middle grey", () => {
    const noise = tilingNoise(SIDE);
    const levels = new Set(noise);
    expect(levels.size).toBeGreaterThan(60);
    const mean = noise.reduce((sum, level) => sum + level, 0) / noise.length;
    expect(Math.abs(mean - 127.5)).toBeLessThan(20);
  });

  it("is a cloud, not a hiss: neighbours are far closer than strangers", () => {
    const noise = tilingNoise(32);
    let neighbours = 0;
    let strangers = 0;
    for (let at = 0; at + 1 < noise.length; at += 1) {
      neighbours += Math.abs((noise[at] ?? NaN) - (noise[at + 1] ?? NaN));
      strangers += Math.abs((noise[at] ?? NaN) - (noise[(at * 7919 + 13) % noise.length] ?? NaN));
    }
    expect(neighbours).toBeLessThan(strangers / 2);
  });

  // A jump at the wrap would draw the lattice across the sky: opposite faces are as close as any two neighbours.
  it.each([
    ["x", 1],
    ["y", SIDE],
    ["z", SIDE * SIDE],
  ])("tiles along %s with no seam", (_, stride) => {
    const noise = tilingNoise(SIDE);
    let seam = 0;
    let inside = 0;
    for (let at = 0; at < noise.length; at += 1) {
      const onAxis = Math.floor(at / stride) % SIDE;
      const next = onAxis === SIDE - 1 ? at - stride * (SIDE - 1) : at + stride;
      const step = Math.abs((noise[at] ?? NaN) - (noise[next] ?? NaN));
      if (onAxis === SIDE - 1) seam += step;
      else inside += step;
    }
    expect(seam).toBeLessThanOrEqual((inside / (SIDE - 1)) * 1.5);
  });
});
