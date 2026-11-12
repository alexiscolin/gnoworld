import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { hubWorldOf } from "@gnoworld/core";
import { ExportedName } from "@gnoworld/schemas/indexer";
import { FIXTURE } from "../../placesFixture.ts";
import { siteOf } from "../../places.ts";
import { opensPalette } from "./chord.ts";
import { sortPlaces } from "./ranks.ts";
import { searchItemsOf, worldsItemsOf } from "./items.ts";
import { matchOf, parseQuery } from "./match.ts";
import { groupResults } from "./groups.ts";
import { SHOWN, searchPlaces } from "./search.ts";
import { buildIndex, FUNCTION_SCORE } from "./searchIndex.ts";
import { COMMANDS, type SearchFilter, type SearchItem } from "./types.ts";

// The palette's search, over the places the page holds already (no request, docs/plans/slice-5.md §1).
const ITEMS: SearchItem[] = [
  { name: "Bubble", kind: "world", universe: "onyx", path: "/w/bubble", slug: "bubble", rooms: ["#bubble"], here: 2 },
  { name: "Arcade", kind: "world", universe: "onyx", path: "/w/arcade", slug: "arcade", rooms: ["#arcade"] },
  { name: "GovDAO", kind: "world", universe: "onyx", path: "/w/govdao", tag: "DAO", fresh: true, visited: false },
  { name: "Gnoscan", kind: "station", universe: "onyx", path: "/w/gnoscan", here: 1, visited: true, active: true },
  { name: "Gno Playground", kind: "station", universe: "onyx", path: "/w/gno-playground", visited: false },
  { name: "Tokens", kind: "ecosystem", universe: "onyx", path: "/e/tokens" },
  { name: "Earth", kind: "earth", universe: "onyx", path: "/earth" },
  { name: "Onyx", kind: "cosmos", universe: "onyx", path: "/" },
  { name: "gnoswap", kind: "system", universe: "onyx", path: "/s/gnoswap", namespace: "gnoswap" },
  { name: "gnoswap/v1/router", kind: "realm", universe: "onyx", path: "/r/gnoswap/v1/router", namespace: "gnoswap" },
];
const INDEX = buildIndex(ITEMS);
const run = (query: string, options?: Parameters<typeof searchPlaces>[2]) => searchPlaces(INDEX, query, options);
const names = (found: ReturnType<typeof searchPlaces>) => found.results.map((r) => r.item.name);

describe("parseQuery", () => {
  it("reads a mark and the words after it, whatever the case or the spaces round", () => {
    expect(parseQuery("  #Bubble ")).toEqual({ mode: "room", text: "bubble" });
    expect(parseQuery("@GnoSwap")).toEqual({ mode: "namespace", text: "gnoswap" });
    expect(parseQuery("/r/gnoswap/v1")).toEqual({ mode: "realm", text: "gnoswap/v1" });
    expect(parseQuery(">  Earth")).toEqual({ mode: "command", text: "earth" });
    expect(parseQuery("gno")).toEqual({ mode: "name", text: "gno" });
  });

  it("knows an address, which no page holds yet", () => {
    expect(parseQuery(`g1${"q".repeat(38)}`).mode).toBe("address");
    expect(parseQuery("g1short").mode).toBe("name");
  });
});

describe("matchOf", () => {
  it("ranks the whole name over its start, a word's start, a part and the letters in order", () => {
    const score = (text: string) => matchOf(text, "gno")?.score ?? 0;
    expect([score("gno"), score("gnoscan"), score("the gnome"), score("regnol"), score("g-n-o")]).toEqual([
      1000, 900, 800, 700, 400,
    ]);
  });

  it("forgives a letter missed, added, wrong or swapped, as a longer word allows", () => {
    expect(matchOf("Gnoscan", "gnoscna")).toBeDefined();
    expect(matchOf("Gnoscan", "gnoscaan")).toBeDefined();
    expect(matchOf("Gnoswap", "gnoswep")).toBeDefined();
    expect(matchOf("Gnoscan", "gnscan")).toBeDefined();
  });

  it("forgives nothing in a short word, nor too many letters in a long one", () => {
    expect(matchOf("Arcade", "xyz")).toBeUndefined();
    expect(matchOf("Bubble", "bux")).toBeUndefined();
    expect(matchOf("Gnoscan", "gnoxxxn")).toBeUndefined();
  });

  it("marks the letters it matched", () => {
    expect(matchOf("Gnoscan", "gnscan")?.hits).toEqual([0, 1, 3, 4, 5, 6]);
  });
});

describe("searchPlaces", () => {
  it("finds a name by any part of it, whatever the case, the closest first", () => {
    expect(names(run("GNO"))).toEqual(["Gnoscan", "Gno Playground", "gnoswap", "gnoswap/v1/router"]);
    expect(names(run("play"))).toEqual(["Gno Playground"]);
  });

  it("finds a place with a typo in its name", () => {
    expect(names(run("gnscan"))).toContain("Gnoscan");
    expect(names(run("arcdae"))).toEqual(["Arcade"]);
  });

  it("lists every place but the realms for no words, in the data's order", () => {
    expect(names(run(""))).toEqual(ITEMS.filter((i) => i.kind !== "realm").map((i) => i.name));
  });

  it("treats a regex's marks as text: a query is never a pattern", () => {
    expect(run(".*").results).toEqual([]);
    expect(run("(").results).toEqual([]);
  });

  it("a plain word finds realms too, after the places and the systems", () => {
    expect(names(run("router"))).toEqual(["gnoswap/v1/router"]);
    expect(names(run("gnoswap"))).toEqual(["gnoswap", "gnoswap/v1/router"]);
  });

  it("# finds a room, with its name in the note, and the place that holds it", () => {
    const found = run("#bubb");
    expect(found.results.map((r) => [r.item.path, r.note])).toEqual([["/w/bubble", "#bubble · room"]]);
  });

  it("@ finds a system, and a namespace named whole also lists its realms", () => {
    expect(names(run("@gnos"))).toEqual(["gnoswap"]);
    expect(names(run("@gnoswap"))).toEqual(["gnoswap", "gnoswap/v1/router"]);
  });

  it("/r/ finds a realm by its path, and offers the realm typed whole when none is listed", () => {
    expect(names(run("/r/router"))).toEqual(["gnoswap/v1/router"]);
    expect(run("/r/demo/boards").results.map((r) => r.item.path)).toEqual(["/r/demo/boards"]);
    expect(run("/r/not a path").results).toEqual([]);
  });

  it("> lists the commands, narrowed by the words after it", () => {
    expect(names(run(">"))).toEqual(COMMANDS.map((c) => c.name));
    expect(names(run("> ear"))).toEqual(["earth"]);
    expect(run("> explore").results[0]?.item.command).toBe("explore");
    expect(run("> plan").results[0]?.item.command).toBe("plan");
  });

  it("finds no place for an address: no page holds one", () => {
    expect(run(`g1${"q".repeat(38)}`).results).toEqual([]);
  });
});

describe("the chips", () => {
  const found = (...chips: SearchFilter[]) => names(run("", { filters: new Set(chips) }));

  it("add the kinds to each other", () => {
    expect(found("dao")).toEqual(["GovDAO"]);
    expect(found("stations")).toEqual(["Gnoscan", "Gno Playground"]);
    expect(found("worlds", "dao")).toEqual(["Bubble", "Arcade", "GovDAO"]);
    expect(found("systems")).toEqual(["gnoswap"]);
  });

  it("narrow by the people here, the new and the unvisited, alone and with a kind", () => {
    expect(found("here")).toEqual(["Bubble", "Gnoscan"]);
    expect(found("new")).toEqual(["GovDAO"]);
    expect(found("active")).toEqual(["Gnoscan"]);
    expect(found("unseen")).toEqual(["GovDAO", "Gno Playground"]);
    expect(found("stations", "unseen")).toEqual(["Gno Playground"]);
  });

  it("keep the worlds the reader follows, listed with no words", () => {
    const some = buildIndex(
      ITEMS.map((item) => (item.name === "Bubble" ? { ...item, followed: true as const } : item)),
    );
    expect(names(searchPlaces(some, "", { filters: new Set<SearchFilter>(["following"]) }))).toEqual(["Bubble"]);
  });

  it("leave the commands alone", () => {
    expect(run(">", { filters: new Set(["dao"]) }).results).toHaveLength(COMMANDS.length);
  });
});

describe("groupResults", () => {
  it("puts the recent places first, once, then every kind in turn", () => {
    const { groups } = groupResults(run("").results, ["/w/gnoscan", "/nowhere", "/w/bubble"]);
    expect(groups.map((g) => g.id)).toEqual(["recent", "world", "station", "ecosystem", "earth", "cosmos", "system"]);
    expect(groups[0]?.results.map((r) => r.item.name)).toEqual(["Gnoscan", "Bubble"]);
    expect(groups[1]?.results.map((r) => r.item.name)).toEqual(["Arcade", "GovDAO"]);
  });
});

describe("the order and the namespace", () => {
  const rich: SearchItem[] = [
    { name: "alpha", kind: "world", universe: "onyx", path: "/w/alpha", here: 1, calls: 5, seen: 30, namespace: "n1" },
    { name: "beta", kind: "world", universe: "onyx", path: "/w/beta", here: 9, calls: 1, seen: 10, namespace: "n2" },
    { name: "gamma", kind: "world", universe: "onyx", path: "/w/gamma", here: 0, calls: 9, seen: 20, namespace: "n1" },
  ];
  const order = (
    sort: Parameters<typeof run>[1] extends infer O ? (NonNullable<O> extends { sort?: infer S } ? S : never) : never,
  ) => names(searchPlaces(buildIndex(rich), "", { sort }));

  it("sorts by the people here, the calls, the last sight and the name, the best match otherwise", () => {
    expect(order("here")).toEqual(["beta", "alpha", "gamma"]);
    expect(order("activity")).toEqual(["gamma", "alpha", "beta"]);
    expect(order("newest")).toEqual(["alpha", "gamma", "beta"]);
    expect(order("name")).toEqual(["alpha", "beta", "gamma"]);
    expect(names(searchPlaces(buildIndex(rich), "a", { sort: "here" }))).toEqual(["beta", "alpha", "gamma"]);
  });

  it("sorts by the indexer's ranks as Discover does, the places without one last", () => {
    const rank = (name: string, [calls, callers, lastHeight]: number[]) => ({
      name,
      path: `/w/${name}`,
      calls: calls ?? 0,
      callers: callers ?? 0,
      lastHeight: lastHeight ?? null,
      rise: null,
      firstHeight: null,
    });
    const ranked: SearchItem[] = [
      ...rich.map((item, at) => ({
        ...item,
        rank: rank(
          item.name,
          [
            [5, 1, 30],
            [1, 9, 10],
            [9, 2, 20],
          ][at] ?? [],
        ),
      })),
      { name: "delta", kind: "world", universe: "onyx", path: "/w/delta" },
    ];
    const by = (sort: "trend" | "callers" | "calls") => names(searchPlaces(buildIndex(ranked), "", { sort }));
    expect(by("calls")).toEqual(["gamma", "alpha", "beta", "delta"]);
    expect(by("callers")).toEqual(["beta", "gamma", "alpha", "delta"]);
    expect(by("trend")).toEqual(["alpha", "gamma", "beta", "delta"]);
  });

  it("sorts the followed worlds as Discover's sorts do, the A to Z by name, those with no realm last", () => {
    const rank = (calls: number, callers: number) => ({
      name: "",
      path: "",
      calls,
      callers,
      lastHeight: null,
      rise: null,
      firstHeight: null,
    });
    const worlds: SearchItem[] = [
      { name: "b", kind: "world", universe: "onyx", path: "/w/b", rank: rank(5, 1) },
      { name: "a", kind: "world", universe: "onyx", path: "/w/a" },
      { name: "c", kind: "world", universe: "onyx", path: "/w/c", rank: rank(1, 9) },
    ];
    expect(sortPlaces(worlds, "calls").map((w) => w.name)).toEqual(["b", "c", "a"]);
    expect(sortPlaces(worlds, "callers").map((w) => w.name)).toEqual(["c", "b", "a"]);
    expect(sortPlaces(worlds, "az").map((w) => w.name)).toEqual(["a", "b", "c"]);
  });

  it("keeps the places of one namespace, and lists the namespaces by their calls", () => {
    expect(names(searchPlaces(buildIndex(rich), "", { namespace: "n1" }))).toEqual(["alpha", "gamma"]);
    const spaces: SearchItem[] = [
      { name: "quiet", kind: "system", universe: "onyx", path: "/s/quiet", namespace: "quiet", calls: 1 },
      { name: "busy", kind: "system", universe: "onyx", path: "/s/busy", namespace: "busy", calls: 90 },
    ];
    expect(buildIndex(spaces).namespaces).toEqual(["busy", "quiet"]);
    const address = `g1${"q".repeat(38)}`;
    const named: SearchItem[] = [
      ...spaces,
      { name: address, kind: "system", universe: "onyx", path: `/s/${address}`, namespace: address, calls: 999 },
    ];
    expect(buildIndex(named).namespaces).toEqual(["busy", "quiet"]);
  });
});

// 1,000 worlds, 100 namespaces and 10,000 realms, as the worlds' file may grow to.
const BIG: SearchItem[] = [
  ...Array.from({ length: 100 }, (_, n) => ({
    name: `space${String(n)}`,
    kind: "system" as const,
    universe: "onyx",
    path: `/s/space${String(n)}`,
    namespace: `space${String(n)}`,
    calls: n,
  })),
  ...Array.from({ length: 10_000 }, (_, n) => ({
    name: `space${String(n % 100)}/v1/realm${String(n)}`,
    kind: "realm" as const,
    universe: "onyx",
    path: `/r/space${String(n % 100)}/v1/realm${String(n)}`,
    namespace: `space${String(n % 100)}`,
    calls: n,
  })),
  ...Array.from({ length: 1000 }, (_, n) => ({
    name: `World ${String(n)}`,
    kind: "world" as const,
    universe: "onyx",
    path: `/w/world-${String(n)}`,
    here: n % 7,
  })),
];

describe("a list of 10,000 realms", () => {
  const big = buildIndex(BIG);

  it("lists the places, then the systems, then the realms for a plain word, 50 at most, and counts them all", () => {
    const found = searchPlaces(big, "space1");
    const kinds = found.results.map((r) => r.item.kind);
    expect(kinds.indexOf("realm")).toBeGreaterThan(kinds.lastIndexOf("system"));
    expect(found.results).toHaveLength(SHOWN);
    expect(found.total).toBeGreaterThan(SHOWN);
    expect(searchPlaces(big, "realm9999").results[0]?.item.name).toBe("space99/v1/realm9999");
  });

  it("indexes each kind apart, the busiest namespaces first", () => {
    expect([big.places.length, big.systems.length, big.realms.length]).toEqual([1000, 100, 10_000]);
    expect(big.namespaces.slice(0, 2)).toEqual(["space99", "space98"]);
  });

  it("draws the best 50 and counts how many answered, for a word, a realm path and a namespace", () => {
    for (const query of ["/r/realm", "/r/v1", "@space1", "world"]) {
      const found = searchPlaces(big, query);
      expect(found.results.length, query).toBeLessThanOrEqual(SHOWN);
      expect(found.total, query).toBeGreaterThan(SHOWN);
    }
    expect(searchPlaces(big, "/r/realm9999").results[0]?.item.name).toBe("space99/v1/realm9999");
  });

  it("lists, for no words, the places and never the realms, and the groups draw 50 each and say how many more", () => {
    const empty = searchPlaces(big, "");
    expect(empty.total).toBe(1100);
    const { groups, more } = groupResults(empty.results, []);
    expect(groups.every((g) => g.results.length <= SHOWN)).toBe(true);
    expect(more).toBe(1100 - 50 - 50);
    expect(groups.some((g) => g.id === "realm")).toBe(false);
  });

  it("answers a letter typed in a few milliseconds of work", { tags: ["timing"], timeout: 30_000 }, () => {
    const least = (query: string) => {
      searchPlaces(big, query);
      let best = Infinity;
      for (let run_ = 0; run_ < 9; run_++) {
        const start = performance.now();
        searchPlaces(big, query);
        best = Math.min(best, performance.now() - start);
      }
      return best;
    };
    // The typed letters of a word, and one misspelt (which adds the second pass).
    for (const query of ["r", "re", "rea", "real", "realm1", "reaml1", "zzzz"])
      expect(least(query), query).toBeLessThan(64);
  });
});

describe("the query's cost", () => {
  it("finds every place by its own name, whatever the names", () => {
    const item = fc.record({
      name: fc
        .string({
          unit: fc.constantFrom("a", "b", "A", "B", " ", "é", "É", "ü", "ñ", "-"),
          minLength: 1,
          maxLength: 20,
        })
        .filter((s) => s.trim() !== "" && !/^[>#@]/.test(s.trim())),
      kind: fc.constantFrom<SearchItem["kind"]>("cosmos", "earth", "world", "ecosystem"),
      universe: fc.constantFrom("onyx", "gnoland"),
      path: fc.webPath(),
    });
    fc.assert(
      fc.property(fc.array(item, { minLength: 1, maxLength: 30 }), (items) => {
        for (const each of items)
          expect(
            searchPlaces(buildIndex(items), each.name).results.some(
              (r) => r.item === each || r.item.name === each.name,
            ),
          ).toBe(true);
      }),
    );
  });
});

describe("searchItemsOf", () => {
  const site = siteOf(FIXTURE);
  const items = searchItemsOf(site, hubWorldOf);

  it("holds one item for each place of the site, at the place's path", () => {
    expect(items.map((i) => i.path).sort()).toEqual(site.places.map((p) => p.path).sort());
  });

  it("names a world and an ecosystem as the data files do, and tells the universe of each", () => {
    expect(items.find((i) => i.path === "/w/bubble")).toMatchObject({
      name: "Bubble",
      kind: "world",
      universe: "onyx",
      slug: "bubble",
      rooms: ["#bubble"],
    });
    expect(items.find((i) => i.path === "/net/gnoland/e/tokens")).toMatchObject({
      name: "Tokens of gno.land",
      kind: "ecosystem",
      universe: "gnoland",
    });
  });

  it("names a station by its name and not its slug, in its own kind", () => {
    expect(items.find((i) => i.path === "/w/tokens")).toMatchObject({ name: "Token station", universe: "onyx" });
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
  const items = searchItemsOf(siteOf({ ...FIXTURE, ecosystems: [twin("onyx"), twin("gnoland")] }), hubWorldOf);

  it("gives two places of one name, in two universes, two names that tell them apart", () => {
    const found = items.filter((i) => i.kind === "ecosystem");
    expect(found).toHaveLength(2);
    expect(new Set(found.map((i) => i.name)).size).toBe(2);
    expect(found.find((i) => i.path === "/net/gnoland/e/tokens")?.name).toContain("gno.land");
  });
});

describe("worldsItemsOf", () => {
  const realm = (path: string) => ({ path });
  const file = [
    { namespace: "gnoswap", realms: [realm("gno.land/r/gnoswap/v1/router"), realm("not a realm")] },
    { namespace: "gnoswap", realms: [realm("gno.land/r/gnoswap/v1/pool")] },
    { namespace: "demo", realms: [realm("gno.land/r/demo/boards")] },
  ];
  const items = worldsItemsOf(file, {
    universe: "onyx",
    systemPath: (ns) => `/s/${ns}`,
    now: Date.parse("2026-11-07T12:00:00Z"),
  });

  it("holds one system for each namespace and one realm for each realm with a page", () => {
    expect(items.filter((i) => i.kind === "system").map((i) => [i.name, i.path])).toEqual([
      ["gnoswap", "/s/gnoswap"],
      ["demo", "/s/demo"],
    ]);
    expect(items.filter((i) => i.kind === "realm").map((i) => [i.name, i.path, i.namespace])).toEqual([
      ["gnoswap/v1/router", "/r/gnoswap/v1/router", "gnoswap"],
      ["gnoswap/v1/pool", "/r/gnoswap/v1/pool", "gnoswap"],
      ["demo/boards", "/r/demo/boards", "demo"],
    ]);
  });
});

describe("opensPalette", () => {
  const press = (
    key: string,
    modifiers: Partial<Record<"metaKey" | "ctrlKey" | "shiftKey" | "altKey", true>> = {},
    target?: EventTarget,
  ) =>
    opensPalette({
      key,
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      ...modifiers,
      target: target ?? null,
    });

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

describe("a realm found by the functions it exports", () => {
  const realm = (name: string, functions?: string[]): SearchItem => ({
    name,
    kind: "realm",
    universe: "onyx",
    path: `/r/${name}`,
    ...(functions === undefined ? {} : { functions }),
  });
  const gov = realm("dao/gov", ["MustVoteOnProposal", "Vote", "Render", "VoteAll", "Votes"]);
  const index = buildIndex([
    gov,
    realm("tok/coin", ["Mint", "Transfer"]),
    realm("plain"),
    realm("voting", ["Tally"]),
    realm("vote"),
  ]);
  const found = (query: string) => searchPlaces(index, query).results;

  it("finds a realm by a word of a function, and shows the functions that matched, three at most", () => {
    const hit = found("vote").find((each) => each.item.name === "dao/gov");
    expect(hit?.note).toBe("MustVoteOnProposal, Vote, VoteAll");
  });

  it("finds a function by its exact name in lower case, its words run together", () => {
    const hit = found("mustvoteonproposal").find((each) => each.item.name === "dao/gov");
    expect(hit?.note).toBe("MustVoteOnProposal");
    expect(found("mustvote").some((each) => each.item.name === "dao/gov")).toBe(true);
  });

  it("finds Mint by mint", () => {
    expect(found("mint").map((each) => each.item.name)).toEqual(["tok/coin"]);
    expect(found("mint")[0]?.note).toBe("Mint");
  });

  it("ranks a name above a function, by a constant under the plain name scores and over the scattered letters", () => {
    expect(
      found("vote")
        .map((each) => each.item.name)
        .slice(0, 2),
    ).toEqual(["vote", "dao/gov"]);
    expect(
      found("vot")
        .map((each) => each.item.name)
        .slice(0, 2),
    ).toEqual(["vote", "voting"]);
    expect(FUNCTION_SCORE).toBeLessThan(700);
    expect(FUNCTION_SCORE).toBeGreaterThan(400);
  });

  it("ranks a function above the scattered letters of a long name", () => {
    const some = buildIndex([realm("g1v0o0t0e0/x"), gov]);
    expect(searchPlaces(some, "vote").results.map((each) => each.item.name)).toEqual(["dao/gov", "g1v0o0t0e0/x"]);
  });

  it("splits an identifier on its capitals and underscores", () => {
    const some = buildIndex([realm("a/b", ["Must_Vote", "HTTPServer"])]);
    expect(searchPlaces(some, "must vote").results[0]?.note).toBe("Must_Vote");
    expect(searchPlaces(some, "server").results[0]?.note).toBe("HTTPServer");
  });

  it("matches a longer word a letter off or swapped, and a three-letter one not at all", () => {
    const some = buildIndex([realm("a/b", ["Withdraw"])]);
    expect(searchPlaces(some, "withdarw").results[0]?.note).toBe("Withdraw");
    expect(searchPlaces(some, "witdhraw").results[0]?.note).toBe("Withdraw");
    expect(searchPlaces(buildIndex([realm("a/b", ["Mint"])]), "mnt").results).toEqual([]);
    expect(searchPlaces(buildIndex([realm("a/b", ["Mint"])]), "mxn").results).toEqual([]);
  });

  it("finds a realm with no functions by its name only", () => {
    expect(found("plain").map((each) => each.item.name)).toEqual(["plain"]);
    expect(found("plain")[0]?.note).toBeUndefined();
  });

  it("gives a name hit no note", () => {
    expect(found("vote")[0]?.note).toBeUndefined();
  });

  it("builds each entry once: a search allocates no entry", () => {
    const entries = index.realms;
    const before = entries.map((entry) => entry.fns);
    found("vote");
    found("mint");
    expect(index.realms).toBe(entries);
    expect(index.realms.map((entry) => entry.fns)).toEqual(before);
    expect(index.realms.every((entry, at) => entry.fns === before[at])).toBe(true);
  });

  it("carries the functions of the worlds' file onto the realm items, and a hostile name cannot reach it", () => {
    const worlds = [
      {
        namespace: "dao",
        realms: [
          { path: "gno.land/r/dao/gov", calls: 1, functions: ["Vote"] },
          { path: "gno.land/r/dao/x", calls: 1, functions: [] },
        ],
      },
    ];
    const items = worldsItemsOf(worlds, { universe: "onyx", systemPath: (n) => `/s/${n}`, now: 0 });
    expect(items.find((each) => each.name === "dao/gov")?.functions).toEqual(["Vote"]);
    expect(items.find((each) => each.name === "dao/x")?.functions).toBeUndefined();
    expect(ExportedName.safeParse("<b>Vote</b>").success).toBe(false);
  });
});
