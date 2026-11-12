// The most called worlds of the last 7 UTC days, computed once a worlds pass from the rollup's days and served from memory at
// GET /api/trending, never per request. A world's realms add up; worlds rank by people a day (the sum of each day's distinct callers, so a
// bot that calls a realm a thousand times a day is one), ties by calls then id; the top five, with how many worlds were called.
// ponytail: a person calling two realms of one world on one day counts twice, the rollup keeping callers per realm; per world if it matters.
import { EARTH, labelName } from "@gnoworld/core";
import { Trending, TRENDING_DAYS, TRENDING_MOST } from "@gnoworld/schemas/indexer";
import type { Worlds } from "@gnoworld/schemas/indexer";
import type { Hono } from "hono";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { lastRoutes } from "./lastRoutes.ts";

const DAY_MS = 86_400_000;

/** The first UTC day of the span that ends on `now`'s. */
export const sinceOf = (now: number): string => new Date(now - (TRENDING_DAYS - 1) * DAY_MS).toISOString().slice(0, 10);

const Rows = z.array(z.object({ realm: z.string(), calls: z.number(), people: z.number() }));

/** Each realm's calls and people over the days from `since` (a UTC day) in the rollup's state: people are the sum of each day's distinct callers. */
export const rowsSince = (db: DatabaseSync, since: string): Row[] =>
  Rows.parse(
    db
      .prepare(
        `SELECT d.realm AS realm, sum(d.calls) AS calls,
           (SELECT count(*) FROM rollup_day_callers c WHERE c.realm = d.realm AND c.day >= ?1) AS people
         FROM rollup_days d WHERE d.day >= ?1 GROUP BY d.realm`,
      )
      .all(since),
  );

interface Row {
  readonly realm: string;
  readonly calls: number;
  readonly people: number;
}

/** The ranking of `worlds` from each realm's `rows`; a world with no name or the Earth's id is passed over, as the ticker's are. */
export function trendingOf(worlds: Worlds, rows: readonly Row[], now: number): Trending {
  const by = new Map(rows.map((row) => [row.realm, row]));
  const ranked = worlds.worlds.flatMap((world) => {
    const title = labelName(world.id);
    const [first] = world.realms;
    const mine = world.realms.flatMap(({ path }) => by.get(path) ?? []);
    if (title === null || first === undefined || world.id === EARTH || mine.length === 0) return [];
    return [
      {
        world: world.id,
        title,
        realm: first.path,
        owner: first.deployer,
        calls: mine.reduce((sum, row) => sum + row.calls, 0),
        people: mine.reduce((sum, row) => sum + row.people, 0),
      },
    ];
  });
  ranked.sort((a, b) => b.people - a.people || b.calls - a.calls || (a.world < b.world ? -1 : 1));
  return { updated: new Date(now).toISOString(), called: ranked.length, items: ranked.slice(0, TRENDING_MOST) };
}

/** GET / answers the last ranking, public for a minute; a 404 while the job has made none. */
export const trendingRoutes = (last: () => Trending | undefined): Hono => lastRoutes(last);
