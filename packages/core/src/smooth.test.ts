import { describe, expect, it } from "vitest";
import { damp } from "./smooth.ts";

describe("damp", () => {
  it("is the share of the way an ease with time constant tau goes in dt seconds, the same numbers as 1 - exp(-dt/tau)", () => {
    for (const [dt, tau] of [
      [0.016, 0.7],
      [0.05, 0.25],
      [0, 1],
      [2, 0.1],
    ] as const)
      expect(damp(dt, tau)).toBe(1 - Math.exp(-dt / tau));
  });

  it("matches a delta in ms divided by 1000 as the sites wrote it", () => {
    expect(damp(16.7 / 1000, 0.3)).toBe(1 - Math.exp(-16.7 / 1000 / 0.3));
  });
});
