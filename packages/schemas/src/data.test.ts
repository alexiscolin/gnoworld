import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  BubbleRules,
  DATA_CAPS,
  Ecosystems,
  EMBED_PREFIXES,
  Events,
  Expedition,
  Genres,
  Hubs,
  News,
  Quests,
  Stations,
  Universes,
} from "./data.ts";

// Slice 5's 5c: the data files' schemas (ADR-0002 §8 row 10), checked when the app builds. Every list accepts the empty
// list but the universes', which names the default one. The caps (DATA_CAPS) are tested at the cap and one past it.
const universe = {
  id: "onyx",
  name: "Onyx",
  chainId: "onyx-1",
  rpc: "https://rpc.onyx.testnets.gno.land:443",
  gnoweb: "https://onyx.testnets.gno.land",
  indexer: "https://indexer.onyx.testnets.gno.land/graphql/query",
  testnet: true,
};
const hub = { slug: "bubble", name: "Bubble", description: "d".repeat(60), universe: "onyx" };
const world = { slug: "moon", name: "Moon", description: "d".repeat(60), universe: "onyx" };
const eco = { slug: "tokens", name: "Tokens", description: "Tokens.", universe: "onyx" };
const genre = { slug: "game", name: "Game" };
const event = { id: "launch", title: "Launch", start: "2026-11-01T18:00:00.000Z", link: "https://gno.land/" };
const stop = { id: "start", title: "Start", description: "Begin here.", link: "https://gno.land/" };
const quest = { id: "first", title: "First", description: "Say hello." };
const news = { id: "n1", title: "News", date: "2026-10-29", link: "https://gno.land/" };

type Row = Record<string, unknown>;
interface Schema {
  safeParse(data: unknown): { success: boolean };
}

const LISTS: readonly (readonly [string, Schema, Row])[] = [
  ["Hubs", Hubs, hub],
  ["Ecosystems", Ecosystems, eco],
  ["Stations", Stations, world],
  ["Genres", Genres, genre],
  ["Events", Events, event],
  ["Expedition", Expedition, stop],
  ["Quests", Quests, quest],
  ["News", News, news],
];

/** The same row as another one: its id or slug changed. */
const other = (row: Row, name = "b"): Row => ({ ...row, ["id" in row ? "id" : "slug"]: name });

/** The longest a string field of a list may be (DATA_CAPS), a hub's or a station's description 160. */
const capOf = (list: string, field: string): number | undefined =>
  field === "description" && (list === "Hubs" || list === "Stations")
    ? DATA_CAPS.seoDescription
    : field === "id" || field === "slug" || field === "universe"
      ? DATA_CAPS.key
      : field === "name"
        ? DATA_CAPS.name
        : field === "title"
          ? DATA_CAPS.title
          : field === "description"
            ? DATA_CAPS.description
            : undefined;

describe.each(LISTS)("%s", (name, schema, row) => {
  it("takes a row, the empty list, and two different rows", () => {
    expect(schema.safeParse([row]).success).toBe(true);
    expect(schema.safeParse([]).success).toBe(true);
    expect(schema.safeParse([row, other(row)]).success).toBe(true);
  });

  it("refuses two rows of one id", () => {
    expect(schema.safeParse([row, { ...row }]).success).toBe(false);
  });

  it("refuses a row with a field it does not know, and a row that is no object", () => {
    expect(schema.safeParse([{ ...row, extra: 1 }]).success).toBe(false);
    expect(schema.safeParse(["x"]).success).toBe(false);
    expect(schema.safeParse({}).success).toBe(false);
  });

  it.each(Object.keys(row))("refuses a row with no %s", (field) => {
    const rest = Object.fromEntries(Object.entries(row).filter(([key]) => key !== field));
    expect(schema.safeParse([rest]).success).toBe(false);
  });

  it.each(Object.keys(row))("refuses a row whose %s is a number", (field) => {
    expect(schema.safeParse([{ ...row, [field]: 7 }]).success).toBe(false);
  });

  it.each(Object.keys(row).filter((field) => capOf(name, field) !== undefined))(
    "bounds %s: empty refused, its cap taken, one past it refused",
    (field) => {
      const cap = capOf(name, field) ?? 0;
      expect(schema.safeParse([{ ...row, [field]: "" }]).success).toBe(false);
      expect(schema.safeParse([{ ...row, [field]: "x".repeat(cap) }]).success).toBe(true);
      expect(schema.safeParse([{ ...row, [field]: "x".repeat(cap + 1) }]).success).toBe(false);
    },
  );

  it("holds a list's cap of rows, and refuses one more", () => {
    const rows = (n: number) => Array.from({ length: n }, (_, i) => other(row, `k${String(i)}`));
    expect(schema.safeParse(rows(DATA_CAPS.rows)).success).toBe(true);
    expect(schema.safeParse(rows(DATA_CAPS.rows + 1)).success).toBe(false);
  });
});

describe("a world's key in a universe", () => {
  it.each([
    ["Hubs", Hubs, hub],
    ["Ecosystems", Ecosystems, eco],
    ["Stations", Stations, world],
  ] as const)("is unique to a universe in %s: the same name in another is taken", (_, schema, row) => {
    expect(schema.safeParse([row, { ...row, universe: "gnoland" }]).success).toBe(true);
    expect(schema.safeParse([row, { ...row }]).success).toBe(false);
  });
});

describe("a name in a path", () => {
  const FIELDS: readonly (readonly [string, (value: string) => boolean])[] = [
    ["Hubs.slug", (slug) => Hubs.safeParse([{ ...hub, slug }]).success],
    ["Hubs.universe", (universe) => Hubs.safeParse([{ ...hub, universe }]).success],
    ["Ecosystems.slug", (slug) => Ecosystems.safeParse([{ ...eco, slug }]).success],
    ["Ecosystems.universe", (universe) => Ecosystems.safeParse([{ ...eco, universe }]).success],
    ["Stations.slug", (slug) => Stations.safeParse([{ ...world, slug }]).success],
    ["Stations.universe", (universe) => Stations.safeParse([{ ...world, universe }]).success],
    ["Genres.slug", (slug) => Genres.safeParse([{ ...genre, slug }]).success],
    ["Universes.id", (id) => Universes.safeParse([{ ...universe, id, default: true }]).success],
  ];

  describe.each(FIELDS)("%s", (_, accepts) => {
    it("takes a slug", () => {
      expect(accepts("moon-2")).toBe(true);
    });

    it.each([["Bubble"], ["a b"], ["a_b"], ["-a"], ["a-"], ["a--b"], [""], ["a/b"], [".."], ["a".repeat(41)], ["é"]])(
      "refuses %j",
      (slug) => {
        expect(accepts(slug)).toBe(false);
      },
    );

    it("is lower case, digits and single hyphens: any other string is refused", () => {
      fc.assert(
        fc.property(fc.string(), (slug) => {
          expect(accepts(slug)).toBe(/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) && slug.length <= 40);
        }),
      );
    });
  });
});

describe("a hub's and a station's description", () => {
  it.each([
    ["Hubs", Hubs, hub],
    ["Stations", Stations, world],
  ] as const)("in %s", (_, schema, row) => {
    for (const [n, ok] of [
      [49, false],
      [50, true],
      [160, true],
      [161, false],
    ] as const)
      expect(schema.safeParse([{ ...row, description: "d".repeat(n) }]).success, `${String(n)} characters`).toBe(ok);
  });
});

describe("a date", () => {
  it.each([["2026-10-29"], ["2024-02-29"]])("takes a news date %j", (date) => {
    expect(News.safeParse([{ ...news, date }]).success).toBe(true);
  });

  it.each([
    ["2026-13-45"],
    ["tomorrow"],
    ["2026-02-30"],
    ["2025-02-29"],
    [""],
    ["2026-10-29T18:00:00.000Z"],
    ["29/10/2026"],
  ])("refuses a news date %j", (date) => {
    expect(News.safeParse([{ ...news, date }]).success).toBe(false);
  });

  it.each([["2026-11-01T18:00:00.000Z"], ["2026-11-01T18:00:00Z"]])("takes an event's start %j (UTC)", (start) => {
    expect(Events.safeParse([{ ...event, start }]).success).toBe(true);
  });

  it.each([
    ["2026-11-01"],
    ["tomorrow"],
    ["2026-13-01T18:00:00Z"],
    ["2026-11-01T18:00:00+01:00"],
    ["2026-11-01T18:00:00"],
    [""],
  ])("refuses an event's start %j", (start) => {
    expect(Events.safeParse([{ ...event, start }]).success).toBe(false);
  });
});

describe("a link", () => {
  const links = (href: string) => [
    Events.safeParse([{ ...event, link: href }]).success,
    Expedition.safeParse([{ ...stop, link: href }]).success,
    News.safeParse([{ ...news, link: href }]).success,
    Universes.safeParse([{ ...universe, default: true, rpc: href }]).success,
  ];

  it("may be https", () => {
    expect(links("https://gno.land/r/demo")).toEqual([true, true, true, true]);
  });

  it("is taken at the longest, DATA_CAPS.link, and refused one past it", () => {
    const base = "https://gno.land/";
    expect(links(base + "a".repeat(DATA_CAPS.link - base.length))).toEqual([true, true, true, true]);
    expect(links(base + "a".repeat(DATA_CAPS.link - base.length + 1))).toEqual([false, false, false, false]);
  });

  it.each([
    ["http://gno.land/"],
    ["javascript:alert(1)"],
    ["JavaScript:alert(1)"],
    [" javascript:alert(1)"],
    ["data:text/html,x"],
    ["//gno.land/"],
    ["/r/demo"],
    ["gno.land"],
    ["https://u:p@gno.land/"],
    ["https://gno.land/" + "a".repeat(2100)],
    [""],
  ])("is refused as %j", (href) => {
    expect(links(href)).toEqual([false, false, false, false]);
  });

  it("is refused when it is any scheme but https", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("http", "ftp", "javascript", "data", "ws", "file", "blob", "mailto"),
        fc.webPath(),
        (scheme, rest) => {
          expect(News.safeParse([{ ...news, link: `${scheme}://example.com${rest}` }]).success).toBe(false);
        },
      ),
    );
  });
});

describe("a news item's embed", () => {
  const YOUTUBE = "https://www.youtube-nocookie.com/embed/";
  const VIMEO = "https://player.vimeo.com/video/";
  const GIPHY = "https://giphy.com/embed/";
  const embeds = (embed: string) => News.safeParse([{ ...news, embed }]).success;

  it("names each accepted service's player by its path, 4g's: csp.ts's frame-src holds the same three", () => {
    expect([...EMBED_PREFIXES]).toEqual([YOUTUBE, VIMEO, GIPHY]);
  });

  it.each([[`${YOUTUBE}dQw4w9WgXcQ`], [`${VIMEO}123456`], [`${GIPHY}abc123`]])("takes %j", (embed) => {
    expect(embeds(embed)).toBe(true);
  });

  it.each([
    ["https://evil.example/embed/x"],
    ["https://www.youtube.com/embed/dQw4w9WgXcQ"],
    ["https://giphy.com.evil.example/embed/x"],
    ["https://evil.example/https://giphy.com/embed/x"],
    ["https://giphy.com@evil.example/embed/x"],
    ["http://giphy.com/embed/x"],
    ["https://giphy.com:8443/embed/x"],
    // The right host with the wrong path: the browser's frame-src would block each.
    ["https://www.youtube-nocookie.com/watch?x"],
    ["https://www.youtube-nocookie.com/embed/"],
    ["https://www.youtube-nocookie.com/embed/short"],
    ["https://player.vimeo.com/embed/123"],
    ["https://player.vimeo.com/video/abc"],
    ["https://player.vimeo.com/video/123?h=a"],
    ["https://giphy.com/anything"],
    ["https://giphy.com/gifs/abc123"],
    ["https://giphy.com/"],
    ["https://giphy.com"],
    ["https://giphy.com/embed/"],
    ["https://giphy.com/embed/abc123/more"],
    ["https://giphy.com/embed/abc123?x=1"],
    ["https://giphy.com/embed/abc123#x"],
    ["?x=1"],
    [""],
  ])("is refused as %j", (embed) => {
    expect(embeds(embed)).toBe(false);
  });
});

describe("Universes", () => {
  const one = { ...universe, default: true };
  const second = {
    ...universe,
    id: "gnoland",
    chainId: "gnoland-1",
    gnoweb: "https://gno.land",
    indexer: "https://indexer.gno.land/graphql/query",
    testnet: false,
  };

  it("takes one default universe, and refuses none, two, or two of one id", () => {
    expect(Universes.safeParse([one]).success).toBe(true);
    expect(Universes.safeParse([universe]).success).toBe(false);
    expect(Universes.safeParse([]).success).toBe(false);
    expect(Universes.safeParse([one, second]).success).toBe(true);
    expect(Universes.safeParse([one, { ...second, default: true }]).success).toBe(false);
    expect(Universes.safeParse([one, { ...universe, default: undefined }]).success).toBe(false);
  });

  it("refuses two universes of one id, even on two chains, and says which row and field", () => {
    const result = Universes.safeParse([one, { ...second, id: "onyx" }]);
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => [i.path, i.message])).toEqual([[[1, "id"], 'duplicate id "onyx"']]);
  });

  it("says which row and field refuse a second default, a repeated chain, and no default", () => {
    const issues = (rows: unknown[]) => Universes.safeParse(rows).error?.issues.map((i) => [i.path, i.message]);
    expect(issues([one, { ...second, default: true }])).toEqual([[[1, "default"], "a second default universe"]]);
    expect(issues([one, { ...second, chainId: "onyx-1" }])).toEqual([[[1, "chainId"], 'duplicate chainId "onyx-1"']]);
    expect(issues([universe])).toEqual([[[], "no universe is the default"]]);
  });

  it("refuses two universes of one chain", () => {
    expect(Universes.safeParse([one, { ...second, chainId: "onyx-1" }]).success).toBe(false);
  });

  it("refuses a default that is false: a flag is true or absent", () => {
    expect(Universes.safeParse([{ ...universe, default: false }]).success).toBe(false);
    expect(Universes.safeParse([{ ...universe, default: "true" }]).success).toBe(false);
  });

  it.each(["id", "name", "chainId", "rpc", "gnoweb", "indexer", "testnet"])(
    "refuses a universe with no %s",
    (field) => {
      const rest = Object.fromEntries(Object.entries(one).filter(([key]) => key !== field));
      expect(Universes.safeParse([rest]).success).toBe(false);
    },
  );

  it.each(["id", "name", "chainId", "rpc", "gnoweb", "indexer", "testnet", "default"])(
    "refuses a universe whose %s is a number",
    (field) => {
      expect(Universes.safeParse([{ ...one, [field]: 7 }]).success).toBe(false);
    },
  );

  it.each([["true"], ["false"], [1], [0], [null]])("refuses testnet as %j: a flag, never a word", (testnet) => {
    expect(Universes.safeParse([{ ...one, testnet }]).success).toBe(false);
  });

  // R-F3, F2952 (Alexis, 2026-10-31): a chain's gnoweb and indexer are data, https only, each its own kind of address.
  describe("gnoweb and indexer", () => {
    const fits = (field: string, value: string) => Universes.safeParse([{ ...one, [field]: value }]).success;

    it("takes https addresses: gnoweb's origin, the indexer's GraphQL endpoint", () => {
      expect(fits("gnoweb", "https://gno.land")).toBe(true);
      expect(fits("gnoweb", "https://gno.example:8443")).toBe(true);
      expect(fits("indexer", "https://indexer.gno.land/graphql/query")).toBe(true);
    });

    it.each(["gnoweb", "indexer"])("refuses an %s that is not https, has a user, or holds a space", (field) => {
      for (const value of [
        "http://gno.land",
        "ws://gno.land",
        "//gno.land",
        "gno.land",
        "javascript:alert(1)",
        "https://u@gno.land",
        "https://gno.land and more",
        "",
      ])
        expect(fits(field, value), value).toBe(false);
    });

    // gnoweb is an origin: a realm's path is put under it (gnowebLink), so a path, query or fragment would lead off it.
    it.each([
      "https://gno.land/",
      "https://gno.land/r",
      "https://gno.land?x=1",
      "https://gno.land#a",
      "https://GNO.land",
    ])("refuses a gnoweb that is not a bare lower-case origin: %s", (value) => {
      expect(fits("gnoweb", value)).toBe(false);
    });
  });

  it("refuses a field it does not know", () => {
    expect(Universes.safeParse([{ ...one, extra: 1 }]).success).toBe(false);
    expect(Universes.safeParse({}).success).toBe(false);
    expect(Universes.safeParse(["x"]).success).toBe(false);
  });

  it.each([
    ["name", DATA_CAPS.name],
    ["chainId", DATA_CAPS.key],
  ])("bounds %s: empty refused, its cap taken, one past it refused", (field, cap) => {
    expect(Universes.safeParse([{ ...one, [field]: "" }]).success).toBe(false);
    expect(Universes.safeParse([{ ...one, [field]: "x".repeat(cap) }]).success).toBe(true);
    expect(Universes.safeParse([{ ...one, [field]: "x".repeat(cap + 1) }]).success).toBe(false);
  });

  it("holds its cap of universes, and refuses one more", () => {
    const universes = (n: number) =>
      Array.from({ length: n }, (_, i) => ({
        ...universe,
        id: `u${String(i)}`,
        chainId: `c${String(i)}`,
        ...(i ? {} : { default: true }),
      }));
    expect(Universes.safeParse(universes(DATA_CAPS.universes)).success).toBe(true);
    expect(Universes.safeParse(universes(DATA_CAPS.universes + 1)).success).toBe(false);
  });
});

// Slice 6's 6a: the rules of the Earth's bubbles (ADR-0001 §7), one object, checked when the app builds. The bounds are
// the plan's proposal (docs/plans/slice-6.md §3): each is tested at the bound and one past it.
describe("BubbleRules", () => {
  const rules = {
    maxOnScreen: 6,
    showSeconds: 5,
    speakerDelaySeconds: 30,
    maxChars: 80,
    readLast: 500,
    maxAgeSeconds: 300,
  };
  const BOUNDS = [
    ["maxOnScreen", 1, 12],
    ["showSeconds", 1, 15],
    ["speakerDelaySeconds", 1, 120],
    ["maxChars", 20, 160],
    ["readLast", 1, 2000],
    ["maxAgeSeconds", 30, 86_400],
  ] as const;

  it("takes the rules ADR-0001 §7 starts with", () => {
    expect(BubbleRules.safeParse(rules).success).toBe(true);
  });

  it.each(BOUNDS)("takes %s from %d to %d, and refuses one past either end", (field, low, high) => {
    const ok = (value: number) => BubbleRules.safeParse({ ...rules, [field]: value }).success;
    expect([ok(low), ok(high), ok(low - 1), ok(high + 1)]).toEqual([true, true, false, false]);
  });

  it.each(BOUNDS)("refuses a %s that is zero, negative, fractional, a string, null, NaN or infinite", (field, low) => {
    const bad = (value: unknown) => BubbleRules.safeParse({ ...rules, [field]: value }).success;
    expect([bad(-1), bad(low + 0.5), bad(String(low)), bad(null), bad(Number.NaN), bad(Infinity)]).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
    ]);
    if (low > 0) expect(bad(0)).toBe(false);
  });

  it.each(BOUNDS)("refuses rules with no %s, and names it", (field) => {
    const rest = Object.fromEntries(Object.entries(rules).filter(([name]) => name !== field));
    const result = BubbleRules.safeParse(rest);
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.path)).toEqual([[field]]);
  });

  it("refuses a field it does not know, a list and a null", () => {
    expect(BubbleRules.safeParse({ ...rules, maxBubbles: 7 }).success).toBe(false);
    expect(BubbleRules.safeParse([rules]).success).toBe(false);
    expect(BubbleRules.safeParse(null).success).toBe(false);
  });

  it("names the field and what is wrong when a cap is drowned", () => {
    const result = BubbleRules.safeParse({ ...rules, maxOnScreen: 10_000 });
    expect(result.error?.issues.map((i) => i.path)).toEqual([["maxOnScreen"]]);
  });

  it("takes any integers inside the bounds", () => {
    fc.assert(
      fc.property(
        fc.record({
          maxOnScreen: fc.integer({ min: 1, max: 12 }),
          showSeconds: fc.integer({ min: 1, max: 15 }),
          speakerDelaySeconds: fc.integer({ min: 1, max: 120 }),
          maxChars: fc.integer({ min: 20, max: 160 }),
          readLast: fc.integer({ min: 1, max: 2000 }),
          maxAgeSeconds: fc.integer({ min: 30, max: 86_400 }),
        }),
        (row) => {
          expect(BubbleRules.safeParse(row).success).toBe(true);
        },
      ),
    );
  });
});

// 9e-1 (Alexis, 2026-11-06): a world's pinned actions, at most 3, each a call on one of the world's own realms, its texts capped as a
// proposal's; the client checks each against vm/qfuncs before it shows. A label is drawn on a button: no control or format character.
describe("a world's pinned actions", () => {
  const DAO = "gno.land/r/gov/dao";
  const vote = () => ({ label: "Vote", realm: DAO, function: "MustVoteOnProposalSimple", args: { pid: "15" } });
  const withActions = (actions: unknown, realms: unknown = [DAO]) => [{ ...hub, realms, actions }];

  it.each([
    ["Hubs", Hubs],
    ["Stations", Stations],
  ] as const)("in %s, takes one to three actions on the world's realms, and none at all", (_, schema) => {
    expect(schema.safeParse([hub]).success).toBe(true);
    expect(schema.safeParse(withActions([vote()])).success).toBe(true);
    const labelled = (n: number) => Array.from({ length: n }, (_, i) => ({ ...vote(), label: `Vote ${String(i)}` }));
    expect(schema.safeParse(withActions(labelled(3))).success).toBe(true);
    expect(schema.safeParse(withActions(labelled(4))).success).toBe(false);
    expect(schema.safeParse(withActions([])).success).toBe(false);
  });

  it("refuses an action on a realm the world is not about, and an action on a world with no realm", () => {
    expect(Hubs.safeParse(withActions([{ ...vote(), realm: "gno.land/r/demo/boards" }])).success).toBe(false);
    expect(Hubs.safeParse([{ ...hub, actions: [vote()] }]).success).toBe(false);
    expect(
      Hubs.safeParse(withActions([{ ...vote(), realm: "gno.land/r/demo/boards" }], [DAO, "gno.land/r/demo/boards"]))
        .success,
    ).toBe(true);
  });

  it("says which row, action and field refuse a realm outside the world's", () => {
    const parsed = Hubs.safeParse([
      hub,
      { ...hub, slug: "dao", realms: [DAO], actions: [vote(), { ...vote(), label: "Other", realm: "gno.land/r/x" }] },
    ]);
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.map((issue) => issue.path)).toEqual([[1, "actions", 1, "realm"]]);
  });

  it("refuses a realm that is no realm's path, a field it does not know, and a missing one", () => {
    expect(
      Hubs.safeParse(withActions([{ ...vote(), realm: "gno.land/p/demo/avl" }], ["gno.land/p/demo/avl"])).success,
    ).toBe(false);
    expect(Hubs.safeParse(withActions([{ ...vote(), why: "Closes tonight." }])).success).toBe(false);
    for (const key of ["label", "realm", "function", "args"] as const) {
      const action: Record<string, unknown> = vote();
      Reflect.deleteProperty(action, key);
      expect(Hubs.safeParse(withActions([action])).success, key).toBe(false);
    }
  });

  it("caps a label at 80 characters, a function's name at 128, an argument at 1000 and the arguments at 16, as a proposal's", () => {
    const ok = (action: Record<string, unknown>) => Hubs.safeParse(withActions([{ ...vote(), ...action }])).success;
    expect([ok({ label: "v".repeat(80) }), ok({ label: "v".repeat(81) }), ok({ label: "" })]).toEqual([
      true,
      false,
      false,
    ]);
    expect([ok({ function: "F".repeat(128) }), ok({ function: "F".repeat(129) }), ok({ function: "" })]).toEqual([
      true,
      false,
      false,
    ]);
    expect([
      ok({ args: { pid: "1".repeat(1000) } }),
      ok({ args: { pid: "1".repeat(1001) } }),
      ok({ args: { pid: "" } }),
    ]).toEqual([true, false, true]);
    const many = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`a${String(i)}`, "x"]));
    expect([ok({ args: many(16) }), ok({ args: many(17) }), ok({ args: {} })]).toEqual([true, false, true]);
    expect([
      ok({ args: { ["n".repeat(128)]: "x" } }),
      ok({ args: { ["n".repeat(129)]: "x" } }),
      ok({ args: { "": "x" } }),
    ]).toEqual([true, false, false]);
  });

  // Code points, not escapes typed here: a right-to-left override, a zero-width space and a line feed.
  it.each([[0x202e], [0x200b], [0x0a], [0x2066], [0x2069], [0xfeff], [0x2028], [0x00], [0x09], [0xad]])(
    "refuses a label holding the control, format or separator character %i",
    (point) => {
      const label = `Vote${String.fromCodePoint(point)}`;
      expect(Hubs.safeParse(withActions([{ ...vote(), label }])).success).toBe(false);
    },
  );

  it("refuses a label of spaces alone, two actions of one label, and a label that reads as Who's here", () => {
    expect(Hubs.safeParse(withActions([{ ...vote(), label: "   " }])).success).toBe(false);
    expect(Hubs.safeParse(withActions([vote(), { ...vote(), args: { pid: "16" } }])).success).toBe(false);
    expect(Hubs.safeParse(withActions([vote(), { ...vote(), label: "Vote on 16" }])).success).toBe(true);
    for (const label of ["Who's here", "who's here", " Who's here "])
      expect(Hubs.safeParse(withActions([{ ...vote(), label }])).success, label).toBe(false);
  });

  // The reviews of 9e-1: a label is compared as a reader sees it (case, spaces, apostrophes, compatibility forms), so no pill reads as
  // Who's here or as another pill; one that draws nothing is refused. Code points, not escapes typed here.
  it.each([
    ["a curly apostrophe", `Who${String.fromCodePoint(0x2019)}s here`],
    ["a modifier apostrophe", `Who${String.fromCodePoint(0x2bc)}s here`],
    ["a no-break space", `Who's${String.fromCodePoint(0xa0)}here`],
    ["two spaces", "Who's  here"],
    ["a fullwidth form", `Who's ${String.fromCodePoint(0xff48)}ere`],
  ])("refuses a label that reads as Who's here with %s", (_name, label) => {
    expect(Hubs.safeParse(withActions([{ ...vote(), label }])).success).toBe(false);
  });

  it.each([
    ["case", "vote"],
    ["a trailing space", "Vote "],
    ["a no-break space inside", `Vote${String.fromCodePoint(0xa0)}now`, `Vote now`],
  ])("refuses two labels that read the same but for %s", (_name, second, first = "Vote") => {
    expect(
      Hubs.safeParse(
        withActions([
          { ...vote(), label: first },
          { ...vote(), label: second },
        ]),
      ).success,
    ).toBe(false);
  });

  // The verifier of 9e-1: marks that draw nothing (a combining grapheme joiner, a variation selector, Khmer's inherent vowels) are
  // no Cf, so the control check missed them; any default-ignorable code point is read as nothing.
  it.each([
    ["blank", [0x34f]],
    ["blank", [0xfe0f]],
    ["blank", [0x17b4]],
    ["Who's here", [0x57, 0x68, 0x6f, 0x27, 0x73, 0x34f, 0x20, 0x68, 0x65, 0x72, 0x65]],
  ])("refuses a label of invisible marks that reads %s", (_reads, points) => {
    expect(Hubs.safeParse(withActions([{ ...vote(), label: String.fromCodePoint(...points) }])).success).toBe(false);
  });

  it("refuses a second label that is the first with an invisible mark inside", () => {
    const marked = String.fromCodePoint(0x56, 0x6f, 0x34f, 0x74, 0x65);
    expect(Hubs.safeParse(withActions([vote(), { ...vote(), label: marked }])).success).toBe(false);
  });

  it.each([[0x3164], [0x2800], [0x115f], [0xffa0]])(
    "refuses a label that draws nothing, code point %i alone",
    (point) => {
      expect(Hubs.safeParse(withActions([{ ...vote(), label: String.fromCodePoint(point) }])).success).toBe(false);
    },
  );

  // JSON.parse makes "__proto__" an own key, which a parsed object would drop: the argument would vanish unseen.
  it("refuses an argument named __proto__ from a file, which would vanish from the action", () => {
    const rows: unknown = JSON.parse(JSON.stringify(withActions([vote()])).replace('"pid"', '"__proto__"'));
    expect(Hubs.safeParse(rows).success).toBe(false);
  });
});
