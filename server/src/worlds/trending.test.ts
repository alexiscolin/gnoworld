import type { Worlds } from "@gnoworld/schemas/indexer";
import { Trending } from "@gnoworld/schemas/indexer";
import { openDatabase } from "@gnoworld/service/db";
import { describe, expect, it } from "vitest";
import type { Row } from "./history.ts";
import { PEOPLE_TABLES } from "./personTables.ts";
import { ROLLUP_TABLES, rollupStore } from "./rollupStore.ts";
import { rowsSince, sinceOf, trendingOf, trendingRoutes } from "./trending.ts";

// The last 7 days' ranking: by people a day, never by calls, so one bot calling a realm a thousand times is below five people.
const NOW = Date.parse("2026-11-12T10:00:00Z");
const A = "g1e3vld469ekks28mhtd4aqua3mdaz64qgdtz29k";
const B = "g1etf3rd7dqghksj8r5yunkgmvpupdfszdjhuzju";
const world = (id: string, paths: string[]) => ({
  id,
  namespace: id.split("/")[0] ?? id,
  realms: paths.map((path) => ({
    path,
    deployer: A,
    deployerName: null,
    functions: [],
    imports: [],
    calls: null,
    callers: null,
    lastHeight: null,
  })),
});
const worlds = (...each: ReturnType<typeof world>[]): Worlds => ({
  version: 1,
  universe: "onyx",
  updated: "2026-11-12T09:00:00.000Z",
  worlds: each,
});

describe("the trending ranking", () => {
  it("ranks by people, a lone bot's thousand calls below five people", () => {
    const rows = [
      { realm: "gno.land/r/bot/loop", calls: 1000, people: 7 },
      { realm: "gno.land/r/crowd/app", calls: 30, people: 60 },
      { realm: "gno.land/r/crowd/more", calls: 5, people: 5 },
    ];
    const made = trendingOf(
      worlds(world("bot", ["gno.land/r/bot/loop"]), world("crowd", ["gno.land/r/crowd/app", "gno.land/r/crowd/more"])),
      rows,
      NOW,
    );
    expect(made.items.map(({ world: id, calls, people }) => [id, calls, people])).toEqual([
      ["crowd", 35, 65],
      ["bot", 1000, 7],
    ]);
    expect(made.called).toBe(2);
    expect(Trending.safeParse(made).success).toBe(true);
  });

  it("breaks a tie of people by calls, keeps five and counts the worlds called", () => {
    const ids = ["a", "b", "c", "d", "e", "f"];
    const rows = ids.map((id, at) => ({ realm: `gno.land/r/${id}/x`, calls: at + 1, people: 3 }));
    const made = trendingOf(worlds(...ids.map((id) => world(id, [`gno.land/r/${id}/x`]))), rows, NOW);
    expect(made.items.map(({ world: id }) => id)).toEqual(["f", "e", "d", "c", "b"]);
    expect(made.called).toBe(6);
  });

  it("leaves out a world nothing called", () => {
    expect(trendingOf(worlds(world("quiet", ["gno.land/r/quiet/x"])), [], NOW)).toMatchObject({ called: 0, items: [] });
  });

  it("spans today and the six UTC days before", () => {
    expect(sinceOf(NOW)).toBe("2026-11-06");
  });
});

describe("the rollup's days read as the ranking's rows", () => {
  it("sums calls and each day's callers from the day asked, no earlier", () => {
    const db = openDatabase(":memory:", [ROLLUP_TABLES, PEOPLE_TABLES]);
    const store = rollupStore(db, "onyx");
    const path = "gno.land/r/crowd/app";
    const row = (height: number, caller: string): Row => ({
      height,
      success: true,
      calls: [{ path, caller, func: "Do" }],
      skipped: 0,
    });
    const days = new Map([
      [1, "2026-11-01"],
      [2, "2026-11-10"],
      [3, "2026-11-10"],
      [4, "2026-11-11"],
    ]);
    store.add([row(1, A), row(2, A), row(3, B), row(4, A)], { days, times: new Map() }, 4);
    expect(rowsSince(db, "2026-11-06")).toEqual([{ realm: path, calls: 3, people: 3 }]);
  });
});

describe("GET /api/trending", () => {
  it("is a 404 while there is no ranking, then the ranking, cached a minute", async () => {
    let last: Trending | undefined = undefined as Trending | undefined;
    const routes = trendingRoutes(() => last);
    expect((await routes.request("/")).status).toBe(404);
    last = trendingOf(
      worlds(world("crowd", ["gno.land/r/crowd/app"])),
      [{ realm: "gno.land/r/crowd/app", calls: 2, people: 2 }],
      NOW,
    );
    const answer = await routes.request("/");
    expect(answer.status).toBe(200);
    expect(answer.headers.get("cache-control")).toBe("public, max-age=60");
    expect(Trending.safeParse(await answer.json()).success).toBe(true);
  });
});
