// The ticker's trends (slice 7, 7t), computed here so a phone reads a few items, never the worlds' file: the busiest world between the worlds
// job's last two passes, the hub rising most against its own 14 days (who is here, 7h), the world the chain's list first showed in the last
// day. Only from what was read: a realm either pass left unread gains nothing, a world with no name or page is passed over, an old trend is
// none. Served at GET /api/trends, each item through its schema.
import { labelName } from "@gnoworld/core";
import { Trend, type Presence, type Trends, type Worlds } from "@gnoworld/schemas/indexer";
import { Hono } from "hono";
import { callsOf } from "./shed.ts";

const HOUR = 3_600_000;
/** The most time between the two passes the busiest world compares, and its oldest pass: a stopped job is no hour's trend. */
export const WINDOW_MOST_MS = 2 * HOUR;
/** How long a world the list first showed stays new. */
export const NEW_MS = 24 * HOUR;

export type ChainTrend = Extract<Trend, { kind: "trending" | "new" }>;
/** The calls each realm's history gave in a pass, by its path. */
type PassReads = ReadonlyMap<string, { readonly calls: number }>;
type World = Worlds["worlds"][number];

export interface TrendKeeper {
  /** A pass wrote `worlds`, having read the calls of `read`'s realms. */
  passed: (worlds: Worlds, read: PassReads) => void;
  /** The chain's trends since the last pass. */
  chain: () => readonly ChainTrend[];
}

// What names a world and opens its page: its title as the cosmos's labels give it, and its first realm; none for a world with neither.
function placed(world: World): { title: string; realm: string } | undefined {
  const [title, realm] = [labelName(world.id), world.realms[0]?.path];
  return title === null || realm === undefined ? undefined : { title, realm };
}

// The calls a world's realms gained between two reads, over the realms both read; a count that fell gains nothing.
function gained(world: World, before: PassReads, now: PassReads): number {
  let sum = 0;
  for (const { path } of world.realms) {
    const [was, is] = [before.get(path)?.calls, now.get(path)?.calls];
    if (was !== undefined && is !== undefined && is > was) sum += is - was;
  }
  return sum;
}

const byId = (a: World, b: World): number => (a.id < b.id ? -1 : Number(a.id > b.id));

// Whether a world's gain goes before the best so far: more calls, or as many and an earlier id; a world that gained none never does.
const ahead = (world: { calls: number; id: string }, best: { calls: number; id: string } | undefined): boolean =>
  best === undefined ? world.calls > 0 : world.calls > best.calls || (world.calls === best.calls && world.id < best.id);

// The world that gained the most calls since the pass before, the first by id among equals; none past the window. The file's order is
// not relied on.
function busiest(worlds: Worlds, last: { at: string; read: PassReads } | undefined, read: PassReads): ChainTrend[] {
  if (last === undefined) return [];
  const window = Date.parse(worlds.updated) - Date.parse(last.at);
  if (!(window > 0 && window <= WINDOW_MOST_MS)) return [];
  let best: { calls: number; place: { title: string; realm: string }; id: string } | undefined;
  for (const world of worlds.worlds) {
    const calls = gained(world, last.read, read);
    const place = ahead({ calls, id: world.id }, best) ? placed(world) : undefined;
    if (place !== undefined) best = { calls, place, id: world.id };
  }
  return best === undefined
    ? []
    : [{ kind: "trending", world: best.id, ...best.place, calls: best.calls, since: last.at, at: worlds.updated }];
}

// The world first seen most lately within a day of the pass, the most called then the first by id among those seen at once.
function newest(worlds: Worlds): ChainTrend[] {
  const at = Date.parse(worlds.updated);
  const fresh = worlds.worlds.flatMap((world) => {
    const seen = Date.parse(world.seen ?? "");
    const place = seen <= at && at - seen <= NEW_MS ? placed(world) : undefined;
    return place === undefined ? [] : [{ world, seen, place, calls: callsOf(world) }];
  });
  const [first] = fresh.sort((a, b) => b.seen - a.seen || b.calls - a.calls || byId(a.world, b.world));
  if (first === undefined) return [];
  return [{ kind: "new", world: first.world.id, ...first.place, at: new Date(first.seen).toISOString() }];
}

/** The chain's trends of each pass, against the pass before it. ponytail: it keeps the last pass's reads, one entry a realm read, at most
 * the job's HISTORY_MAX_CALLS; past that cap each pass reads a run of realms that moves on, so the busiest world is the busiest of the realms
 * both passes read, a part of the chain's, and none once the runs no longer meet (from twice the cap). */
export function makeTrends(): TrendKeeper {
  let last: { at: string; read: PassReads } | undefined;
  let items: readonly ChainTrend[] = [];
  return {
    passed(worlds, read) {
      items = [...busiest(worlds, last, read), ...newest(worlds)];
      last = { at: worlds.updated, read };
    },
    chain: () => items,
  };
}

// The hub that rises most against its own 14 days, more people breaking a tie, then the name. A rise is core's riseOf, above a fifth or
// none; the route's schema refuses any other.
function risingOf({ worlds }: Presence, at: number): Trend[] {
  const rising = worlds.flatMap(({ world, here, rise }) => (rise === null ? [] : [{ world, here, rise }]));
  const [first] = rising.sort((a, b) => b.rise - a.rise || b.here - a.here || (a.world < b.world ? -1 : 1));
  return first === undefined
    ? []
    : [{ kind: "rising", world: first.world, rise: first.rise, at: new Date(at).toISOString() }];
}

// A chain's trend still current at `at`: the busiest world's pass within the window, a new world within its day.
const current = (item: ChainTrend, at: number): boolean =>
  at - Date.parse(item.at) <= (item.kind === "trending" ? WINDOW_MOST_MS : NEW_MS);

/** GET / answers the busiest world, the rising one and the new one, in that order, each that its schema takes; public, a minute. Who is here
 * builds its own answer at most once a minute, and the chain's trends are the last pass's: an ask costs no read. */
export function trendsRoutes(options: {
  chain: () => readonly ChainTrend[];
  presence?: (() => Presence) | undefined;
  now: () => number;
}): Hono {
  const routes = new Hono();
  routes.get("/", (c) => {
    const at = options.now();
    const chain = options.chain().filter((item) => current(item, at));
    const rising = options.presence === undefined ? [] : risingOf(options.presence(), at);
    const ranked = [chain.find(({ kind }) => kind === "trending"), ...rising, chain.find(({ kind }) => kind === "new")];
    const answer: Trends = { items: ranked.flatMap((item) => Trend.safeParse(item).data ?? []) };
    c.header("cache-control", "public, max-age=60");
    return c.json(answer);
  });
  return routes;
}
