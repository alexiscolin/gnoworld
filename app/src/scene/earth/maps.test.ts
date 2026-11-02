import { describe, expect, it } from "vitest";
import { earthWidth, MAP_WIDTH, MOON_WIDTH } from "./maps.ts";

describe("earthWidth", () => {
  it("is the plan's 4096 at High, and half on a Low or touch device", () => {
    expect(MAP_WIDTH).toBe(4096);
    expect(earthWidth(false)).toBe(4096);
    expect(earthWidth(true)).toBe(2048);
  });

  it("keeps the Moon small: a few dozen pixels on screen need no more", () => {
    expect(MOON_WIDTH).toBe(1024);
  });
});
