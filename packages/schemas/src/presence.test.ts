import { describe, expect, it } from "vitest";
import { Presence, PRESENCE_ANSWER_MAX } from "./presence.ts";

// GET /api/presence (slice 7, 7h): who is here in each world a guest may see, counts alone, read by the cosmos's labels.
const world = { world: "earth", here: 184, perHour: 130.4, rise: 0.21 };

describe("Presence", () => {
  it("is each world's people here, its messages an hour and its rise, or no rise", () => {
    const answer = { worlds: [world, { world: "bubble", here: 0, perHour: 0, rise: null }] };
    expect(Presence.parse(answer)).toEqual(answer);
  });

  it(`takes ${String(PRESENCE_ANSWER_MAX)} worlds, each named once`, () => {
    const worlds = Array.from({ length: PRESENCE_ANSWER_MAX }, (_, at) => ({ ...world, world: `w${String(at)}` }));
    expect(Presence.safeParse({ worlds }).success).toBe(true);
  });

  it.each([
    ["a count of people that is no whole number", { worlds: [{ ...world, here: 1.5 }] }],
    ["a negative count", { worlds: [{ ...world, here: -1 }] }],
    ["a negative pace", { worlds: [{ ...world, perHour: -1 }] }],
    ["a pace past any room's", { worlds: [{ ...world, perHour: 1e9 }] }],
    ["a negative rise", { worlds: [{ ...world, rise: -0.5 }] }],
    ["more people than any world holds", { worlds: [{ ...world, here: 1_000_001 }] }],
    ["a rise past any count", { worlds: [{ ...world, rise: 1_000_001 }] }],
    ["a slug past 64 characters", { worlds: [{ ...world, world: "w".repeat(65) }] }],
    ["one world twice", { worlds: [world, world] }],
    ["a key beside the list", { worlds: [world], at: "now" }],
    ["a world no slug names", { worlds: [{ ...world, world: "Earth!" }] }],
    ["a name beside the counts", { worlds: [{ ...world, who: ["ada"] }] }],
    ["more worlds than any server keeps", { worlds: Array.from({ length: PRESENCE_ANSWER_MAX + 1 }, () => world) }],
    ["no list", {}],
  ])("refuses %s", (_, value) => {
    expect(Presence.safeParse(value).success).toBe(false);
  });
});
