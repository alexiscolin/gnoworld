import { describe, expect, it } from "vitest";
import { CONTINENTS_SEA, ofContinents, readsMinorMap } from "./continents.ts";

// F4586 (7b9): one rule for whether a world's program reads its minor map, which the program, the kit's maps and the rail's portraits all
// ask: a minor that shows (past 0.002), on a ground with no bands, never on a world of continents, whose minor is its bare ground.
describe("readsMinorMap", () => {
  const ground = { sea: 0, bands: 0 };
  it.each([
    ["a minor that shows on a bare ground", { minorShare: 0.01, surface: ground }, true],
    ["a minor too small to show", { minorShare: 0.002, surface: ground }, false],
    ["a minor just past what shows", { minorShare: 0.0021, surface: ground }, true],
    ["a banded world", { minorShare: 0.5, surface: { sea: 0, bands: 0.2 } }, false],
    ["a world of continents", { minorShare: 0.5, surface: { sea: 0.4, bands: 0 } }, false],
    ["an ocean past the continents' sea", { minorShare: 0.5, surface: { sea: CONTINENTS_SEA, bands: 0 } }, true],
  ])("%s", (_, world, reads) => {
    expect(readsMinorMap(world)).toBe(reads);
  });

  it("calls a world of continents one with some sea and less than the continents' share", () => {
    expect([0, 0.01, 0.79, CONTINENTS_SEA, 1].map((sea) => ofContinents({ sea }))).toEqual([
      false,
      true,
      true,
      false,
      false,
    ]);
  });
});
