import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { placeAt, placesOf, type PlaceSource } from "./places.ts";

// Slice 5's 5c: the places of the data files and their canonical URLs (docs/plans/slice-5.md §1, decisions 2026-10-29:
// Onyx the build's default, `/net/onyx/` canonical). A place has the path its page lives at (the default universe's
// are unprefixed) and one canonical address, always under `/net/<universe>`.
const SOURCE: PlaceSource = {
  defaultUniverse: "onyx",
  universes: [{ id: "onyx" }, { id: "gnoland" }],
  hubs: [
    { slug: "bubble", universe: "onyx" },
    { slug: "bubble", universe: "gnoland" },
  ],
  ecosystems: [{ slug: "tokens", universe: "onyx" }],
  stations: [{ slug: "moon", universe: "gnoland" }],
};

const find = (places: ReturnType<typeof placesOf>) => (kind: string, universe: string, slug?: string) =>
  places.find((p) => p.kind === kind && p.universe === universe && p.slug === slug);

describe("placesOf", () => {
  const places = () => placesOf(SOURCE);

  it("gives the cosmos and the Earth to every universe, whatever the files hold", () => {
    expect(placesOf({ ...SOURCE, hubs: [], ecosystems: [], stations: [] }).map((p) => p.canonical)).toEqual(
      expect.arrayContaining(["/net/onyx/", "/net/onyx/earth", "/net/gnoland/", "/net/gnoland/earth"]),
    );
  });

  it("puts every canonical under /net/<universe>, the default universe's too", () => {
    expect(find(places())("world", "onyx", "bubble")?.canonical).toBe("/net/onyx/w/bubble");
    expect(find(places())("world", "gnoland", "bubble")?.canonical).toBe("/net/gnoland/w/bubble");
    expect(find(places())("ecosystem", "onyx", "tokens")?.canonical).toBe("/net/onyx/e/tokens");
  });

  it("makes a station a world: /w/<slug>", () => {
    expect(find(places())("world", "gnoland", "moon")?.canonical).toBe("/net/gnoland/w/moon");
  });

  it("keeps the default universe's pages unprefixed and the others' under /net", () => {
    expect(find(places())("cosmos", "onyx")?.path).toBe("/");
    expect(find(places())("earth", "onyx")?.path).toBe("/earth");
    expect(find(places())("world", "onyx", "bubble")?.path).toBe("/w/bubble");
    expect(find(places())("world", "gnoland", "bubble")?.path).toBe("/net/gnoland/w/bubble");
    expect(find(places())("cosmos", "gnoland")?.path).toBe("/net/gnoland/");
  });

  it("is empty-proof: universes listed, no world, no ecosystem: the cosmos and the Earth alone", () => {
    expect(placesOf({ ...SOURCE, hubs: [], ecosystems: [], stations: [] }).map((p) => p.kind)).toEqual([
      "cosmos",
      "earth",
      "cosmos",
      "earth",
    ]);
  });

  it("refuses one rule alike: a default universe that is not listed, even when no universe is", () => {
    expect(() => placesOf({ ...SOURCE, defaultUniverse: "nowhere" })).toThrow(
      /default universe "nowhere" is not listed/,
    );
    expect(() => placesOf({ ...SOURCE, universes: [], hubs: [], ecosystems: [], stations: [] })).toThrow(
      /default universe "onyx" is not listed/,
    );
  });

  it.each([
    ["hub", { hubs: [{ slug: "x", universe: "mars" }] }],
    ["ecosystem", { ecosystems: [{ slug: "x", universe: "mars" }] }],
    ["world", { stations: [{ slug: "x", universe: "mars" }] }],
  ])("refuses a %s of a universe that is not listed", (_, change) => {
    expect(() => placesOf({ ...SOURCE, ...change })).toThrow(/"x" is in "mars", which is not listed/);
  });

  it.each([
    [
      "a hub and a station",
      { stations: [{ slug: "bubble", universe: "onyx" }] },
      /two worlds named "bubble" in "onyx"/,
    ],
    [
      "two hubs",
      {
        hubs: [
          { slug: "a", universe: "onyx" },
          { slug: "a", universe: "onyx" },
        ],
      },
      /two worlds named "a" in "onyx"/,
    ],
    [
      "two stations",
      {
        stations: [
          { slug: "a", universe: "onyx" },
          { slug: "a", universe: "onyx" },
        ],
      },
      /two worlds named "a" in "onyx"/,
    ],
    [
      "two ecosystems",
      {
        ecosystems: [
          { slug: "t", universe: "onyx" },
          { slug: "t", universe: "onyx" },
        ],
      },
      /two ecosystems named "t" in "onyx"/,
    ],
    ["two universes", { universes: [{ id: "onyx" }, { id: "onyx" }] }, /two universes named "onyx"/],
  ])("refuses one slug twice: %s", (_, change, message) => {
    expect(() => placesOf({ ...SOURCE, ...change })).toThrow(message);
  });

  it("takes one slug in two universes, and a world and an ecosystem of one slug", () => {
    const taken = placesOf({
      ...SOURCE,
      hubs: [{ slug: "a", universe: "onyx" }],
      stations: [{ slug: "a", universe: "gnoland" }],
      ecosystems: [{ slug: "a", universe: "onyx" }],
    });
    expect(taken.filter((p) => p.slug === "a").map((p) => p.canonical)).toEqual([
      "/net/onyx/w/a",
      "/net/gnoland/w/a",
      "/net/onyx/e/a",
    ]);
  });
});

describe("placeAt", () => {
  const places = () => placesOf(SOURCE);

  it("finds a place by its path and by its canonical", () => {
    const all = places();
    const bubble = find(all)("world", "onyx", "bubble");
    expect(placeAt(all, "/w/bubble")).toBe(bubble);
    expect(placeAt(all, "/net/onyx/w/bubble")).toBe(bubble);
  });

  it.each([["/W/bubble"], ["/w/Bubble"], ["/w/bubble/"], ["/w/nowhere"], ["/net/mars/"], [""], ["w/bubble"]])(
    "knows no place at %j (a world's path is lower case, F376 is 5d's)",
    (path) => {
      expect(placeAt(places(), path)).toBeUndefined();
    },
  );
});

// Any set of universes and worlds the schemas accept.
const slug = fc.stringMatching(/^[a-z0-9]+(-[a-z0-9]+)*$/).filter((s) => s.length <= 20);
const keyed = (ids: string[], maxLength: number) =>
  fc.uniqueArray(fc.record({ slug, universe: fc.constantFrom(...ids) }), {
    maxLength,
    selector: (h) => `${h.universe}/${h.slug}`,
  });
// Hubs and stations are worlds of one namespace: one list of worlds, cut in two.
const source = fc.uniqueArray(slug, { minLength: 1, maxLength: 4 }).chain((ids) =>
  fc
    .record({
      defaultUniverse: fc.constantFrom(...ids),
      universes: fc.constant(ids.map((id) => ({ id }))),
      worlds: keyed(ids, 8),
      cut: fc.nat(8),
      ecosystems: keyed(ids, 4),
    })
    .map(({ worlds, cut, ...rest }) => ({ ...rest, hubs: worlds.slice(0, cut), stations: worlds.slice(cut) })),
);

describe("the places, as properties", () => {
  it("has one canonical a place, and no two places share one", () => {
    fc.assert(
      fc.property(source, (s) => {
        const places = placesOf(s);
        expect(new Set(places.map((p) => p.canonical)).size).toBe(places.length);
        for (const p of places) expect(p.canonical.startsWith(`/net/${p.universe}/`)).toBe(true);
      }),
    );
  });

  it("has no two places on one path", () => {
    fc.assert(
      fc.property(source, (s) => {
        const places = placesOf(s);
        expect(new Set(places.map((p) => p.path)).size).toBe(places.length);
      }),
    );
  });

  it("has the Earth and the cosmos in every universe, and every path of a place finds it", () => {
    fc.assert(
      fc.property(source, (s) => {
        const places = placesOf(s);
        for (const { id } of s.universes) {
          expect(find(places)("earth", id)).toBeDefined();
          expect(find(places)("cosmos", id)).toBeDefined();
        }
        for (const p of places) {
          expect(placeAt(places, p.path)).toBe(p);
          expect(placeAt(places, p.canonical)).toBe(p);
        }
      }),
    );
  });

  it("writes every path in lower case", () => {
    fc.assert(
      fc.property(source, (s) => {
        for (const p of placesOf(s)) {
          expect(p.path).toBe(p.path.toLowerCase());
          expect(p.canonical).toBe(p.canonical.toLowerCase());
        }
      }),
    );
  });
});

// Slice 5's plan §4: a place by its path is a Map built once, O(1) a navigation (ADR-0002 §9). Counted, not timed: the
// places are read through getters, and what a lookup reads is the same at n, 4n and 16n.
describe("the cost of the places, at n, 4n and 16n", () => {
  const sourceOf = (n: number, reads: { count: number }): PlaceSource => {
    const row = (slug: string, universe: string) => ({
      get slug() {
        reads.count++;
        return slug;
      },
      get universe() {
        reads.count++;
        return universe;
      },
    });
    return {
      defaultUniverse: "onyx",
      universes: [{ id: "onyx" }, { id: "gnoland" }],
      hubs: Array.from({ length: n }, (_, i) => row(`h${String(i)}`, i % 2 ? "onyx" : "gnoland")),
      ecosystems: Array.from({ length: n }, (_, i) => row(`e${String(i)}`, "onyx")),
      stations: Array.from({ length: n }, (_, i) => row(`s${String(i)}`, "gnoland")),
    };
  };

  it("reads each row a constant number of times to make the places", () => {
    const perRow = [100, 400, 1600].map((n) => {
      const reads = { count: 0 };
      placesOf(sourceOf(n, reads));
      return reads.count / (3 * n);
    });
    expect(perRow[1]).toBeLessThanOrEqual(perRow[0] ?? 0);
    expect(perRow[2]).toBeLessThanOrEqual(perRow[0] ?? 0);
    expect(perRow[0]).toBeLessThanOrEqual(4);
  });

  it("reads no place at all in a lookup once the index is built: 1,000 lookups cost the first one's reads", () => {
    const afterOne: number[] = [];
    const afterMany: number[] = [];
    for (const n of [100, 400, 1600]) {
      const reads = { count: 0 };
      const places = placesOf(sourceOf(n, reads)).map((p) => {
        const watched = { ...p };
        return Object.defineProperties(watched, {
          path: { get: () => ((reads.count += 1), p.path) },
          canonical: { get: () => ((reads.count += 1), p.canonical) },
        });
      });
      reads.count = 0;
      placeAt(places, "/w/h1");
      afterOne.push(reads.count);
      for (let i = 0; i < 1000; i++) placeAt(places, `/w/h${String(i)}`);
      afterMany.push(reads.count);
    }
    expect(afterMany).toEqual(afterOne);
    expect(afterOne[0]).toBeGreaterThan(0);
    expect(afterOne[1]).toBeLessThanOrEqual(4 * (afterOne[0] ?? 0));
    expect(afterOne[2]).toBeLessThanOrEqual(16 * (afterOne[0] ?? 0));
  });
});
