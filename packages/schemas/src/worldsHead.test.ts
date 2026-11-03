import { describe, expect, it } from "vitest";
import { WORLDS_CAPS, WORLDS_COUNT_MAX_BYTES, WorldsCount } from "./worldsHead.ts";

// The count beside the file (7n2): what the home's hero reads for its number, a few bytes where the file weighs 11 KB gzip, so a phone asks
// nothing of the cosmos before View in space. The job writes it from the file it writes, in the same pass: its head and core's count of it.
describe("WorldsCount", () => {
  const counted = (over: Record<string, unknown> = {}) => ({
    version: 1,
    universe: "onyx",
    updated: "2026-11-01T12:00:00.000Z",
    count: 534,
    ...over,
  });

  it("takes the count the job writes, with the worlds' file's head", () => {
    expect(WorldsCount.parse(counted())).toEqual(counted());
  });

  it("takes the Earth alone, a chain with no world, and the most worlds a file holds with the Earth, and refuses one over", () => {
    expect(WorldsCount.safeParse(counted({ count: 1 })).success).toBe(true);
    expect(WorldsCount.safeParse(counted({ count: WORLDS_CAPS.worlds + 1 })).success).toBe(true);
    expect(WorldsCount.safeParse(counted({ count: WORLDS_CAPS.worlds + 2 })).success).toBe(false);
  });

  it.each([
    ["no world at all, not even the Earth", { count: 0 }],
    ["a count below zero", { count: -1 }],
    ["a count that is not whole", { count: 533.5 }],
    ["a count written as text", { count: "534" }],
    ["a count past the safe integers", { count: 2 ** 53 }],
    ["no count", { count: undefined }],
    ["another version", { version: 2 }],
    ["a universe with markup", { universe: "<b>onyx</b>" }],
    ["a universe in upper case", { universe: "Onyx" }],
    ["a universe of 129 characters, past a Slug", { universe: "a".repeat(129) }],
    ["a time that is no time", { updated: "yesterday" }],
    ["a time of 41 characters, past the file's", { updated: `2026-11-01T12:00:00.${"0".repeat(15)}+14:00` }],
    ["a key it does not know", { worlds: [] }],
  ])("refuses %s", (_, over) => {
    expect(WorldsCount.safeParse(counted(over)).success).toBe(false);
  });

  it("refuses what is not an object", () => {
    for (const value of [null, 534, "534", [534]]) expect(WorldsCount.safeParse(value).success).toBe(false);
  });

  it("holds the longest count it takes inside its byte cap, a cap far under the file's", () => {
    const longest = counted({
      universe: "a".repeat(WORLDS_CAPS.name),
      updated: "2026-11-01T12:00:00.000000000+14:00",
      count: WORLDS_CAPS.worlds + 1,
    });
    expect(WorldsCount.safeParse(longest).success).toBe(true);
    expect(`${JSON.stringify(longest)}\n`.length).toBeLessThanOrEqual(WORLDS_COUNT_MAX_BYTES);
    expect(WORLDS_COUNT_MAX_BYTES).toBe(1024);
  });
});
