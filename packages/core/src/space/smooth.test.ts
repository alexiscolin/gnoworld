import { describe, expect, it } from "vitest";
import { clamp01, smoothstep } from "./smooth.ts";

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
