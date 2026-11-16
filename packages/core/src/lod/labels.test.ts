import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { labelName, NAME_MOST, titleOf, type LabelAsk, type Signals } from "./labels.ts";

// The labels of a view (ADR-0002 §1, level of detail): eight at most, the Earth first, the worlds the view draws, then a
// few far ones among the most popular and the new, each from real data; never an address; a count and a badge only from data.
const ADDRESS = "g1um2pwwnx3gn8p3ryfdert8mhpu4u4up49sc9ru";
const OTHER = "g1magld5xlz9u8mv9wl2qe0ccalz7mlrp7prwfn7";
const near = (id: string, extra: Partial<LabelAsk> = {}): LabelAsk => ({ id, kind: "near", ...extra });
const far = (id: string, signals: Signals): LabelAsk => ({ id, kind: "far", signals });
const EARTH: LabelAsk = { id: "earth", kind: "earth" };
// An address anywhere in a text, inside a longer word too.
const holdsAddress = (text: string) => /g1[023456789acdefghjklmnpqrstuvwxyz]{38}/i.test(text);
const named = (name: string) => titleOf(near("gov/dao", { name })) ?? "";

describe("a world's name on its label", () => {
  it("is its last segment, as a person names a place, never the address", () => {
    expect(labelName(`${ADDRESS}/minichess`)).toBe("minichess");
    expect(labelName(`${OTHER}/x/fishbay`)).toBe("fishbay");
    expect(labelName(`${OTHER}/x/daily/streak`)).toBe("streak");
    expect(labelName(`demo/${ADDRESS}`)).toBe("demo");
  });

  it("is its last segment under a namespace that is a name too, and the namespace where it stands alone", () => {
    expect(labelName("gov/dao")).toBe("dao");
    expect(labelName("demo/defi")).toBe("defi");
    expect(labelName("memba")).toBe("memba");
  });

  it("is none where only an address names the world", () => {
    expect(labelName(ADDRESS)).toBeNull();
    expect(labelName(`${ADDRESS}/${OTHER}`)).toBeNull();
  });

  it("drops a segment that holds an address among its words, or inside a longer word", () => {
    expect(labelName(`${OTHER}/board/feed_${ADDRESS}`)).toBe("board");
    expect(labelName(`games/x${ADDRESS}`)).toBe("games");
  });

  it(`is cut at ${String(NAME_MOST)} characters, an ellipsis at its end`, () => {
    const name = labelName(`games/${"a".repeat(40)}`);
    expect(name).toHaveLength(NAME_MOST);
    expect(name?.endsWith("…")).toBe(true);
    expect(labelName(`games/${"b".repeat(NAME_MOST)}`)).toBe("b".repeat(NAME_MOST));
    expect(labelName(`games/${"c".repeat(NAME_MOST + 1)}`)).toBe(`${"c".repeat(NAME_MOST - 1)}…`);
  });

  it("never holds an address, whatever the id", () => {
    const segment = fc.stringMatching(/^[a-z0-9][a-z0-9_-]{0,20}$/);
    const id = fc
      .array(
        fc.oneof(
          segment,
          fc.constant(ADDRESS),
          fc.constant(OTHER),
          segment.map((word) => `${word}_${OTHER}`),
        ),
        { minLength: 1, maxLength: 5 },
      )
      .map((segments) => segments.join("/"));
    fc.assert(
      fc.property(id, (made) => {
        const name = labelName(made);
        if (name === null) return;
        expect(holdsAddress(name)).toBe(false);
        expect(name.length).toBeLessThanOrEqual(NAME_MOST);
      }),
    );
  });
});

describe("a name the data gives", () => {
  it("is taken, unless it holds an address", () => {
    expect(named("GovDAO")).toBe("GovDAO");
    expect(named(ADDRESS)).toBe("dao");
    expect(named(`My ${ADDRESS.toUpperCase()} hub`)).toBe("dao");
  });

  it("is cut as an id's, kept to one line of plain text, and never left blank", () => {
    expect(named("G".repeat(200))).toBe(`${"G".repeat(NAME_MOST - 1)}…`);
    expect(named("")).toBe("dao");
    expect(named("   ")).toBe("dao");
    expect(named("Gov\nDAO\t hub")).toBe("Gov DAO hub");
    expect(named("\u202eOAD voG\u200f")).toBe("OAD voG");
  });

  it("is cleaned as a bubble's text: a family kept whole, a lone half of a pair dropped, a heap of accents dropped", () => {
    expect(named("Club 👨\u200d👩\u200d👧")).toBe("Club 👨\u200d👩\u200d👧");
    expect(named("abc\uD800def")).toBe("abcdef");
    expect(named(`a${"\u0301".repeat(2000)}bc`)).toBe("bc");
  });

  it("refuses an address cut short, split by a hyphen or inside a name, as a whole one", () => {
    const short = ADDRESS.slice(0, 39);
    expect(labelName(`alice/${short}`)).toBe("alice");
    expect(labelName(`alice/${ADDRESS.slice(0, 18)}-${ADDRESS.slice(18)}`)).toBe("alice");
    expect(labelName(`alice/${ADDRESS.slice(0, 30)}`)).toBe("alice");
    expect(named(`Pay ${short}`)).toBe("dao");
    expect(labelName("alice/g1game")).toBe("g1game");
  });

  it("is cut between graphemes, never inside a pair", () => {
    const cut = named(`${"a".repeat(NAME_MOST - 2)}👍🏽👍🏽👍🏽`);
    expect(cut.isWellFormed()).toBe(true);
    expect([...new Intl.Segmenter().segment(cut)]).toHaveLength(NAME_MOST);
    expect(cut.endsWith("👍🏽…")).toBe(true);
  });
});

describe("a world's title", () => {
  it("is the Earth's for the Earth, and an uncharted signal for an unvisited new world, never its path", () => {
    expect(titleOf(EARTH)).toBe("Earth");
    expect(titleOf(far(`${ADDRESS}/fresh`, { uncharted: true, here: 4 }))).toBe("Uncharted signal");
    expect(titleOf(near(ADDRESS, { signals: { uncharted: true } }))).toBe("Uncharted signal");
  });
});
