// The ticker's trends (slice 7, 7t, 7t3), computed here so a phone reads a few items, never the worlds' file: the world Trending against its
// own 14 days by chain and chat together (score.ts), the hub rising most against its own 14 days (who is here, 7h), the world the chain's
// list first showed in the last day (chainTrends.ts). An old trend is none. Served at GET /api/trends, each item through its schema.
import { Trend, type Presence, type Trends } from "@gnoworld/schemas/indexer";
import { Hono } from "hono";
import { NEW_MS, WINDOW_MOST_MS, type ChainRead } from "./chainTrends.ts";
import type { ChatWorld } from "./present.ts";
import { trendingOf } from "./score.ts";

// The hub that rises most against its own 14 days, more people breaking a tie, then the name, other than the one Trending. A rise is core's
// riseOf, above a fifth or none; the route's schema refuses any other.
function risingOf({ worlds }: Presence, at: number, trending: string | undefined): Trend[] {
  const rising = worlds.flatMap(({ world, here, rise }) =>
    rise === null || world === trending ? [] : [{ world, here, rise }],
  );
  const [first] = rising.sort((a, b) => b.rise - a.rise || b.here - a.here || (a.world < b.world ? -1 : 1));
  return first === undefined
    ? []
    : [{ kind: "rising", world: first.world, rise: first.rise, at: new Date(at).toISOString() }];
}

/** GET / answers the Trending world, the rising one and the new one, in that order, each that its schema takes; public, a minute. Who is here
 * builds its own answer at most once a minute, and the chain's part is the last pass's: an ask costs no read. */
export function trendsRoutes(options: {
  chain: () => ChainRead;
  presence?: (() => Presence) | undefined;
  /** Each world's rooms with their usual (present.ts). */
  chat?: (() => readonly ChatWorld[]) | undefined;
  /** Each hub's world, by its slug (hubs.json). */
  hubs?: ReadonlyMap<string, string> | undefined;
  now: () => number;
}): Hono {
  const routes = new Hono();
  routes.get("/", (c) => {
    const at = options.now();
    const { worlds, newest: fresh } = options.chain();
    const chain = worlds.filter((world) => at - Date.parse(world.at) <= WINDOW_MOST_MS);
    const trending = trendingOf(
      { chain, chat: options.chat?.() ?? [], hubs: options.hubs ?? new Map<string, string>() },
      at,
    );
    // A world Trending by its people says its rise this hour itself: a Rising item beside it would say a second (the chief, 2026-11-04).
    const byPeople = trending?.item.kind === "trending" && trending.item.by === "here";
    const rising = options.presence === undefined || byPeople ? [] : risingOf(options.presence(), at, trending?.rooms);
    const ranked = [trending?.item, ...rising, fresh.find((item) => at - Date.parse(item.at) <= NEW_MS)];
    const answer: Trends = { items: ranked.flatMap((item) => Trend.safeParse(item).data ?? []) };
    c.header("cache-control", "public, max-age=60");
    return c.json(answer);
  });
  return routes;
}
