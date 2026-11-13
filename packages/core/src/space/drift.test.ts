import { describe, expect, it } from "vitest";
import { orbitTime } from "./drift.ts";

// Alexis's decision through the chief, 2026-11-02: the worlds turn at a fifth of their spin.
describe("orbitTime", () => {
  it("is the clock every world turns by, bodies and points alike: a fifth of the seconds", () => {
    expect(orbitTime(10)).toBeCloseTo(2, 12);
    expect(orbitTime(0)).toBe(0);
  });
});
