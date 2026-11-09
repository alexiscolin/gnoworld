import { describe, expect, it } from "vitest";
import { clampWidth } from "./resize.ts";

describe("clampWidth", () => {
  it("holds a column between its bounds and under what the box leaves it, the minimum winning in a box too narrow", () => {
    expect(clampWidth("rooms", 50, 999)).toBe(180);
    expect(clampWidth("rooms", 999, 999)).toBe(360);
    expect(clampWidth("info", 400.4, 999)).toBe(400);
    expect(clampWidth("info", 500, 300)).toBe(300);
    expect(clampWidth("info", 500, 100)).toBe(280);
  });
});
