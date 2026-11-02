import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { chooseLabels, FAR_MOST, LABELS_MOST, labelName, NAME_MOST, type LabelAsk, type Signals } from "./labels.ts";

// The labels of a view (ADR-0002 §1, level of detail; plan §9, question 11): eight at most, the Earth first, the worlds the view draws, then a
// few far ones among the most popular and the new, each from real data; never an address; a count and a badge only from data.
const ADDRESS = "g1um2pwwnx3gn8p3ryfdert8mhpu4u4up49sc9ru";
const OTHER = "g1magld5xlz9u8mv9wl2qe0ccalz7mlrp7prwfn7";
const near = (id: string, extra: Partial<LabelAsk> = {}): LabelAsk => ({ id, kind: "near", ...extra });
const far = (id: string, signals: Signals): LabelAsk => ({ id, kind: "far", signals });
const EARTH: LabelAsk = { id: "earth", kind: "earth" };
const ids = (asks: readonly LabelAsk[]) => chooseLabels(asks).map(({ id }) => id);
// An address anywhere in a text, inside a longer word too.
const holdsAddress = (text: string) => /g1[023456789acdefghjklmnpqrstuvwxyz]{38}/i.test(text);
const titleOf = (name: string) => chooseLabels([near("gov/dao", { name })])[0]?.title ?? "";

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
    expect(titleOf("GovDAO")).toBe("GovDAO");
    expect(titleOf(ADDRESS)).toBe("dao");
    expect(titleOf(`My ${ADDRESS.toUpperCase()} hub`)).toBe("dao");
    expect(chooseLabels([EARTH])[0]?.title).toBe("Earth");
  });

  it("is cut as an id's, kept to one line of plain text, and never left blank", () => {
    expect(titleOf("G".repeat(200))).toBe(`${"G".repeat(NAME_MOST - 1)}…`);
    expect(titleOf("")).toBe("dao");
    expect(titleOf("   ")).toBe("dao");
    expect(titleOf("Gov\nDAO\t hub")).toBe("Gov DAO hub");
    expect(titleOf("‮OAD voG‏")).toBe("OAD voG");
  });

  it("is cut between graphemes, never inside a pair", () => {
    const cut = titleOf(`${"a".repeat(NAME_MOST - 2)}👍🏽👍🏽👍🏽`);
    expect(cut.isWellFormed()).toBe(true);
    expect([...new Intl.Segmenter().segment(cut)]).toHaveLength(NAME_MOST);
    expect(cut.endsWith("👍🏽…")).toBe(true);
  });
});

describe("which worlds a view labels", () => {
  it(`labels ${String(LABELS_MOST)} at most, the Earth first, then what the view draws, in its order`, () => {
    const bodies = Array.from({ length: 12 }, (_, at) => near(`n${String(at)}/world`));
    const chosen = ids([...bodies, EARTH]);
    expect(chosen).toHaveLength(LABELS_MOST);
    expect(chosen[0]).toBe("earth");
    expect(chosen.slice(1)).toEqual(bodies.slice(0, LABELS_MOST - 1).map(({ id }) => id));
  });

  it("labels a world the view draws with no data, its count and badge empty: no data, no badge", () => {
    const [label] = chooseLabels([near(`${ADDRESS}/minichess`)]);
    expect(label).toEqual({
      id: `${ADDRESS}/minichess`,
      kind: "near",
      title: "minichess",
      count: "",
      badge: "",
      uncharted: false,
    });
  });

  it("never labels a far world it knows nothing of", () => {
    expect(ids([EARTH, far("quiet/one", {}), far("quiet/two", { here: 0, use: 0 })])).toEqual(["earth"]);
  });

  it("labels a far world the file finds used", () => {
    expect(ids([EARTH, far("none/known", {}), far("used/once", { use: 5 })])).toEqual(["earth", "used/once"]);
  });

  it("keeps its far slots for worlds it can name: worlds only an address names never take them", () => {
    const unnamed = [OTHER, ADDRESS, `${ADDRESS}/${OTHER}`].map((id) => far(id, { here: 50 }));
    expect(ids([EARTH, ...unnamed, far("alice/dao", { here: 5 })])).toEqual(["earth", "alice/dao"]);
  });

  it("labels no world only an address names, near or far", () => {
    expect(ids([EARTH, near(ADDRESS), far(OTHER, { here: 9 })])).toEqual(["earth"]);
  });

  it(`labels ${String(FAR_MOST)} far ones at most: the most popular, and a new one`, () => {
    const popular = ["a/one", "b/two", "c/three", "d/four"].map((id, at) => far(id, { here: 40 - at }));
    const fresh = far("e/five", { uncharted: true });
    expect(ids([EARTH, ...popular, fresh])).toEqual(["earth", "a/one", "b/two", "e/five"]);
    expect(ids([EARTH, ...popular])).toEqual(["earth", "a/one", "b/two", "c/three"]);
  });

  it("gives its one new slot to the busiest new world when popular ones fill the rest, and more to new ones alone", () => {
    const popular = ["a/one", "b/two", "c/three"].map((id, at) => far(id, { here: 40 - at }));
    const fresh = [far("n/quiet", { uncharted: true }), far("n/busy", { uncharted: true, here: 3 })];
    expect(ids([EARTH, ...popular, ...fresh])).toEqual(["earth", "a/one", "b/two", "n/busy"]);
    expect(ids([EARTH, ...fresh])).toEqual(["earth", "n/busy", "n/quiet"]);
  });

  it("ranks far worlds by their rise first, then the people here, then their use", () => {
    const chosen = ids([
      EARTH,
      far("used/most", { use: 900 }),
      far("busy/most", { here: 300 }),
      far("rising/small", { here: 4, rise: 3 }),
      far("rising/more", { here: 6, rise: 5 }),
    ]);
    expect(chosen).toEqual(["earth", "rising/more", "rising/small", "busy/most"]);
  });

  it("chooses the same far worlds in the same order whatever order they come in, ties broken by id", () => {
    const asks = [
      far("tie/b", { here: 5 }),
      far("tie/a", { here: 5 }),
      far("rise/b", { rise: 2 }),
      far("rise/a", { rise: 2 }),
      far("use/a", { use: 3 }),
      far("new/z", { uncharted: true }),
      far("new/y", { uncharted: true }),
    ];
    const once = ids([EARTH, ...asks]);
    expect(once).toEqual(["earth", "rise/a", "rise/b", "new/y"]);
    fc.assert(
      fc.property(fc.shuffledSubarray(asks, { minLength: asks.length, maxLength: asks.length }), (shuffled) => {
        expect(ids([EARTH, ...shuffled])).toEqual(once);
      }),
    );
  });

  it("lets a small world rise above busier ones, its own past its measure", () => {
    const busy = ["big/one", "big/two", "big/three"].map((id, at) => far(id, { here: 300 - at * 50 }));
    const chosen = ids([EARTH, ...busy, far("small/world", { here: 5, rise: 4 })]);
    expect(chosen).toContain("small/world");
    expect(chosen).not.toContain("big/three");
  });

  it("keeps what the view draws before any far world, and labels a world once", () => {
    const bodies = Array.from({ length: 7 }, (_, at) => near(`n${String(at)}/world`));
    expect(ids([EARTH, ...bodies, far("busy/far", { here: 900 })])).not.toContain("busy/far");
    expect(ids([EARTH, near("same/world"), far("same/world", { here: 3 })])).toEqual(["earth", "same/world"]);
  });
});

describe("what a label says", () => {
  it("counts the people here and gives the heat badge, each from data", () => {
    const [label] = chooseLabels([{ ...EARTH, signals: { here: 184, perHour: 130.4, rise: 0.214 } }]);
    expect(label?.count).toBe("184 here");
    expect(label?.badge).toBe("▲ 21% · 130/h");
  });

  it("shows a pace without a rise, and a rise without a pace", () => {
    expect(chooseLabels([near("a/b", { signals: { perHour: 12 } })])[0]?.badge).toBe("12/h");
    expect(chooseLabels([near("a/b", { signals: { rise: 1.5 } })])[0]?.badge).toBe("▲ 150%");
  });

  it("rounds a pace from one message an hour, and counts one person here", () => {
    const badge = (perHour: number) => chooseLabels([near("a/b", { signals: { perHour } })])[0]?.badge;
    expect([badge(0.99), badge(1), badge(1.4), badge(1.6)]).toEqual(["", "1/h", "1/h", "2/h"]);
    expect(chooseLabels([near("a/b", { signals: { here: 1 } })])[0]?.count).toBe("1 here");
  });

  it("says nothing of an empty world nor of under one message an hour", () => {
    const [label] = chooseLabels([near("a/b", { signals: { here: 0, perHour: 0.4 } })]);
    expect(label?.count).toBe("");
    expect(label?.badge).toBe("");
  });

  it("names an unvisited new world an uncharted signal, never by its path, and asks to go and look", () => {
    const [counted] = chooseLabels([far(`${ADDRESS}/fresh`, { uncharted: true, here: 4 })]);
    expect(counted).toMatchObject({ title: "Uncharted signal", count: "4 here · go and look", uncharted: true });
    const [alone] = chooseLabels([near(ADDRESS, { signals: { uncharted: true } })]);
    expect(alone).toMatchObject({ title: "Uncharted signal", count: "go and look", uncharted: true });
  });

  it("never says an address, whatever the asks", () => {
    const ask = fc.record({
      id: fc.constantFrom(ADDRESS, `${ADDRESS}/a`, `${OTHER}/b_${ADDRESS}`, "gov/dao"),
      kind: fc.constantFrom("near" as const, "far" as const),
      name: fc.option(fc.constantFrom(ADDRESS, "Bubble", `x${OTHER}`, `${ADDRESS} hub`), { nil: undefined }),
      signals: fc.record({
        here: fc.nat(500),
        uncharted: fc.boolean(),
        rise: fc.double({ min: 0.3, max: 9, noNaN: true }),
      }),
    });
    fc.assert(
      fc.property(fc.array(ask, { maxLength: 12 }), (asks) => {
        const chosen = chooseLabels(asks.map(({ name, ...rest }) => (name === undefined ? rest : { ...rest, name })));
        expect(chosen.length).toBeLessThanOrEqual(LABELS_MOST);
        for (const { title, count, badge } of chosen) expect(holdsAddress(`${title} ${count} ${badge}`)).toBe(false);
      }),
    );
  });
});
