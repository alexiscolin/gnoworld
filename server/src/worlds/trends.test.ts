import { Trends, type Presence, type Worlds } from "@gnoworld/schemas/indexer";
import { describe, expect, it, vi } from "vitest";
import { makeTrends, NEW_MS, TRENDING_LEAST, trendsRoutes, WINDOW_MOST_MS, type ChainTrend } from "./trends.ts";

// The ticker's trends (7t): what the worlds job's passes and who is here say, and nothing else. The busiest world is the one whose realms
// gained the most calls between two passes that both read them; a new world is one the list first showed in the last day; a rising world is
// a hub above its own 14 days. A trend whose data is missing, or too old, is no trend.
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const T1 = Date.parse("2026-11-04T09:00:00.000Z");
const T2 = T1 + 31 * MINUTE;
const at = (time: number) => new Date(time).toISOString();

type World = Worlds["worlds"][number];
const realm = (path: string, calls: number | null = 0) => ({
  path,
  deployer: null,
  deployerName: null,
  functions: [],
  imports: [],
  calls,
  callers: null,
  lastHeight: null,
});
const world = (id: string, paths: string[], over: Partial<World> = {}): World => ({
  id,
  namespace: id.split("/")[0] ?? id,
  realms: paths.map((path) => realm(path)),
  ...over,
});
const file = (time: number, worlds: World[]): Worlds => ({ version: 1, universe: "onyx", updated: at(time), worlds });
const calls = (entries: Record<string, number>) =>
  new Map(Object.entries(entries).map(([path, n]) => [path, { calls: n }]));

const POOL = "gno.land/r/gnoswap/pool";
const POOL1 = "gno.land/r/gnoswap/pool/v1";
const ROUTER = "gno.land/r/gnoswap/router";
const BLOG = "gno.land/r/alexis/blog";
const WORLDS = [world("alexis/blog", [BLOG]), world("gnoswap/pool", [POOL, POOL1]), world("gnoswap/router", [ROUTER])];

const busiestOf = (items: readonly ChainTrend[]) => items.find(({ kind }) => kind === "trending");
const newestOf = (items: readonly ChainTrend[]) => items.find(({ kind }) => kind === "new");

describe("the busiest world", () => {
  it("is the world whose realms gained the most calls between the last two passes, with its first realm, its title and the window", () => {
    const trends = makeTrends();
    trends.passed(file(T1, WORLDS), calls({ [POOL]: 10, [POOL1]: 5, [ROUTER]: 40, [BLOG]: 3 }));
    trends.passed(file(T2, WORLDS), calls({ [POOL]: 25, [POOL1]: 35, [ROUTER]: 60, [BLOG]: 4 }));
    expect(busiestOf(trends.chain())).toEqual({
      kind: "trending",
      world: "gnoswap/pool",
      realm: POOL,
      title: "pool",
      calls: 45,
      since: at(T1),
      at: at(T2),
    });
  });

  // Alexis, 2026-11-04 ("Un seuil maintenant", F4551): one call gained made a world TRENDING. Under the floor the ticker has no Trending
  // item rather than a weak one, and never a second world's smaller gain in its place.
  it(`is none under ${String(TRENDING_LEAST)} calls gained in the window, a world's realms counted together`, () => {
    expect(TRENDING_LEAST).toBe(5);
    const busiest = (pool: number, pool1: number) => {
      const trends = makeTrends();
      trends.passed(file(T1, WORLDS), calls({ [POOL]: 10, [POOL1]: 10, [ROUTER]: 10 }));
      trends.passed(file(T2, WORLDS), calls({ [POOL]: 10 + pool, [POOL1]: 10 + pool1, [ROUTER]: 13 }));
      return busiestOf(trends.chain());
    };
    expect(busiest(4, 0)).toBeUndefined();
    expect(busiest(2, 2)).toBeUndefined();
    expect(busiest(5, 0)).toMatchObject({ world: "gnoswap/pool", calls: 5 });
    expect(busiest(2, 3)).toMatchObject({ world: "gnoswap/pool", calls: 5 });
    const address = "g1ut6usp7lsurwsk9n3cyeu3ckn8ftw7mtufzhcz";
    const unnamed = [world(address, [`gno.land/r/${address}`]), world("gnoswap/router", [ROUTER])];
    const trends = makeTrends();
    trends.passed(file(T1, unnamed), calls({ [`gno.land/r/${address}`]: 1, [ROUTER]: 1 }));
    trends.passed(file(T2, unnamed), calls({ [`gno.land/r/${address}`]: 91, [ROUTER]: 4 }));
    expect(busiestOf(trends.chain()), "a world only an address names lends its gain to none").toBeUndefined();
  });

  it("is none on a first pass, for there is nothing to compare with", () => {
    const trends = makeTrends();
    trends.passed(file(T2, WORLDS), calls({ [POOL]: 40, [ROUTER]: 60 }));
    expect(busiestOf(trends.chain())).toBeUndefined();
  });

  it("counts only the realms both passes read: a realm left unread by either, the indexer silent, gains nothing", () => {
    const trends = makeTrends();
    trends.passed(file(T1, WORLDS), calls({ [POOL]: 10, [BLOG]: 1 }));
    trends.passed(file(T2, WORLDS), calls({ [POOL]: 12, [ROUTER]: 900, [BLOG]: 9 }));
    expect(busiestOf(trends.chain())).toMatchObject({ world: "alexis/blog", calls: 8 });
  });

  it("is none when no world gained a call", () => {
    const trends = makeTrends();
    trends.passed(file(T1, WORLDS), calls({ [POOL]: 10, [ROUTER]: 40 }));
    trends.passed(file(T2, WORLDS), calls({ [POOL]: 10, [ROUTER]: 40 }));
    expect(busiestOf(trends.chain())).toBeUndefined();
  });

  it("counts nothing for a realm whose count fell, an indexer read again, rather than take it from the world's gains", () => {
    const trends = makeTrends();
    trends.passed(file(T1, WORLDS), calls({ [POOL]: 50, [POOL1]: 1, [ROUTER]: 10 }));
    trends.passed(file(T2, WORLDS), calls({ [POOL]: 20, [POOL1]: 8, [ROUTER]: 16 }));
    expect(busiestOf(trends.chain())).toMatchObject({ world: "gnoswap/pool", calls: 7 });
  });

  it(`is none when the two passes stand more than ${String(WINDOW_MOST_MS / HOUR)} h apart: a stopped job is no hour's trend`, () => {
    expect(WINDOW_MOST_MS).toBe(2 * HOUR);
    const late = makeTrends();
    late.passed(file(T1, WORLDS), calls({ [POOL]: 10 }));
    late.passed(file(T1 + WINDOW_MOST_MS + 1, WORLDS), calls({ [POOL]: 20 }));
    expect(busiestOf(late.chain())).toBeUndefined();
    const inTime = makeTrends();
    inTime.passed(file(T1, WORLDS), calls({ [POOL]: 10 }));
    inTime.passed(file(T1 + WINDOW_MOST_MS, WORLDS), calls({ [POOL]: 20 }));
    expect(busiestOf(inTime.chain())).toMatchObject({ calls: 10 });
  });

  it("breaks a tie by the world's id, so two servers say the same", () => {
    const reversed = WORLDS.toReversed();
    const trends = makeTrends();
    trends.passed(file(T1, reversed), calls({ [ROUTER]: 1, [BLOG]: 1 }));
    trends.passed(file(T2, reversed), calls({ [ROUTER]: 6, [BLOG]: 6 }));
    expect(busiestOf(trends.chain())).toMatchObject({ world: "alexis/blog" });
  });

  it("is none when the second pass's time is not after the first's: a clock stepped back is no window", () => {
    for (const second of [T1, T1 - MINUTE]) {
      const trends = makeTrends();
      trends.passed(file(T1, WORLDS), calls({ [POOL]: 10 }));
      trends.passed(file(second, WORLDS), calls({ [POOL]: 20 }));
      expect(busiestOf(trends.chain())).toBeUndefined();
    }
  });

  it("reads the file it was given once, as the pass ends, however often its trends are asked (the route asks at each request)", () => {
    let reads = 0;
    const worlds = WORLDS;
    const counted = (time: number) => {
      const held = file(time, worlds);
      return Object.defineProperty({ ...held }, "worlds", {
        get: () => {
          reads += 1;
          return worlds;
        },
      });
    };
    const trends = makeTrends();
    trends.passed(counted(T1), calls({ [POOL]: 1 }));
    trends.passed(counted(T2), calls({ [POOL]: 8 }));
    const after = reads;
    for (let ask = 0; ask < 100; ask += 1) trends.chain();
    expect(reads).toBe(after);
    expect(busiestOf(trends.chain())).toMatchObject({ calls: 7 });
  });

  it("names the world as the cosmos's labels do, and passes over a world only an address names", () => {
    const address = "g1ut6usp7lsurwsk9n3cyeu3ckn8ftw7mtufzhcz";
    const worlds = [world(address, [`gno.land/r/${address}`]), world("gnoswap/router", [ROUTER])];
    const trends = makeTrends();
    trends.passed(file(T1, worlds), calls({ [`gno.land/r/${address}`]: 1, [ROUTER]: 1 }));
    trends.passed(file(T2, worlds), calls({ [`gno.land/r/${address}`]: 90, [ROUTER]: 7 }));
    expect(busiestOf(trends.chain())).toMatchObject({ world: "gnoswap/router", title: "router", calls: 6 });
  });

  it("compares with the pass just before, never an older one", () => {
    const trends = makeTrends();
    trends.passed(file(T1, WORLDS), calls({ [ROUTER]: 0 }));
    trends.passed(file(T2, WORLDS), calls({ [ROUTER]: 50 }));
    trends.passed(file(T2 + 30 * MINUTE, WORLDS), calls({ [ROUTER]: 57 }));
    expect(busiestOf(trends.chain())).toMatchObject({ calls: 7, since: at(T2) });
  });
});

describe("the new world", () => {
  it("is the world first seen most lately within the last day, with its first realm, its title and when it was first seen", () => {
    const worlds = [
      world("alexis/blog", [BLOG], { seen: at(T2 - 3 * HOUR) }),
      world("gnoswap/pool", [POOL], { seen: at(T2 - 2 * HOUR) }),
      world("gnoswap/router", [ROUTER], { seen: at(T2 - 2 * NEW_MS) }),
    ];
    const trends = makeTrends();
    trends.passed(file(T2, worlds), calls({}));
    expect(newestOf(trends.chain())).toEqual({
      kind: "new",
      world: "gnoswap/pool",
      realm: POOL,
      title: "pool",
      at: at(T2 - 2 * HOUR),
    });
  });

  it(`is none when no world was first seen in the last ${String(NEW_MS / HOUR)} h, nor when the list never said when`, () => {
    expect(NEW_MS).toBe(24 * HOUR);
    const trends = makeTrends();
    const worlds = [
      world("alexis/blog", [BLOG], { seen: null }),
      world("gnoswap/pool", [POOL]),
      world("gnoswap/router", [ROUTER], { seen: at(T2 - NEW_MS - 1) }),
    ];
    trends.passed(file(T2, worlds), calls({}));
    expect(newestOf(trends.chain())).toBeUndefined();
  });

  it("breaks a tie, worlds of one pass, by the most calls the file counts, then by id", () => {
    const seen = at(T2 - HOUR);
    const worlds = [
      world("alexis/blog", [BLOG], { seen }),
      world("gnoswap/pool", [POOL], { seen, realms: [realm(POOL, 7)] }),
      world("gnoswap/router", [ROUTER], { seen, realms: [realm(ROUTER, null)] }),
    ];
    const trends = makeTrends();
    trends.passed(file(T2, worlds), calls({}));
    expect(newestOf(trends.chain())).toMatchObject({ world: "gnoswap/pool" });
    const even = makeTrends();
    even.passed(file(T2, [world("gnoswap/router", [ROUTER], { seen }), worlds[0] ?? world("x", [])]), calls({}));
    expect(newestOf(even.chain())).toMatchObject({ world: "alexis/blog" });
  });

  it("passes over a new world only an address names, or with no realm, and takes the next newest", () => {
    const address = "g1ut6usp7lsurwsk9n3cyeu3ckn8ftw7mtufzhcz";
    const worlds = [
      world(address, [`gno.land/r/${address}`], { seen: at(T2 - MINUTE) }),
      world("alexis/blog", [], { seen: at(T2 - 2 * MINUTE) }),
      world("gnoswap/router", [ROUTER], { seen: at(T2 - HOUR) }),
    ];
    const trends = makeTrends();
    trends.passed(file(T2, worlds), calls({}));
    expect(newestOf(trends.chain())).toMatchObject({ world: "gnoswap/router", title: "router" });
  });

  it("keeps a world first seen exactly a day before the pass, and one first seen by the pass itself", () => {
    const keptAt = (seen: number) => {
      const trends = makeTrends();
      trends.passed(file(T2, [world("alexis/blog", [BLOG], { seen: at(seen) })]), calls({}));
      return newestOf(trends.chain())?.at;
    };
    expect(keptAt(T2 - NEW_MS)).toBe(at(T2 - NEW_MS));
    expect(keptAt(T2)).toBe(at(T2));
  });

  it("is never a world first seen after the pass that wrote the file", () => {
    const trends = makeTrends();
    trends.passed(file(T2, [world("alexis/blog", [BLOG], { seen: at(T2 + MINUTE) })]), calls({}));
    expect(newestOf(trends.chain())).toBeUndefined();
  });
});

const presence = (worlds: Presence["worlds"]) => () => ({ worlds });
const hub = (name: string, here: number, rise: number | null) => ({ world: name, here, perHour: 0, rise });

async function ask(options: Parameters<typeof trendsRoutes>[0]) {
  const response = await trendsRoutes(options).request("/");
  return {
    status: response.status,
    cache: response.headers.get("cache-control"),
    type: response.headers.get("content-type"),
    body: Trends.parse(await response.json()),
  };
}

const BUSIEST: ChainTrend = {
  kind: "trending",
  world: "gnoswap/pool",
  realm: POOL,
  title: "pool",
  calls: 45,
  since: at(T1),
  at: at(T2),
};
const NEWEST: ChainTrend = { kind: "new", world: "alexis/blog", realm: BLOG, title: "blog", at: at(T2 - HOUR) };

describe("GET /api/trends", () => {
  it("answers the busiest world, the rising one and the new one, in that order, public and kept a minute by any cache", async () => {
    const answer = await ask({
      chain: () => [NEWEST, BUSIEST],
      presence: presence([hub("earth", 4, null), hub("bubble", 12, 0.45)]),
      now: () => T2 + MINUTE,
    });
    expect(answer.status).toBe(200);
    expect(answer.cache).toBe("public, max-age=60");
    expect(answer.type).toMatch(/^application\/json/);
    expect(answer.body.items).toEqual([
      BUSIEST,
      { kind: "rising", world: "bubble", rise: 0.45, at: at(T2 + MINUTE) },
      NEWEST,
    ]);
  });

  it("names the hub that rises most against its own 14 days, more people breaking a tie, then the name", async () => {
    const rising = async (worlds: Presence["worlds"]) =>
      (await ask({ chain: () => [], presence: presence(worlds), now: () => T2 })).body.items;
    expect(await rising([hub("bubble", 12, 0.45), hub("govdao", 5, 2)])).toMatchObject([{ world: "govdao", rise: 2 }]);
    expect(await rising([hub("bubble", 12, 0.5), hub("govdao", 30, 0.5)])).toMatchObject([{ world: "govdao" }]);
    expect(await rising([hub("govdao", 9, 0.5), hub("bubble", 9, 0.5)])).toMatchObject([{ world: "bubble" }]);
    expect(await rising([hub("bubble", 12, null), hub("earth", 0, null)])).toEqual([]);
  });

  it("answers no trend, and never fails, with no worlds job and no count of who is here", async () => {
    const answer = await ask({ chain: () => [], now: () => T2 });
    expect(answer.status).toBe(200);
    expect(answer.body).toEqual({ items: [] });
  });

  it(`drops a busiest world whose pass is past ${String(WINDOW_MOST_MS / HOUR)} h, and a new world first seen past a day: the job stopped`, async () => {
    const items = async (now: number) => (await ask({ chain: () => [BUSIEST, NEWEST], now: () => now })).body.items;
    expect(await items(T2 + WINDOW_MOST_MS)).toEqual([BUSIEST, NEWEST]);
    expect(await items(T2 + WINDOW_MOST_MS + 1)).toEqual([NEWEST]);
    expect(await items(T2 - HOUR + NEW_MS)).toEqual([NEWEST]);
    expect(await items(T2 - HOUR + NEW_MS + 1)).toEqual([]);
  });

  it("drops a trend its schema refuses and answers the others: one odd world never blanks the ticker", async () => {
    const answer = await ask({
      chain: () => [{ ...BUSIEST, title: "" }, NEWEST],
      presence: presence([hub("bubble", 12, 0.45)]),
      now: () => T2,
    });
    expect(answer.body.items.map(({ kind }) => kind)).toEqual(["rising", "new"]);
  });

  it("names no rising hub whose rise is nothing, and takes the largest rise a count can be", async () => {
    const rising = async (worlds: Presence["worlds"]) =>
      (await ask({ chain: () => [], presence: presence(worlds), now: () => T2 })).body.items;
    expect(await rising([hub("bubble", 12, 0)])).toEqual([]);
    expect(await rising([hub("bubble", 12, 0), hub("govdao", 3, 1_000_000)])).toMatchObject([
      { world: "govdao", rise: 1_000_000 },
    ]);
  });

  it("reads who is here at each ask, and the chain's trends of the last pass, never a copy kept from before", async () => {
    const chain = vi.fn((): ChainTrend[] => []);
    const here = vi.fn(presence([]));
    const routes = trendsRoutes({ chain, presence: here, now: () => T2 });
    await routes.request("/");
    chain.mockReturnValue([BUSIEST]);
    const second = Trends.parse(await (await routes.request("/")).json());
    expect(second.items).toEqual([BUSIEST]);
    expect(here).toHaveBeenCalledTimes(2);
  });
});
