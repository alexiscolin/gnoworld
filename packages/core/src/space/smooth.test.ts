import { describe, expect, it } from "vitest";
import { clamp01, lerp, smootherstep, smoothstep } from "./smooth.ts";

describe("clamp01", () => {
  it.each([
    [-0.5, 0],
    [0, 0],
    [0.25, 0.25],
    [1, 1],
    [1.5, 1],
  ])("%d is %d", (value, expected) => {
    expect(clamp01(value)).toBe(expected);
  });
});

describe("lerp", () => {
  it("runs from one end to the other", () => {
    expect(lerp(2, 6, 0)).toBe(2);
    expect(lerp(2, 6, 0.25)).toBe(3);
    expect(lerp(2, 6, 1)).toBe(6);
  });
});

describe("smoothstep", () => {
  it.each([
    [-1, 0],
    [0, 0],
    [0.25, 0.15625],
    [0.5, 0.5],
    [0.75, 0.84375],
    [1, 1],
    [2, 1],
  ])("at %d is %d", (value, expected) => {
    expect(smoothstep(0, 1, value)).toBe(expected);
  });

  it("takes its range from its edges", () => {
    expect(smoothstep(2, 4, 3)).toBe(0.5);
  });
});

describe("smootherstep", () => {
  it.each([
    [0, 0],
    [0.25, 0.103515625],
    [0.5, 0.5],
    [0.75, 0.896484375],
    [1, 1],
  ])("at %d is %d", (value, expected) => {
    expect(smootherstep(value)).toBe(expected);
  });

  it("leaves both ends flat: a lattice's lines never show", () => {
    const step = 1e-4;
    expect(smootherstep(step) / step).toBeLessThan(1e-5);
    expect((1 - smootherstep(1 - step)) / step).toBeLessThan(1e-5);
  });
});
