import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Trends, type Presence, type Worlds } from "@gnoworld/schemas/indexer";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { ChatWorld } from "./present.ts";
import { makeTrends, NEW_MS, WINDOW_MOST_MS, type ChainRead } from "./chainTrends.ts";
import { makePresence, type Signal } from "./presence.ts";
import { SCORE, type ChainWorld } from "./score.ts";
import { trendsRoutes } from "./trends.ts";

// The ticker's trends (7t, 7t3): Trending rises most against its own 14 days, chain and rooms together (Alexis, "Score relatif, chaîne +
// chat"); a signal counts at the median active world's, its side's floor met; one with no history is unknown, never zero. New: first seen in
// the last day; rising: a hub above its 14 days. A trend whose data is missing, or too old, is no trend.
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const T1 = Date.parse("2026-11-04T09:00:00.000Z");
const T2 = T1 + 31 * MINUTE;
const at = (time: number) => new Date(time).toISOString();
const A = "g10ragdr3cjqkael8rslpw4y6rlelhev4h0fswcx";
const B = "g1kfj7rq3cjqkael8rslpw4y6rlelhev4h0fswcx";
const C = "g1ut6usp7lsurwsk9n3cyeu3ckn8ftw7mtufzhcz";

const dir = mkdtempSync(join(tmpdir(), "gnoworld-trends-"));
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});
let made = 0;
const folderOf = (): string => {
  made += 1;
  const folder = join(dir, `t${String(made)}`);
  mkdirSync(folder);
  return folder;
};

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
// What a pass read of each realm: its transactions above the last pass's height, as their marks or a count of marks of its own, and who sent
// them; a realm given none was read with no height to count from.
const reads = (entries: Record<string, [number | string[], string[]] | null>) =>
  new Map(
    Object.entries(entries).map(([path, recent]) => {
      if (recent === null) return [path, {}] as const;
      const [given, callers] = recent;
      const marks =
        typeof given === "number" ? Array.from({ length: given }, (_, at) => `${path}#${String(at)}`) : given;
      return [path, { recent: { transactions: marks, callers } }] as const;
    }),
  );

const POOL = "gno.land/r/gnoswap/pool";
const POOL1 = "gno.land/r/gnoswap/pool/v1";
const ROUTER = "gno.land/r/gnoswap/router";
const BLOG = "gno.land/r/alexis/blog";
const WORLDS = [world("alexis/blog", [BLOG]), world("gnoswap/pool", [POOL, POOL1]), world("gnoswap/router", [ROUTER])];

// A habit's file holding `hours` past hours of `count` for the three worlds, the last one before T2's hour. The store keeps no world before
// its first count above none, as for who is here: a habit of none starts with one hour of 1.
function habitOf(hours: number, count: number) {
  const ids = ["gnoswap/pool", "gnoswap/router", "alexis/blog"];
  const filePath = join(folderOf(), "habit.json");
  const clock = { at: Math.floor(T2 / HOUR) * HOUR - hours * HOUR };
  const kept = makePresence({ file: filePath, now: () => clock.at });
  for (let hour = 0; hour < hours; hour += 1, clock.at += HOUR)
    kept.record(new Map(ids.map((id) => [id, hour === 0 && count === 0 ? 1 : count])));
  expect(kept.save()).toBe(true);
  return filePath;
}
// The keeper, with habits read from `files` on a clock the test moves to each pass.
function keeper(files: { transactions: string; addresses: string } = { transactions: "", addresses: "" }, start = T1) {
  const clock = { at: start };
  const logged: [string, unknown][] = [];
  const habits =
    files.transactions === ""
      ? undefined
      : {
          transactions: makePresence({ file: files.transactions, now: () => clock.at }),
          addresses: makePresence({ file: files.addresses, now: () => clock.at }),
        };
  const trends = makeTrends({
    ...(habits === undefined ? {} : { habits }),
    log: (event, fields) => logged.push([event, fields]),
  });
  const pass = (time: number, worlds: World[], read: ReturnType<typeof reads>) => {
    clock.at = time;
    trends.passed(file(time, worlds), read);
  };
  return { trends, pass, logged, habits };
}
const windowOf = (read: ChainRead, id: string) => read.worlds.find((each) => each.world === id);

describe("the chain's window", () => {
  it("counts each world's transactions to its realms between the last two passes and the different addresses that sent them, its realms together", () => {
    const { trends, pass } = keeper();
    pass(T1, WORLDS, reads({ [POOL]: null, [POOL1]: null, [ROUTER]: null, [BLOG]: null }));
    pass(T2, WORLDS, reads({ [POOL]: [3, [A, B]], [POOL1]: [2, [B, C]], [ROUTER]: [1, [A]], [BLOG]: [0, []] }));
    expect(windowOf(trends.chain(), "gnoswap/pool")).toEqual<ChainWorld>({
      world: "gnoswap/pool",
      place: { title: "pool", realm: POOL },
      transactions: { now: 10, usual: null, count: 5 },
      addresses: { now: 6, usual: null, count: 3 },
      since: at(T1),
      at: at(T2),
    });
    expect(windowOf(trends.chain(), "gnoswap/router")).toMatchObject({
      transactions: { count: 1 },
      addresses: { count: 1 },
    });
    expect(windowOf(trends.chain(), "alexis/blog")).toMatchObject({
      transactions: { count: 0 },
      addresses: { count: 0 },
    });
  });

  // 7t3's security review: one transaction calling K realms of a world counted K times. Its mark is the same in each realm's window.
  it("counts a transaction that calls several realms of a world once", () => {
    const { trends, pass } = keeper();
    pass(T1, WORLDS, reads({ [POOL]: null, [POOL1]: null }));
    pass(
      T2,
      WORLDS,
      reads({
        [POOL]: [
          [`5:${A}`, `6:${B}`],
          [A, B],
        ],
        [POOL1]: [
          [`5:${A}`, `6:${B}`],
          [A, B],
        ],
      }),
    );
    expect(windowOf(trends.chain(), "gnoswap/pool")).toMatchObject({
      transactions: { count: 2 },
      addresses: { count: 2 },
    });
  });

  // 7t3's review (high, reproduced): a failed pass, or a slower gather, makes a window longer than the habit's; read as counts, a steady
  // world's doubled and it trended. A window is read at its pace an hour; its count stays what the ticker says.
  it("reads a window at its pace an hour, so a steady world's window twice as long as usual is no rise", async () => {
    const files = { transactions: habitOf(48, 10), addresses: habitOf(48, 4) };
    const { trends, pass } = keeper(files, T1 - HOUR);
    pass(T1 - HOUR, WORLDS, reads({ [POOL]: null }));
    pass(T1 + HOUR, WORLDS, reads({ [POOL]: [20, ["g1a", "g1b", "g1c", "g1d", "g1e", "g1f", "g1g", "g1h"]] }));
    expect(windowOf(trends.chain(), "gnoswap/pool")).toMatchObject({
      transactions: { now: 10, usual: 10, count: 20 },
      addresses: { now: 4, usual: 4, count: 8 },
    });
    expect(await trendingOf({ chain: trends.chain().worlds, now: T1 + HOUR + MINUTE })).toBeUndefined();
  });

  it("has no window on a first pass, for there is nothing to compare with", () => {
    const { trends, pass } = keeper();
    pass(T2, WORLDS, reads({ [POOL]: [40, [A, B]] }));
    expect(trends.chain().worlds).toEqual([]);
  });

  it("knows a world only through the realms both passes read: one either left unread counts nothing, and a world with none is unknown, never zero", () => {
    const { trends, pass } = keeper();
    pass(T1, WORLDS, reads({ [POOL]: null, [BLOG]: null }));
    pass(T2, WORLDS, reads({ [POOL]: [2, [A]], [POOL1]: [9, [B]], [ROUTER]: [900, [A, B]], [BLOG]: null }));
    expect(windowOf(trends.chain(), "gnoswap/pool")).toMatchObject({
      transactions: { count: 2 },
      addresses: { count: 1 },
    });
    expect(windowOf(trends.chain(), "gnoswap/router"), "unread at the first pass").toBeUndefined();
    expect(windowOf(trends.chain(), "alexis/blog"), "read with no height to count from").toBeUndefined();
  });

  it(`has no window when the two passes stand more than ${String(WINDOW_MOST_MS / HOUR)} h apart, or the second is not after the first`, () => {
    expect(WINDOW_MOST_MS).toBe(2 * HOUR);
    for (const [second, kept] of [
      [T1 + WINDOW_MOST_MS + 1, false],
      [T1 + WINDOW_MOST_MS, true],
      [T1, false],
      [T1 - MINUTE, false],
    ] as const) {
      const { trends, pass } = keeper();
      pass(T1, WORLDS, reads({ [POOL]: null }));
      pass(second, WORLDS, reads({ [POOL]: [4, [A, B]] }));
      expect(windowOf(trends.chain(), "gnoswap/pool") !== undefined, `second pass at ${at(second)}`).toBe(kept);
    }
  });

  it("compares with the pass just before, never an older one", () => {
    const { trends, pass } = keeper();
    pass(T1, WORLDS, reads({ [ROUTER]: null }));
    pass(T2, WORLDS, reads({ [ROUTER]: [50, [A, B]] }));
    pass(T2 + 30 * MINUTE, WORLDS, reads({ [ROUTER]: [7, [A]] }));
    expect(windowOf(trends.chain(), "gnoswap/router")).toMatchObject({ transactions: { count: 7 }, since: at(T2) });
  });

  it("gives a world only an address names no place: it counts in the universe's middle, never as a trend's world", () => {
    const named = `gno.land/r/${C}`;
    const { trends, pass } = keeper();
    pass(T1, [world(C, [named])], reads({ [named]: null }));
    pass(T2, [world(C, [named])], reads({ [named]: [6, [A, B]] }));
    const unnamed = windowOf(trends.chain(), C);
    expect(unnamed).toMatchObject({ transactions: { count: 6 } });
    expect(unnamed?.place).toBeUndefined();
  });

  it("gives the chain's world of the namespace earth no place, for the page's Earth is not it: it is never a trend's world (F4550)", () => {
    const realmOfEarth = "gno.land/r/earth/v1";
    const worlds = [
      world("earth", [realmOfEarth], { seen: at(T2 - MINUTE) }),
      world("gnoswap/router", [ROUTER], { seen: at(T2 - HOUR) }),
    ];
    const { trends, pass } = keeper();
    pass(T1, worlds, reads({ [realmOfEarth]: null }));
    pass(T2, worlds, reads({ [realmOfEarth]: [6, [A, B]] }));
    expect(windowOf(trends.chain(), "earth")).toMatchObject({ place: undefined, transactions: { count: 6 } });
    expect(trends.chain().newest).toMatchObject([{ world: "gnoswap/router" }]);
  });

  it("keeps a window of none in a habit that holds the world: a quiet hour is data", () => {
    const files = { transactions: habitOf(48, 3), addresses: habitOf(48, 2) };
    const { trends, pass, habits } = keeper(files);
    pass(T1, WORLDS, reads({ [BLOG]: null }));
    pass(T2, WORLDS, reads({ [BLOG]: [0, []] }));
    const hour = Math.floor(T2 / HOUR) * HOUR;
    expect(habits?.transactions.history("alexis/blog").at(-1)).toEqual({ at: hour, people: 0 });
    expect(habits?.addresses.history("alexis/blog").at(-1)).toEqual({ at: hour, people: 0 });
    expect(windowOf(trends.chain(), "alexis/blog")).toMatchObject({ transactions: { count: 0, usual: 3 } });
  });

  it("lets a world into its habits only once its window clears the chain's floor: one address's calls never take a place there", () => {
    const empty = () => join(folderOf(), "habit.json");
    const { pass, habits } = keeper({ transactions: empty(), addresses: empty() });
    pass(T1, WORLDS, reads({ [POOL]: null, [ROUTER]: null, [BLOG]: null }));
    pass(T2, WORLDS, reads({ [POOL]: [2, [A, B]], [ROUTER]: [9, [A]], [BLOG]: [1, [A, B]] }));
    expect(habits?.transactions.history("gnoswap/pool")).toHaveLength(1);
    expect(habits?.transactions.history("gnoswap/router")).toEqual([]);
    expect(habits?.addresses.history("alexis/blog")).toEqual([]);
  });

  it("reads each world's usual window of its last 14 days from its habit, and keeps this window there, the busiest of each hour", () => {
    const files = { transactions: habitOf(48, 3), addresses: habitOf(48, 2) };
    const { trends, pass, habits } = keeper(files);
    pass(T1, WORLDS, reads({ [POOL]: null }));
    pass(T2, WORLDS, reads({ [POOL]: [7, [A, B, C]] }));
    expect(windowOf(trends.chain(), "gnoswap/pool")).toMatchObject({
      transactions: { now: 14, usual: 3, count: 7 },
      addresses: { now: 6, usual: 2, count: 3 },
    });
    const hour = Math.floor(T2 / HOUR) * HOUR;
    expect(habits?.transactions.history("gnoswap/pool").at(-1), "its pace an hour").toEqual({ at: hour, people: 14 });
    expect(
      makePresence({ file: files.addresses, now: () => T2 })
        .history("gnoswap/pool")
        .at(-1),
      "saved",
    ).toEqual({
      at: hour,
      people: 6,
    });
  });

  it("keeps no hour in a habit for a world the pass did not read, so an indexer's silence is no quiet hour", () => {
    const files = { transactions: habitOf(48, 3), addresses: habitOf(48, 2) };
    const { pass, habits } = keeper(files);
    pass(T1, WORLDS, reads({ [POOL]: null }));
    pass(T2, WORLDS, reads({ [POOL]: [7, [A, B]] }));
    expect(habits?.transactions.history("gnoswap/router").filter(({ people }) => people === 0)).toEqual([]);
    expect(habits?.transactions.history("gnoswap/router")).toHaveLength(48);
  });

  it("says when a habit's folder refuses its file, and goes on with the window", () => {
    const blocked = join(folderOf(), "a-file", "habit.json");
    writeFileSync(join(blocked, ".."), "a file where a folder should be");
    const { trends, pass, logged } = keeper({ transactions: blocked, addresses: blocked });
    pass(T1, WORLDS, reads({ [POOL]: null }));
    pass(T2, WORLDS, reads({ [POOL]: [7, [A, B]] }));
    expect(logged).toContainEqual(["alert", { error: "trends_write" }]);
    expect(windowOf(trends.chain(), "gnoswap/pool")).toMatchObject({ transactions: { count: 7 } });
  });

  it("says when one habit's folder refuses its file though the other takes it", () => {
    const blocked = join(folderOf(), "a-file", "habit.json");
    writeFileSync(join(blocked, ".."), "a file where a folder should be");
    const { pass, logged } = keeper({ transactions: blocked, addresses: join(folderOf(), "habit.json") });
    pass(T1, WORLDS, reads({ [POOL]: null }));
    pass(T2, WORLDS, reads({ [POOL]: [7, [A, B]] }));
    expect(logged).toContainEqual(["alert", { error: "trends_write" }]);
  });

  it("reads the file it was given once, as the pass ends, however often its trends are asked (the route asks at each request)", () => {
    let count = 0;
    const counted = (time: number) =>
      Object.defineProperty({ ...file(time, WORLDS) }, "worlds", {
        get: () => {
          count += 1;
          return WORLDS;
        },
      });
    const trends = makeTrends();
    trends.passed(counted(T1), reads({ [POOL]: null }));
    trends.passed(counted(T2), reads({ [POOL]: [7, [A, B]] }));
    const after = count;
    for (let ask = 0; ask < 100; ask += 1) trends.chain();
    expect(count).toBe(after);
    expect(windowOf(trends.chain(), "gnoswap/pool")).toMatchObject({ transactions: { count: 7 } });
  });
});

describe("the new world", () => {
  const newestOf = (read: ChainRead) => read.newest[0];

  it("is the world first seen most lately within the last day, with its first realm, its title and when it was first seen", () => {
    const worlds = [
      world("alexis/blog", [BLOG], { seen: at(T2 - 3 * HOUR) }),
      world("gnoswap/pool", [POOL], { seen: at(T2 - 2 * HOUR) }),
      world("gnoswap/router", [ROUTER], { seen: at(T2 - 2 * NEW_MS) }),
    ];
    const trends = makeTrends();
    trends.passed(file(T2, worlds), reads({}));
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
    trends.passed(file(T2, worlds), reads({}));
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
    trends.passed(file(T2, worlds), reads({}));
    expect(newestOf(trends.chain())).toMatchObject({ world: "gnoswap/pool" });
    const even = makeTrends();
    even.passed(file(T2, [world("gnoswap/router", [ROUTER], { seen }), worlds[0] ?? world("x", [])]), reads({}));
    expect(newestOf(even.chain())).toMatchObject({ world: "alexis/blog" });
  });

  it("passes over a new world only an address names, or with no realm, and takes the next newest", () => {
    const worlds = [
      world(C, [`gno.land/r/${C}`], { seen: at(T2 - MINUTE) }),
      world("alexis/blog", [], { seen: at(T2 - 2 * MINUTE) }),
      world("gnoswap/router", [ROUTER], { seen: at(T2 - HOUR) }),
    ];
    const trends = makeTrends();
    trends.passed(file(T2, worlds), reads({}));
    expect(newestOf(trends.chain())).toMatchObject({ world: "gnoswap/router", title: "router" });
  });

  it("keeps a world first seen exactly a day before the pass, and one first seen by the pass itself", () => {
    const keptAt = (seen: number) => {
      const trends = makeTrends();
      trends.passed(file(T2, [world("alexis/blog", [BLOG], { seen: at(seen) })]), reads({}));
      return newestOf(trends.chain())?.at;
    };
    expect(keptAt(T2 - NEW_MS)).toBe(at(T2 - NEW_MS));
    expect(keptAt(T2)).toBe(at(T2));
  });

  it("is never a world first seen after the pass that wrote the file", () => {
    const trends = makeTrends();
    trends.passed(file(T2, [world("alexis/blog", [BLOG], { seen: at(T2 + MINUTE) })]), reads({}));
    expect(newestOf(trends.chain())).toBeUndefined();
  });
});

const presence = (worlds: Presence["worlds"]) => () => ({ worlds });
const hub = (name: string, here: number, rise: number | null) => ({ world: name, here, perHour: 0, rise });
const signal = (now: number, usual: number | null): Signal => ({ now, usual });
// A chain world's window: its transactions and addresses, each [now, usual].
const chainOf = (
  id: string,
  transactions: [number, number | null],
  addresses: [number, number | null],
): ChainWorld => ({
  world: id,
  place: { title: id.split("/").at(-1) ?? id, realm: `gno.land/r/${id}` },
  transactions: { ...signal(...transactions), count: transactions[0] },
  addresses: { ...signal(...addresses), count: addresses[0] },
  since: at(T1),
  at: at(T2),
});
// A hub's rooms: its people here and messages an hour, each [now, usual].
const chatOf = (
  slug: string,
  here: [number, number | null],
  messages: [number, number | null] = [0, 0],
): ChatWorld => ({
  world: slug,
  here: signal(...here),
  messages: signal(...messages),
});
const NEWEST = { kind: "new", world: "alexis/blog", realm: BLOG, title: "blog", at: at(T2 - HOUR) } as const;

interface Asked {
  chain?: readonly ChainWorld[];
  newest?: ChainRead["newest"];
  chat?: readonly ChatWorld[];
  rising?: Presence["worlds"];
  hubs?: ReadonlyMap<string, string>;
  now?: number;
}
async function ask({ chain = [], newest = [], chat, rising, hubs = new Map(), now = T2 + MINUTE }: Asked) {
  const routes = trendsRoutes({
    chain: () => ({ worlds: chain, newest }),
    ...(rising === undefined ? {} : { presence: presence(rising) }),
    ...(chat === undefined ? {} : { chat: () => chat }),
    hubs,
    now: () => now,
  });
  const response = await routes.request("/");
  return {
    status: response.status,
    cache: response.headers.get("cache-control"),
    type: response.headers.get("content-type"),
    body: Trends.parse(await response.json()),
  };
}
const trendingOf = async (asked: Asked) => (await ask(asked)).body.items.find(({ kind }) => kind === "trending");

describe("Trending, a score relative to each world's habit", () => {
  it("counts from a sum of rises of 1, the chain's signals with 2 addresses and 2 transactions, the chat's with 2 people", () => {
    expect(SCORE).toEqual({ least: 1, addresses: 2, transactions: 2, people: 2 });
  });

  it("never comes from one address, five calls in one transaction, against a quiet habit", async () => {
    const files = { transactions: habitOf(48, 0), addresses: habitOf(48, 0) };
    const burst = keeper(files);
    burst.pass(T1, WORLDS, reads({ [POOL]: null, [ROUTER]: null }));
    burst.pass(T2, WORLDS, reads({ [POOL]: [1, [A]], [ROUTER]: [0, []] }));
    expect(windowOf(burst.trends.chain(), "gnoswap/pool"), "a quiet habit is known").toMatchObject({
      transactions: { now: 2, usual: 0, count: 1 },
      addresses: { now: 2, usual: 0, count: 1 },
    });
    expect(await trendingOf({ chain: burst.trends.chain().worlds })).toBeUndefined();
    const twice = keeper({ transactions: habitOf(48, 0), addresses: habitOf(48, 0) });
    twice.pass(T1, WORLDS, reads({ [POOL]: null }));
    twice.pass(T2, WORLDS, reads({ [POOL]: [5, [A]] }));
    expect(
      await trendingOf({ chain: twice.trends.chain().worlds }),
      "one address alone, five transactions",
    ).toBeUndefined();
    const two = keeper({ transactions: habitOf(48, 0), addresses: habitOf(48, 0) });
    two.pass(T1, WORLDS, reads({ [POOL]: null }));
    two.pass(T2, WORLDS, reads({ [POOL]: [2, [A, B]] }));
    expect(await trendingOf({ chain: two.trends.chain().worlds }), "two addresses, two transactions").toMatchObject({
      world: "gnoswap/pool",
      by: "transactions",
      count: 2,
    });
  });

  it("needs two addresses and two transactions, each, before the chain's rises count, however high they stand on a quiet habit", async () => {
    const alone = async (transactions: number, addresses: number) =>
      trendingOf({ chain: [chainOf("gnoswap/pool", [transactions, 0], [addresses, 0])] });
    expect(await alone(1, 1), "one transaction, one address").toBeUndefined();
    expect(await alone(5, 1), "one address alone").toBeUndefined();
    expect(await alone(1, 2), "a burst in one transaction").toBeUndefined();
    expect(await alone(2, 2)).toMatchObject({ world: "gnoswap/pool", by: "transactions", count: 2, rise: 2 });
  });

  it("lends nothing from a joined world's chain under its floor: its rooms' rise alone must reach the score", async () => {
    const hubs = new Map([["govdao", "gov/dao"]]);
    const chat = [chatOf("govdao", [7, 4])];
    expect(await trendingOf({ chain: [chainOf("gov/dao", [1, 0], [1, 0])], chat, hubs })).toBeUndefined();
    expect(await trendingOf({ chain: [chainOf("gov/dao", [2, 0], [2, 0])], chat, hubs })).toMatchObject({
      world: "gov/dao",
    });
  });

  it("is a small world that doubles against its habit, said by its transactions in the window", async () => {
    const chain = [
      chainOf("gnoswap/pool", [6, 3], [4, 2]),
      chainOf("big/dex", [100, 100], [40, 40]),
      chainOf("alexis/blog", [3, 3], [2, 2]),
    ];
    expect(await trendingOf({ chain })).toEqual({
      kind: "trending",
      by: "transactions",
      world: "gnoswap/pool",
      realm: "gno.land/r/gnoswap/pool",
      title: "pool",
      count: 6,
      rise: 1,
      since: at(T1),
      at: at(T2),
    });
  });

  it("is never a big world merely steady, however busy", async () => {
    expect(await trendingOf({ chain: [chainOf("big/dex", [100, 100], [40, 40])] })).toBeUndefined();
    expect(
      await trendingOf({ chain: [chainOf("big/dex", [119, 100], [47, 40])] }),
      "a fifth more on each",
    ).toBeUndefined();
  });

  it("is never a world under the median active world's, however it rises against its own habit", async () => {
    const tiny = chainOf("tiny/game", [3, 1], [2, 1]);
    const busy = [chainOf("big/dex", [100, 100], [40, 40]), chainOf("gnoswap/pool", [50, 50], [20, 20])];
    expect(await trendingOf({ chain: [tiny, ...busy] })).toBeUndefined();
    expect(await trendingOf({ chain: [tiny] }), "alone, it is its universe's middle").toMatchObject({
      world: "tiny/game",
    });
    const quiet = [chainOf("q/one", [0, 0], [0, 0]), chainOf("q/two", [0, 0], [0, 0])];
    expect(await trendingOf({ chain: [tiny, ...quiet] }), "a quiet world is no middle").toMatchObject({
      world: "tiny/game",
    });
  });

  it("counts a signal under its own median neither in the sum nor as the word, whatever its rise", async () => {
    const others = [chainOf("other/dex", [10, 10], [20, 20]), chainOf("third/game", [5, 5], [30, 30])];
    expect(await trendingOf({ chain: [chainOf("gnoswap/pool", [12, 6], [3, 1]), ...others] })).toMatchObject({
      world: "gnoswap/pool",
      by: "transactions",
      count: 12,
      rise: 1,
    });
    expect(
      await trendingOf({ chain: [chainOf("gnoswap/pool", [9, 6], [3, 1]), ...others] }),
      "half again, and an uncounted 2",
    ).toBeUndefined();
  });

  it("takes the upper of the two middles for an even number of worlds", async () => {
    const big = chainOf("big/dex", [100, 100], [40, 40]);
    expect(await trendingOf({ chain: [chainOf("gnoswap/pool", [6, 3], [4, 2]), big] })).toBeUndefined();
    expect(await trendingOf({ chat: [chatOf("bubble", [5, 1]), chatOf("earth", [12, 12])] })).toBeUndefined();
    expect(await trendingOf({ chat: [chatOf("bubble", [12, 4]), chatOf("earth", [5, 5])] })).toMatchObject({
      world: "bubble",
    });
  });

  it("never lets a peer's one-call worlds lower the middle: a world under its side's floor is no measure of the universe", async () => {
    const tiny = chainOf("tiny/game", [3, 1], [2, 1]);
    const busy = [chainOf("big/dex", [100, 100], [40, 40]), chainOf("gnoswap/pool", [50, 50], [20, 20])];
    const spam = Array.from({ length: 10 }, (_, at) => chainOf(`spam/r${String(at)}`, [1, 0], [1, 0]));
    expect(await trendingOf({ chain: [tiny, ...busy, ...spam] })).toBeUndefined();
  });

  it("never lets a room with no message, nor one with a single person, lower its signal's middle", async () => {
    const steady = (slug: string) => chatOf(slug, [3, 3], [0, 0]);
    const quiet = [
      chatOf("bubble", [3, 3], [30, 10]),
      chatOf("govdao", [3, 3], [60, 60]),
      steady("earth"),
      steady("dex"),
    ];
    expect(await trendingOf({ chat: quiet }), "two rooms with no message").toBeUndefined();
    const lone = (slug: string) => chatOf(slug, [1, 0]);
    const people = [chatOf("bubble", [3, 1]), chatOf("govdao", [5, 5]), lone("earth"), lone("dex")];
    expect(await trendingOf({ chat: people }), "two rooms of one person").toBeUndefined();
    expect(await trendingOf({ chat: [chatOf("bubble", [3, 1]), lone("earth"), lone("dex")] })).toMatchObject({
      world: "bubble",
    });
  });

  it("ranks by the score before the key: a higher sum wins, wherever it stands and whatever its id", async () => {
    const low = chainOf("alexis/blog", [6, 3], [4, 2]);
    const high = chainOf("zeta/dex", [12, 3], [8, 2]);
    const middle = chainOf("mid/game", [6, 6], [4, 4]);
    expect(await trendingOf({ chain: [low, high, middle] })).toMatchObject({ world: "zeta/dex" });
    expect(await trendingOf({ chain: [high, low, middle] })).toMatchObject({ world: "zeta/dex" });
  });

  it("counts a world with no habit yet in the middle, for its activity is real, though it cannot trend itself", async () => {
    const fresh = chainOf("fresh/dex", [1000, null], [300, null]);
    expect(await trendingOf({ chain: [fresh, chainOf("gnoswap/pool", [6, 3], [4, 2])] })).toBeUndefined();
  });

  it("counts a hub and its realms once in each signal's middle", async () => {
    const hubs = new Map([["govdao", "gov/dao"]]);
    const chain = [chainOf("gov/dao", [3, 3], [2, 2])];
    const chat = [chatOf("govdao", [7, 7]), chatOf("earth", [5, 1]), chatOf("bubble", [4, 4])];
    expect(await trendingOf({ chain, chat, hubs })).toMatchObject({ by: "here", world: "earth", count: 5 });
  });

  it("is a world whose chat surges with no transaction, by its people here", async () => {
    expect(
      await trendingOf({
        chain: [chainOf("big/dex", [100, 100], [40, 40])],
        chat: [chatOf("bubble", [12, 4], [240, 150]), chatOf("earth", [5, 5], [60, 60])],
      }),
    ).toEqual({ kind: "trending", by: "here", world: "bubble", count: 12, rise: 2, at: at(T2 + MINUTE) });
  });

  it("names the strongest signal: messages an hour, or the different addresses", async () => {
    expect(await trendingOf({ chat: [chatOf("bubble", [6, 4], [600, 100])] })).toMatchObject({
      by: "messages",
      world: "bubble",
      count: 600,
      rise: 5,
    });
    expect(await trendingOf({ chain: [chainOf("gnoswap/pool", [12, 10], [8, 2])] })).toMatchObject({
      by: "addresses",
      count: 8,
      rise: 3,
    });
  });

  it("sums the rises of the signals that count: two signals each half again beat one four fifths again", async () => {
    const chain = [chainOf("one/rise", [9, 5], [4, 4]), chainOf("two/rises", [9, 6], [6, 4])];
    expect(await trendingOf({ chain })).toMatchObject({ world: "two/rises" });
    expect(await trendingOf({ chain: [chainOf("half/again", [9, 6], [4, 4])] }), "half again alone").toBeUndefined();
    expect(
      await trendingOf({ chain: [chainOf("one/rise", [9, 5], [4, 4])] }),
      "four fifths again alone",
    ).toBeUndefined();
  });

  it("counts a fall as no rise, never as a debt: a world rising on one signal and falling on another still trends", async () => {
    expect(await trendingOf({ chain: [chainOf("gnoswap/pool", [12, 5], [2, 10])] })).toMatchObject({
      world: "gnoswap/pool",
      by: "transactions",
    });
  });

  it("reads a signal with no history as unknown, never as a habit of zero", async () => {
    expect(await trendingOf({ chain: [chainOf("new/dex", [50, null], [10, null])] })).toBeUndefined();
    expect(await trendingOf({ chat: [chatOf("bubble", [12, null], [240, null])] })).toBeUndefined();
    expect(
      await trendingOf({ chain: [chainOf("gnoswap/pool", [6, 3], [4, null])] }),
      "a known signal still counts beside an unknown one",
    ).toMatchObject({ by: "transactions", rise: 1 });
  });

  it("reads no presence and no worlds job as unknown: the other side alone still trends", async () => {
    const chain = [chainOf("gnoswap/pool", [6, 3], [4, 2])];
    expect(await trendingOf({ chain })).toMatchObject({ world: "gnoswap/pool" });
    expect(await trendingOf({ chat: [chatOf("bubble", [12, 4])] })).toMatchObject({ world: "bubble" });
    expect((await ask({})).body.items).toEqual([]);
  });

  it("never trends by the chat with fewer than 2 people here, whatever one writes", async () => {
    expect(await trendingOf({ chat: [chatOf("bubble", [1, 0], [600, 0])] })).toBeUndefined();
    expect(await trendingOf({ chat: [chatOf("bubble", [2, 0], [600, 0])] })).toMatchObject({ world: "bubble" });
  });

  it("reads a hub's rooms and its realms as one world: two rises too small apart trend together", async () => {
    const chain = [chainOf("gov/dao", [8, 5], [3, 3])];
    const chat = [chatOf("govdao", [7, 4], [40, 40])];
    expect(await trendingOf({ chain, chat })).toBeUndefined();
    expect(await trendingOf({ chain, chat, hubs: new Map([["govdao", "gov/dao"]]) })).toMatchObject({
      by: "here",
      world: "govdao",
      count: 7,
      rise: 0.75,
    });
  });

  it("never reads the Earth's rooms with a chain world of the namespace earth, which the page's Earth is not (F4550)", async () => {
    const chain = [chainOf("earth", [8, 5], [3, 3])];
    const chat = [chatOf("earth", [7, 4], [40, 40])];
    expect(await trendingOf({ chain, chat, hubs: new Map([["govdao", "gov/dao"]]) })).toBeUndefined();
  });

  it("never names a world only an address names, though it counts in the universe's middle, and takes the next", async () => {
    const unnamed: ChainWorld = { ...chainOf(C, [90, 10], [30, 3]), place: undefined };
    const pool = chainOf("gnoswap/pool", [6, 3], [4, 2]);
    expect(await trendingOf({ chain: [unnamed] })).toBeUndefined();
    expect(await trendingOf({ chain: [unnamed, pool] }), "under the unnamed world's counts").toBeUndefined();
    const next = [unnamed, chainOf("gnoswap/pool", [12, 6], [8, 4]), chainOf("alexis/blog", [3, 3], [2, 2])];
    expect(await trendingOf({ chain: next })).toMatchObject({ world: "gnoswap/pool" });
  });

  it("breaks a tie by the world's id, a hub's rooms alone by their slug, so two servers say the same", async () => {
    const chain = [chainOf("gnoswap/router", [6, 3], [4, 2]), chainOf("alexis/blog", [6, 3], [4, 2])];
    expect(await trendingOf({ chain })).toMatchObject({ world: "alexis/blog" });
    expect(await trendingOf({ chain: chain.toReversed() })).toMatchObject({ world: "alexis/blog" });
    const chat = [chatOf("bubble", [8, 4], [40, 20])];
    expect(await trendingOf({ chain: [chainOf("alexis/blog", [6, 3], [4, 2])], chat })).toMatchObject({
      world: "alexis/blog",
    });
    expect(await trendingOf({ chain: [chainOf("zeta/dex", [6, 3], [4, 2])], chat })).toMatchObject({ world: "bubble" });
  });

  it("says two equal rises by the first of transactions, addresses, people here, messages", async () => {
    expect(await trendingOf({ chain: [chainOf("gnoswap/pool", [6, 3], [4, 2])] })).toMatchObject({
      by: "transactions",
    });
    expect(await trendingOf({ chat: [chatOf("bubble", [8, 4], [40, 20])] })).toMatchObject({ by: "here" });
    const hubs = new Map([["govdao", "gov/dao"]]);
    expect(
      await trendingOf({
        chain: [chainOf("gov/dao", [4, 4], [6, 3])],
        chat: [chatOf("govdao", [8, 4], [40, 20])],
        hubs,
      }),
    ).toMatchObject({ by: "addresses", world: "gov/dao" });
  });

  it(`drops a chain's window past ${String(WINDOW_MOST_MS / HOUR)} h: a stopped job is unknown, its rooms still read`, async () => {
    const chain = [chainOf("gnoswap/pool", [6, 3], [4, 2])];
    expect(await trendingOf({ chain, now: T2 + WINDOW_MOST_MS })).toMatchObject({ world: "gnoswap/pool" });
    expect(await trendingOf({ chain, now: T2 + WINDOW_MOST_MS + 1 })).toBeUndefined();
    const hubs = new Map([["bubble", "gnoswap/pool"]]);
    expect(
      await trendingOf({ chain, chat: [chatOf("bubble", [12, 4])], hubs, now: T2 + WINDOW_MOST_MS + 1 }),
    ).toMatchObject({
      by: "here",
      world: "bubble",
    });
  });
});

describe("GET /api/trends", () => {
  it("answers the Trending world, the rising one and the new one, in that order, public and kept a minute by any cache", async () => {
    const answer = await ask({
      chain: [chainOf("gnoswap/pool", [6, 3], [4, 2])],
      newest: [NEWEST],
      rising: [hub("earth", 4, null), hub("bubble", 12, 0.45)],
    });
    expect(answer.status).toBe(200);
    expect(answer.cache).toBe("public, max-age=60");
    expect(answer.type).toMatch(/^application\/json/);
    expect(answer.body.items.map(({ kind, world }) => [kind, world])).toEqual([
      ["trending", "gnoswap/pool"],
      ["rising", "bubble"],
      ["new", "alexis/blog"],
    ]);
    expect(answer.body.items[1]).toEqual({ kind: "rising", world: "bubble", rise: 0.45, at: at(T2 + MINUTE) });
  });

  it("names the hub that rises most against its own 14 days, more people breaking a tie, then the name", async () => {
    const rising = async (worlds: Presence["worlds"]) => (await ask({ rising: worlds })).body.items;
    expect(await rising([hub("bubble", 12, 0.45), hub("govdao", 5, 2)])).toMatchObject([{ world: "govdao", rise: 2 }]);
    expect(await rising([hub("bubble", 12, 0.5), hub("govdao", 30, 0.5)])).toMatchObject([{ world: "govdao" }]);
    expect(await rising([hub("govdao", 9, 0.5), hub("bubble", 9, 0.5)])).toMatchObject([{ world: "bubble" }]);
    expect(await rising([hub("bubble", 12, null), hub("earth", 0, null)])).toEqual([]);
  });

  it("names as rising no world already Trending, by its rooms or by its realms, and takes the next", async () => {
    const rising = [hub("bubble", 12, 2), hub("govdao", 7, 0.75), hub("earth", 5, 0.25)];
    const byChat = await ask({ chat: [chatOf("bubble", [12, 12], [240, 60])], rising });
    expect(byChat.body.items.map(({ kind, world }) => [kind, world])).toEqual([
      ["trending", "bubble"],
      ["rising", "govdao"],
    ]);
    const byChain = await ask({
      chain: [chainOf("gov/dao", [8, 3], [4, 2])],
      chat: [chatOf("govdao", [7, 4])],
      hubs: new Map([["govdao", "gov/dao"]]),
      rising: [hub("govdao", 7, 0.75), hub("earth", 5, 0.25)],
    });
    expect(byChain.body.items.map(({ kind, world }) => [kind, world])).toEqual([
      ["trending", "gov/dao"],
      ["rising", "earth"],
    ]);
  });

  // The chief, 2026-11-04, after 7t3's design review: a world Trending by its people says "+N% this hour" itself, the video's one item of the
  // form (frame 6); a Rising item beside it, maybe a larger rise, would contradict it.
  it("answers no Rising item beside a world Trending by its people, and one beside a world Trending by anything else", async () => {
    const rising = [hub("bubble", 12, 2), hub("govdao", 7, 0.75)];
    const kinds = async (asked: Asked) => (await ask({ ...asked, rising })).body.items.map(({ kind }) => kind);
    expect(await kinds({ chat: [chatOf("earth", [12, 4])] })).toEqual(["trending"]);
    expect(await kinds({ chat: [chatOf("earth", [12, 12], [240, 60])] })).toEqual(["trending", "rising"]);
    expect(await kinds({ chain: [chainOf("gnoswap/pool", [6, 3], [4, 2])] })).toEqual(["trending", "rising"]);
  });

  // 7t3's review (medium): every ask scored every world again, up to 10,000 windows, and one address's burst of asks held the event loop.
  it("scores once for one chain read and one answer of who is here, however often asked, and again when either changes or a window ages", async () => {
    let reads = 0;
    const worlds = [chainOf("gnoswap/pool", [6, 3], [4, 2])];
    const read: ChainRead = {
      newest: [],
      get worlds() {
        reads += 1;
        return worlds;
      },
    };
    const rooms = { now: [chatOf("earth", [3, 3])] };
    const clock = { at: T2 + MINUTE };
    const routes = trendsRoutes({ chain: () => read, chat: () => rooms.now, now: () => clock.at });
    const items = async () => Trends.parse(await (await routes.request("/")).json()).items;
    expect(await items()).toMatchObject([{ kind: "trending", world: "gnoswap/pool" }]);
    const once = reads;
    for (let ask = 0; ask < 50; ask += 1) await items();
    expect(reads).toBe(once);
    rooms.now = [chatOf("earth", [3, 3])];
    await items();
    expect(reads, "a new answer of who is here").toBe(once + 1);
    clock.at = T2 + WINDOW_MOST_MS + 1;
    expect(await items(), "the window aged").toEqual([]);
  });

  it("answers no trend, and never fails, with no worlds job and no count of who is here", async () => {
    const routes = trendsRoutes({ chain: () => ({ worlds: [], newest: [] }), now: () => T2 });
    const response = await routes.request("/");
    expect(response.status).toBe(200);
    expect(Trends.parse(await response.json())).toEqual({ items: [] });
  });

  it("drops a new world first seen past a day: the job stopped", async () => {
    const items = async (now: number) => (await ask({ newest: [NEWEST], now })).body.items;
    expect(await items(T2 - HOUR + NEW_MS)).toEqual([NEWEST]);
    expect(await items(T2 - HOUR + NEW_MS + 1)).toEqual([]);
  });

  it("drops a trend its schema refuses and answers the others: one odd world never blanks the ticker", async () => {
    const odd: ChainWorld = { ...chainOf("gnoswap/pool", [6, 3], [4, 2]), place: { title: "", realm: POOL } };
    const answer = await ask({ chain: [odd], newest: [NEWEST], rising: [hub("bubble", 12, 0.45)] });
    expect(answer.body.items.map(({ kind }) => kind)).toEqual(["rising", "new"]);
  });

  it("names no rising hub whose rise is nothing, and takes the largest rise a count can be", async () => {
    const rising = async (worlds: Presence["worlds"]) => (await ask({ rising: worlds })).body.items;
    expect(await rising([hub("bubble", 12, 0)])).toEqual([]);
    expect(await rising([hub("bubble", 12, 0), hub("govdao", 3, 1_000_000)])).toMatchObject([
      { world: "govdao", rise: 1_000_000 },
    ]);
  });

  it("reads who is here and the chain's last pass at each ask, never a copy kept from before", async () => {
    const chain = vi.fn((): ChainRead => ({ worlds: [], newest: [] }));
    const chat = vi.fn((): readonly ChatWorld[] => []);
    const here = vi.fn(presence([]));
    const routes = trendsRoutes({ chain, chat, presence: here, now: () => T2 + MINUTE });
    await routes.request("/");
    chain.mockReturnValue({ worlds: [chainOf("gnoswap/pool", [6, 3], [4, 2])], newest: [] });
    const second = Trends.parse(await (await routes.request("/")).json());
    expect(second.items).toMatchObject([{ kind: "trending", world: "gnoswap/pool" }]);
    expect(here).toHaveBeenCalledTimes(2);
    expect(chat).toHaveBeenCalledTimes(2);
  });
});
