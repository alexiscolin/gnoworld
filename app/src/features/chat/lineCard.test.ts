import { describe, expect, it } from "vitest";
import { cardOf, lineCard, type LineCardFacts } from "./lineCard.ts";

const KEY = "a".repeat(64);
const FACTS: LineCardFacts = {
  key: KEY,
  verdict: "checked",
  room: "#bubble",
  player: false,
  capture: false,
  mine: false,
  may: false,
};

// Which card a line gets, and who may remove it (link-previews L4, D13919): one card a line, a player or a capture first, only once checked.
describe("a line's card", () => {
  it("is its key, once its event came and the line is checked", () => {
    expect(lineCard(FACTS)).toEqual({ key: KEY, removable: false });
  });

  it.each([
    ["no event came", { key: undefined }],
    ["the verdict has not come", { verdict: undefined }],
    ["the line is hidden", { verdict: "hidden" }],
    ["it is a direct message's line (no room)", { room: undefined }],
    ["the line has a player", { player: true }],
    ["the line has a realm's capture", { capture: true }],
  ] as const)("is none when %s", (_what, change) => {
    expect(lineCard({ ...FACTS, ...change })).toBeUndefined();
  });

  it("can be removed by the line's author, and by one who may pin in the room, and by no one else", () => {
    expect(lineCard({ ...FACTS, mine: true })?.removable).toBe(true);
    expect(lineCard({ ...FACTS, may: true })?.removable).toBe(true);
    expect(lineCard(FACTS)?.removable).toBe(false);
  });
});

describe("what a line's card needs of its list", () => {
  const keeping = { cards: { m2: KEY }, moderate: undefined };
  const base = { room: "#bubble", newest: new Map<string, string>(), keeping, saving: false };

  it("is none for a direct message's line, which has no room", () => {
    expect(cardOf({ ...base, room: undefined }, "m2")).toBeUndefined();
  });

  it("takes the card of the line's id, or of its newest edit when it was corrected", () => {
    expect(cardOf(base, "m2")).toEqual({ room: "#bubble", msgid: "m2", key: KEY, may: false, saving: false });
    expect(cardOf({ ...base, newest: new Map([["m1", "m2"]]) }, "m1")).toMatchObject({ msgid: "m2", key: KEY });
    expect(cardOf(base, "m9")).toMatchObject({ msgid: "m9", key: undefined });
  });

  it("says whether the reader may pin (the moderate right) and whether they save data", () => {
    const moderator = {
      ...keeping,
      moderate: { hide: () => Promise.reject(new Error("no")), mute: () => Promise.reject(new Error("no")) },
    };
    expect(cardOf({ ...base, keeping: moderator, saving: true }, "m2")).toMatchObject({ may: true, saving: true });
    expect(cardOf({ ...base, keeping: undefined }, "m2")).toMatchObject({ key: undefined, may: false });
  });
});
