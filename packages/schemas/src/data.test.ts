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
  const second = { ...universe, id: "gnoland", chainId: "gnoland-1", testnet: false };

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

  it.each(["id", "name", "chainId", "rpc", "testnet"])("refuses a universe with no %s", (field) => {
    const rest = Object.fromEntries(Object.entries(one).filter(([key]) => key !== field));
    expect(Universes.safeParse([rest]).success).toBe(false);
  });

  it.each(["id", "name", "chainId", "rpc", "testnet", "default"])(
    "refuses a universe whose %s is a number",
    (field) => {
      expect(Universes.safeParse([{ ...one, [field]: 7 }]).success).toBe(false);
    },
  );

  it.each([["true"], ["false"], [1], [0], [null]])("refuses testnet as %j: a flag, never a word", (testnet) => {
    expect(Universes.safeParse([{ ...one, testnet }]).success).toBe(false);
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
  const rules = { maxOnScreen: 6, showSeconds: 5, speakerDelaySeconds: 30, maxChars: 80, readLast: 500 };
  const BOUNDS = [
    ["maxOnScreen", 1, 12],
    ["showSeconds", 1, 15],
    ["speakerDelaySeconds", 1, 120],
    ["maxChars", 20, 160],
    ["readLast", 1, 2000],
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
        }),
        (row) => {
          expect(BubbleRules.safeParse(row).success).toBe(true);
        },
      ),
    );
  });
});
