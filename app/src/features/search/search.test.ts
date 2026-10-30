import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { FIXTURE } from "../../placesFixture.ts";
import { siteOf } from "../../places.ts";
import { opensPalette, searchItemsOf, searchPlaces, type SearchItem } from "./search.ts";

// Slice 5's 5n: the palette's search, over the places the page holds already (no request, docs/plans/slice-5.md §1).
const ITEMS: SearchItem[] = [
  { name: "Bubble", kind: "world", universe: "onyx", path: "/w/bubble" },
  { name: "Arcade", kind: "world", universe: "onyx", path: "/w/arcade" },
  { name: "Tokens", kind: "ecosystem", universe: "onyx", path: "/e/tokens" },
  { name: "Earth", kind: "earth", universe: "onyx", path: "/earth" },
  { name: "Onyx", kind: "cosmos", universe: "onyx", path: "/" },
];
const names = (found: ReturnType<typeof searchPlaces>) => found.flatMap((g) => g.items.map((i) => i.name));

describe("searchPlaces", () => {
  it("finds a name by any part of it, whatever the case", () => {
    expect(names(searchPlaces(ITEMS, "ubb"))).toEqual(["Bubble"]);
    expect(names(searchPlaces(ITEMS, "ARC"))).toEqual(["Arcade"]);
  });

  it("groups by kind, each group with its count, in the order cosmos, earth, world, ecosystem", () => {
    const found = searchPlaces(ITEMS, "");
    expect(found.map((g) => [g.kind, g.count])).toEqual([
      ["cosmos", 1],
      ["earth", 1],
      ["world", 2],
      ["ecosystem", 1],
    ]);
  });

  it("leaves out a kind with no match, and says no group at all when nothing matches", () => {
    expect(searchPlaces(ITEMS, "tok").map((g) => g.kind)).toEqual(["ecosystem"]);
    expect(searchPlaces(ITEMS, "zzzz")).toEqual([]);
  });

  it("puts the names that start with the query before the names that only hold it", () => {
    const items: SearchItem[] = [
      { name: "The Bubble", kind: "world", universe: "onyx", path: "/w/the-bubble" },
      { name: "Bubble", kind: "world", universe: "onyx", path: "/w/bubble" },
    ];
    expect(names(searchPlaces(items, "bub"))).toEqual(["Bubble", "The Bubble"]);
  });

  it("reads the query's spaces at its ends as nothing, and its inside ones as they are", () => {
    expect(names(searchPlaces(ITEMS, "  bubble "))).toEqual(["Bubble"]);
    const spaced: SearchItem[] = [{ name: "Token station", kind: "world", universe: "onyx", path: "/w/token-station" }];
    expect(names(searchPlaces(spaced, "token station"))).toEqual(["Token station"]);
    expect(searchPlaces(spaced, "tokenstation")).toEqual([]);
  });

  it("reads a query of spaces alone as the empty query", () => {
    expect(searchPlaces(ITEMS, "   ")).toEqual(searchPlaces(ITEMS, ""));
  });

  it("finds nothing, and throws nothing, for a query of 10,000 characters", () => {
    expect(searchPlaces(ITEMS, "a".repeat(10_000))).toEqual([]);
  });

  it("folds the case of letters beyond ASCII", () => {
    const items: SearchItem[] = [{ name: "École", kind: "world", universe: "onyx", path: "/w/ecole" }];
    expect(names(searchPlaces(items, "éCOLE"))).toEqual(["École"]);
  });

  it("treats a regex's marks as text: a query is never a pattern", () => {
    expect(searchPlaces(ITEMS, ".*")).toEqual([]);
    expect(searchPlaces(ITEMS, "(")).toEqual([]);
  });

  it("keeps each item's path, which the palette goes to", () => {
    expect(searchPlaces(ITEMS, "tokens")[0]?.items[0]?.path).toBe("/e/tokens");
  });

  // The property of the plan's §4: whatever the names, a place is found by its own name.
  it("finds every place by its own name, in its kind's group", () => {
    const kind = fc.constantFrom<SearchItem["kind"]>("cosmos", "earth", "world", "ecosystem");
    const item = fc.record({
      // Letters beyond ASCII, a dotted capital I and a ligature's capital among them: a case fold of each side alike.
      name: fc
        .string({
          unit: fc.constantFrom("a", "b", "A", "B", " ", "é", "É", "ü", "Ü", "ñ", "İ", "ß", "ǅ", "-"),
          minLength: 1,
          maxLength: 20,
        })
        .filter((s) => s.trim() !== ""),
      kind,
      universe: fc.constantFrom("onyx", "gnoland"),
      path: fc.webPath(),
    });
    fc.assert(
      fc.property(fc.array(item, { minLength: 1, maxLength: 30 }), (items) => {
        for (const each of items) {
          const group = searchPlaces(items, each.name).find((g) => g.kind === each.kind);
          expect(group?.items.some((i) => i.name === each.name && i.path === each.path)).toBe(true);
        }
      }),
    );
  });

  it("scales with the list, not with its square: 16 times the places cost far less than 64 times the time", () => {
    const universe = (count: number): SearchItem[] =>
      Array.from({ length: count }, (_, n) => ({
        name: `World number ${String(n)}`,
        kind: (["world", "ecosystem"] as const)[n % 2] ?? "world",
        universe: "onyx",
        path: `/w/world-${String(n)}`,
      }));
    // The least of several runs, after a warm-up: a busy machine only makes a run slower.
    const least = (items: SearchItem[], query: string) => {
      searchPlaces(items, query);
      let best = Infinity;
      for (let run = 0; run < 7; run++) {
        const start = performance.now();
        searchPlaces(items, query);
        best = Math.min(best, performance.now() - start);
      }
      return best;
    };
    const small = universe(5000);
    const large = universe(80_000);
    for (const query of ["", "number 1", "zzz"])
      expect(least(large, query) / Math.max(least(small, query), 0.01)).toBeLessThan(64);
  });

  it("counts every item of the list in the empty query's groups", () => {
    fc.assert(
      fc.property(fc.array(fc.constantFrom(...ITEMS), { maxLength: 20 }), (items) => {
        const found = searchPlaces(items, "");
        expect(found.reduce((n, g) => n + g.count, 0)).toBe(items.length);
        expect(found.every((g) => g.count === g.items.length)).toBe(true);
      }),
    );
  });
});

describe("searchItemsOf", () => {
  const site = siteOf(FIXTURE);
  const items = searchItemsOf(site);

  it("holds one item for each place of the site, at the place's path", () => {
    expect(items.map((i) => i.path).sort()).toEqual(site.places.map((p) => p.path).sort());
  });

  it("names a world and an ecosystem as the data files do, and tells the universe of each", () => {
    expect(items.find((i) => i.path === "/w/bubble")).toMatchObject({
      name: "Bubble",
      kind: "world",
      universe: "onyx",
    });
    expect(items.find((i) => i.path === "/net/gnoland/e/tokens")).toMatchObject({
      name: "Tokens of gno.land",
      kind: "ecosystem",
      universe: "gnoland",
    });
  });

  it("names a station as a world, by its name and not its slug", () => {
    expect(items.find((i) => i.path === "/w/tokens")).toMatchObject({
      name: "Token station",
      kind: "world",
      universe: "onyx",
    });
  });

  it("gives the cosmos and the Earth of each universe a name that tells which universe", () => {
    const named = items.filter((i) => i.kind === "cosmos" || i.kind === "earth");
    expect(named).toHaveLength(4);
    expect(new Set(named.map((i) => i.name)).size).toBe(4);
  });
});

describe("searchItemsOf, one name in two universes", () => {
  const twin = (universe: string) => ({
    slug: "tokens",
    name: "Tokens",
    description: "Tokens, a place of the fixture, described at more than fifty characters, as the schema asks.",
    universe,
  });
  const items = searchItemsOf(siteOf({ ...FIXTURE, ecosystems: [twin("onyx"), twin("gnoland")], stations: [] }));

  it("gives two places of one name, in two universes, two names that tell them apart", () => {
    const found = items.filter((i) => i.kind === "ecosystem");
    expect(found).toHaveLength(2);
    expect(new Set(found.map((i) => i.name)).size).toBe(2);
    expect(found.find((i) => i.path === "/net/gnoland/e/tokens")?.name).toContain("gno.land");
  });

  it("leaves a name that is alone as the data files hold it", () => {
    expect(items.find((i) => i.path === "/w/bubble")?.name).toBe("Bubble");
  });
});

describe("opensPalette", () => {
  const press = (key: string, modifiers: Partial<Record<"metaKey" | "ctrlKey" | "shiftKey" | "altKey", true>> = {}) =>
    opensPalette({ key, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...modifiers });

  it("is ⌘K and Ctrl+K, whatever the case of the k", () => {
    expect(press("k", { metaKey: true })).toBe(true);
    expect(press("k", { ctrlKey: true })).toBe(true);
    expect(press("K", { ctrlKey: true })).toBe(true);
  });

  it("is no other key and no other chord: a bare k, Shift or Alt with it, another letter", () => {
    expect(press("k")).toBe(false);
    expect(press("k", { ctrlKey: true, shiftKey: true })).toBe(false);
    expect(press("k", { metaKey: true, altKey: true })).toBe(false);
    expect(press("j", { ctrlKey: true })).toBe(false);
  });
});
