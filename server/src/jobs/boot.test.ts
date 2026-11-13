import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { NetworkAnswer, Trending } from "@gnoworld/schemas/indexer";
import { openDatabase } from "@gnoworld/service/db";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { migrations } from "../migrations.ts";
import { startPrices } from "../prices/prices.ts";
import { startWorlds } from "../worlds/job.ts";
import { bootJobs } from "./boot.ts";

// The timers stand in: what bootJobs hands each one, and what it keeps of their passes for the routes.
vi.mock("../worlds/job.ts", () => ({ startWorlds: vi.fn(() => ({ stop: () => undefined })) }));
vi.mock("../prices/prices.ts", () => ({
  startPrices: vi.fn(() => ({ stop: () => undefined, history: () => undefined })),
}));

const REALM = "gno.land/r/leon/home";
const dir = mkdtempSync(join(tmpdir(), "gnoworld-boot-"));
const opened: DatabaseSync[] = [];
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});
afterEach(() => {
  for (const db of opened.splice(0)) db.close();
  vi.clearAllMocks();
});

const files = () => {
  const universes = join(dir, "universes.json");
  writeFileSync(
    universes,
    JSON.stringify([
      {
        id: "b",
        name: "U",
        chainId: "b-1",
        rpc: "https://rpc.example:443",
        gnoweb: "https://gnoweb.example",
        indexer: "https://indexer.example/graphql/query",
        testnet: true,
        default: true,
      },
    ]),
  );
  writeFileSync(join(dir, "hubs.json"), "[]");
  const worlds = join(dir, "worlds.json");
  const realm = { path: REALM, deployer: null, deployerName: null, functions: [], imports: [] };
  const counts = { calls: null, callers: null, lastHeight: null };
  writeFileSync(
    worlds,
    JSON.stringify({
      version: 1,
      universe: "b",
      updated: "2026-11-13T10:00:00.000Z",
      worlds: [{ id: "leon", namespace: "leon", realms: [{ ...realm, ...counts }] }],
    }),
  );
  return { universes, worlds };
};

const boot = (over: { markets?: string; universes?: string; worlds?: string } = {}) => {
  const db = openDatabase(":memory:", migrations);
  opened.push(db);
  const config = {
    markets: over.markets,
    universes: over.universes,
    worlds: over.worlds,
    previews: undefined,
    moderation: {
      openaiKey: undefined,
      thresholds: {},
      newAccountHours: 1,
      mute: { strikes: 3, windowMinutes: 60, minutes: 60, max: 100 },
    },
  };
  return { db, jobs: bootJobs({ config, db, log: () => undefined }) };
};

describe("bootJobs", () => {
  it("hands the worlds pass the token store the route reads, and keeps the pass's last ranking and health for the routes", () => {
    const { universes, worlds } = files();
    const { db, jobs } = boot({ universes, worlds });
    const options = vi.mocked(startWorlds).mock.calls[0]?.[0];
    const { trending, network } = options ?? {};
    if (options === undefined || trending === undefined || network === undefined) throw new Error("no worlds job");
    expect(options.universe.id).toBe("b");
    expect(jobs.tokens).toBeDefined();
    expect(options.tokens).toBe(jobs.tokens);
    expect(options.rollup).toEqual({ db, dir: join(dirname(worlds), "rollups") });
    expect(network.db).toBe(db);
    expect([jobs.trending(), jobs.network()]).toEqual([undefined, undefined]);
    const ranked = Trending.parse({ updated: "2026-11-13T10:30:00.000Z", called: 0, items: [] });
    const health = NetworkAnswer.parse({
      version: 1,
      universe: "b",
      updated: "2026-11-13T10:30:00.000Z",
      tip: { height: 7, time: "2026-11-13T10:29:00.000Z" },
      days: [],
    });
    trending(ranked);
    network.told(health);
    expect(jobs.trending()).toBe(ranked);
    expect(jobs.network()).toBe(health);
    expect(jobs.worldsRead()?.worlds[0]?.realms[0]?.path).toBe(REALM);
    expect(jobs.listing?.known(REALM)).toBe(true);
  });

  it("makes no job, no token store and no listing without their files, and reads no worlds file then", () => {
    const { jobs } = boot();
    expect(startWorlds).not.toHaveBeenCalled();
    expect(startPrices).not.toHaveBeenCalled();
    expect([jobs.tokens, jobs.listing, jobs.worldsRead(), jobs.balance]).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
  });

  it("starts no timer, CoinGecko's included, for a config it refuses", () => {
    expect(() => boot({ markets: join(dir, "markets.json"), worlds: join(dir, "worlds.json") })).toThrow(
      "setting UNIVERSES_FILE: required",
    );
    expect(startPrices).not.toHaveBeenCalled();
  });
});
