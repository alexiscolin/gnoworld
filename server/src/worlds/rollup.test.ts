import { blockTimes, callsAbove, callsFirst, callsInBlock } from "@gnoworld/chain/asks";
import { rollupName } from "@gnoworld/core";
import { RealmRollup, ROLLUP_MAX_GZIP, type Worlds } from "@gnoworld/schemas/indexer";
import { openDatabase } from "@gnoworld/service/db";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { afterAll, describe, expect, it, vi } from "vitest";
import { fakeChain, INDEXER, pagedCalls, withBlocks, type CallRow } from "../testing/fakeWorldsChain.ts";
import { HISTORY_MAX_PAGES, type Row } from "./history.ts";
import { migrations } from "../migrations.ts";
import { BLOCKS_PER_ASK, daysOf, parseBlockTimes, type Dated } from "./blockDays.ts";
import { fitted, importersOf, readRollup, writeRollups } from "./rollup.ts";
import { PEOPLE_TABLES } from "./personTables.ts";
import { ROLLUP_TABLES, rollupStore } from "./rollupStore.ts";

// A realm's rollup (slice 13a): the worlds job reads the chain's calls above the last height it kept, buckets them by UTC day from the
// blocks' own times (never a height-to-date line), keeps its state in sqlite, and writes one capped file per realm beside worlds.json.
const PATH = "gno.land/r/gnops/valopers";
const OTHER = "gno.land/r/b/other";
const KNOWN = new Set([PATH, OTHER]);
const A = "g1e3vld469ekks28mhtd4aqua3mdaz64qgdtz29k";
const B = "g1etf3rd7dqghksj8r5yunkgmvpupdfszdjhuzju";
const C = "g1dzwjx4s8t4damqqs8exufzvaww0g0jnqemcfcv";
const UPDATED = "2026-11-10T10:00:00.000Z";
const DAY_MS = 86_400_000;
const BECH32 = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
// The address-shaped text of a number, distinct for each, in bech32's alphabet (no checksum: the file's schema checks none).
const addressOf = (n: number): string => {
  let text = "";
  for (let rest = n; text.length < 38; rest = Math.floor(rest / 32)) text = (BECH32[rest % 32] ?? "q") + text;
  return `g1${text}`;
};

interface Answer {
  what: string;
  query: string;
  variables: Record<string, unknown>;
  body: string;
}
const recorded = (): Answer[] =>
  (JSON.parse(readFileSync(new URL("./onyxRollup.json", import.meta.url), "utf8")) as { answers: Answer[] }).answers;
const answer = (at: number): Answer => {
  const found = recorded()[at];
  if (found === undefined) throw new Error(`onyxRollup.json has no answer ${String(at)}`);
  return found;
};
const heightsOf = (variables: Record<string, unknown>): number[] => Object.values(variables).map(Number);
// A clock of probes over `times`: the heights each ask named, in order; a height it does not hold has no block.
const prober = (times: (height: number) => string | undefined) => {
  const asks: number[][] = [];
  const timesOf = (heights: readonly number[]): Promise<Map<number, string>> => {
    asks.push([...heights]);
    const known = heights.flatMap((height) => {
      const time = times(height);
      return time === undefined ? [] : [[height, time] as const];
    });
    if (known.length < heights.length) return Promise.reject(new Error("no such block"));
    return Promise.resolve(new Map(known));
  };
  return { asks, timesOf };
};

const row = (height: number, calls: Row["calls"], success = true): Row => ({ height, success, calls, skipped: 0 });
const call = (caller: string | undefined, func: string | undefined = "Register", path = PATH) => ({
  path,
  caller,
  func,
});
const dated = (days: Record<number, string>, times: Record<number, string> = {}): Dated => ({
  days: new Map(Object.entries(days).map(([h, d]) => [Number(h), d])),
  times: new Map(Object.entries(times).map(([h, t]) => [Number(h), t])),
});
const store = (universe = "onyx") => {
  const db = openDatabase(":memory:", [ROLLUP_TABLES, PEOPLE_TABLES]);
  return { db, rollups: rollupStore(db, universe) };
};
const counted = (db: ReturnType<typeof openDatabase>, sql: string, ...args: (string | number)[]): number =>
  (db.prepare(sql).get(...args) as { n: number }).n;
// Every row of every table the rollup made, read from sqlite_master, so no table escapes the count.
const allRows = (db: ReturnType<typeof openDatabase>): number =>
  (
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'rollup%'").all() as {
      name: string;
    }[]
  )
    .map(({ name }) => counted(db, `SELECT count(*) AS n FROM "${name}"`))
    .reduce((a, b) => a + b, 0);

const dir = mkdtempSync(join(tmpdir(), "gnoworld-rollups-"));
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("the indexer's words for the rollup (onyxRollup.json, recorded from onyx-1)", () => {
  it("asks block times as onyx-1 was asked: one getBlocks alias per height", () => {
    const recordedAsk = answer(0);
    expect(blockTimes(heightsOf(recordedAsk.variables))).toEqual({
      query: recordedAsk.query,
      variables: recordedAsk.variables,
    });
  });

  // The worlds file's whole-chain read pays for neither field (F13010): 212 B a transaction with them, 180 B without.
  it("asks each call's success and function for the rollup alone", () => {
    for (const ask of [callsFirst(2, true), callsAbove(7, 2, true), callsInBlock(9, true)]) {
      expect(ask.query).toMatch(/\bsuccess\b/);
      expect(ask.query).toMatch(/\bfunc\b/);
    }
    for (const ask of [callsFirst(2), callsAbove(7, 2), callsInBlock(9)])
      expect(ask.query).not.toMatch(/\bsuccess\b|\bfunc\b/);
  });

  it("reads the rollup's pages with both fields", async () => {
    const { chain, reader } = reading([callRow(100, A)]);
    expect(await readRollup(reader, store().rollups, { known: KNOWN })).toEqual({ ok: true });
    expect(pagesOf(chain).every(({ query }) => /\bsuccess\b/.test(query) && /\bfunc\b/.test(query))).toBe(true);
  });

  it("reads onyx-1's answer of fifty aliases, the most it asks at once", () => {
    const fifty = answer(3);
    expect(BLOCKS_PER_ASK).toBe(50);
    const times = parseBlockTimes(JSON.parse(fifty.body), heightsOf(fifty.variables));
    expect(times.size).toBe(50);
    expect(times.get(200_000)).toBe("2026-10-06T05:09:00.287Z");
  });

  it("refuses an answer with errors, a missing block, another height, a time that is no time", () => {
    const one = (block: unknown, extra: object = {}) => ({ data: { b0: block }, ...extra });
    expect(() => parseBlockTimes(one([{ height: 5, time: "2026-09-28T00:00:00Z" }], { errors: [{}] }), [5])).toThrow();
    expect(() => parseBlockTimes(one(null), [5])).toThrow();
    expect(() => parseBlockTimes(one([]), [5])).toThrow();
    expect(() => parseBlockTimes(one([{ height: 6, time: "2026-09-28T00:00:00Z" }]), [5])).toThrow();
    expect(() => parseBlockTimes(one([{ height: 5, time: "<script>" }]), [5])).toThrow();
    expect(() => parseBlockTimes(one([{ height: 5, time: "2026-09-28" }]), [5])).toThrow();
    // onyx-1's own answer for a height above its tip: `b7: null`.
    expect(() => parseBlockTimes(JSON.parse(answer(0).body), heightsOf(answer(0).variables))).toThrow();
  });
});

describe("daysOf, the UTC day of each height from the blocks' times", () => {
  it("buckets onyx-1's own blocks across midnight UTC: 25,600 on the 28th, 25,601 on the 29th", async () => {
    const across = answer(0);
    const heights = heightsOf(across.variables).filter((height) => height !== 999_999_999);
    const times = parseBlockTimes(JSON.parse(across.body), heights);
    const { timesOf } = prober((height) => times.get(height));
    const { days } = await daysOf([19_656, 25_599, 25_600, 25_601, 41_641, 65_431], timesOf);
    expect(Object.fromEntries(days)).toEqual({
      19656: "2026-09-28",
      25599: "2026-09-28",
      25600: "2026-09-28",
      25601: "2026-09-29",
      41641: "2026-09-29",
      65431: "2026-09-30",
    });
  });

  it("puts a block at 00:00:00.000Z in its new day and one a millisecond before in the last", async () => {
    const midnight = Date.UTC(2026, 9, 1);
    const times = new Map([
      [10, new Date(midnight - 1).toISOString()],
      [11, new Date(midnight).toISOString()],
    ]);
    const { days } = await daysOf([10, 11], prober((height) => times.get(height)).timesOf);
    expect(days.get(10)).toBe("2026-09-30");
    expect(days.get(11)).toBe("2026-10-01");
  });

  it("asks a few heights per day boundary, never one per call, and dates every call right", async () => {
    // A block each 1.2 s from 2026-01-01T03:00Z, a call every 13 blocks: 20,000 calls over 3.6 days, 3 day boundaries.
    const start = Date.UTC(2026, 0, 1, 3);
    const timeAt = (height: number) => new Date(start + height * 1_200).toISOString();
    const heights = Array.from({ length: 20_000 }, (_, i) => i * 13);
    const boundaries = new Set(heights.map((height) => timeAt(height).slice(0, 10))).size - 1;
    expect(boundaries).toBe(3);
    const { asks, timesOf } = prober(timeAt);
    const { days } = await daysOf(heights, timesOf);
    for (const height of heights) expect(days.get(height)).toBe(timeAt(height).slice(0, 10));
    // Two ends, then a request's worth of heights a round around each boundary: a few rounds, never a height a call.
    expect(Math.max(...asks.map((asked) => asked.length))).toBeLessThanOrEqual(BLOCKS_PER_ASK);
    expect(asks.length).toBeLessThanOrEqual(5);
    expect(asks.flat().length).toBeLessThan(heights.length / 100);
  });

  it(`dates a page of 2,000 calls across a midnight in 3 rounds of ${String(BLOCKS_PER_ASK)} heights at most, never a bisection's 12`, async () => {
    const start = Date.UTC(2026, 0, 1, 20);
    const timeAt = (height: number) => new Date(start + height * 1_200).toISOString();
    const heights = Array.from({ length: 2_000 }, (_, i) => i * 13);
    const { asks, timesOf } = prober(timeAt);
    const { days } = await daysOf(heights, timesOf);
    for (const height of heights) expect(days.get(height)).toBe(timeAt(height).slice(0, 10));
    expect(asks.length).toBeLessThanOrEqual(3);
    expect(Math.max(...asks.map((asked) => asked.length))).toBeLessThanOrEqual(BLOCKS_PER_ASK);
  });

  it("asks only the two ends for heights of one day, and one for one height", async () => {
    const one = prober(() => "2026-09-28T10:00:00Z");
    await daysOf([5, 9, 30, 70], one.timesOf);
    expect(one.asks.flat().sort((a, b) => a - b)).toEqual([5, 70]);
    const alone = prober(() => "2026-09-28T10:00:00Z");
    expect((await daysOf([42], alone.timesOf)).days.get(42)).toBe("2026-09-28");
    expect(alone.asks.flat()).toEqual([42]);
  });

  it("dates calls across empty days, and takes heights unsorted or twice", async () => {
    const times = new Map([
      [10, "2026-09-01T10:00:00Z"],
      [20, "2026-09-05T10:00:00Z"],
      [30, "2026-09-09T10:00:00Z"],
    ]);
    const { days } = await daysOf([30, 10, 20, 10], prober((height) => times.get(height)).timesOf);
    expect(Object.fromEntries(days)).toEqual({ 10: "2026-09-01", 20: "2026-09-05", 30: "2026-09-09" });
  });

  it("gives the time of each height it asked, to the millisecond, so a call there keeps it", async () => {
    const times = new Map([
      [25_599, "2026-09-28T23:59:53.987Z"],
      [25_601, "2026-09-29T00:00:00.742Z"],
    ]);
    const { times: known } = await daysOf([25_599, 25_601], prober((height) => times.get(height)).timesOf);
    expect(known.get(25_601)).toBe("2026-09-29T00:00:00.742Z");
  });

  it("fails when the indexer has no block for a height, and when time goes back as height rises: no day is guessed", async () => {
    const times = new Map([[25_600, "2026-09-28T23:59:57.362Z"]]);
    await expect(daysOf([25_600, 999_999_999], prober((height) => times.get(height)).timesOf)).rejects.toThrow();
    const backwards = new Map([
      [10, "2026-09-29T10:00:00Z"],
      [20, "2026-09-28T10:00:00Z"],
    ]);
    await expect(daysOf([10, 20], prober((height) => backwards.get(height)).timesOf)).rejects.toThrow();
  });

  it("asks nothing for no heights", async () => {
    const { asks, timesOf } = prober(() => undefined);
    expect((await daysOf([], timesOf)).days.size).toBe(0);
    expect(asks).toEqual([]);
  });
});

describe("rollupStore, the rollup's state in sqlite", () => {
  it("is one of the server's migrations", () => {
    expect(migrations).toContain(ROLLUP_TABLES);
  });

  it("counts calls and distinct callers per UTC day, the top callers, the last calls and the calls per function", () => {
    const { rollups } = store();
    rollups.add(
      [
        row(100, [call(A), call(A, "Update")]),
        row(101, [call(B)], false),
        row(102, [call(A, "Register", OTHER)]),
        row(200, [call(C), call(A)]),
      ],
      dated(
        { 100: "2026-09-28", 101: "2026-09-28", 102: "2026-09-28", 200: "2026-09-29" },
        { 200: "2026-09-29T10:00:00.000Z" },
      ),
      250,
    );
    expect(rollups.height()).toBe(250);
    const file = rollups.rollupOf(PATH, undefined, UPDATED);
    expect(file).toMatchObject({
      version: 1,
      universe: "onyx",
      path: PATH,
      updated: UPDATED,
      height: 250,
      calls: 5,
      callers: 3,
      days: [
        { day: "2026-09-28", calls: 3, callers: 2 },
        { day: "2026-09-29", calls: 2, callers: 2 },
      ],
      // A tie goes to the address first in order.
      top: [
        { address: A, calls: 3 },
        { address: C, calls: 1 },
        { address: B, calls: 1 },
      ],
      functions: [
        { name: "Register", calls: 3 },
        { name: "Update", calls: 1 },
      ],
      importers: { total: 0, top: [] },
    });
    // Newest first; a call of one transaction after the one before it; a block not asked keeps no time.
    expect(file?.last.map(({ height, caller, func, success, time }) => [height, caller, func, success, time])).toEqual([
      [200, A, "Register", true, "2026-09-29T10:00:00.000Z"],
      [200, C, "Register", true, "2026-09-29T10:00:00.000Z"],
      [101, B, "Register", false, null],
      [100, A, "Update", true, null],
      [100, A, "Register", true, null],
    ]);
    expect(RealmRollup.safeParse(file).error).toBeUndefined();
  });

  // Anyone can send a failed call naming any exported-looking function: only a call that ran names one the realm has (F13003).
  it("counts the functions of successful calls alone, and shows a failed call's as it was named", () => {
    const { rollups } = store();
    rollups.add(
      [row(5, [call(A, "Register")]), row(6, [call(B, "Fake")], false)],
      dated({ 5: "2026-09-28", 6: "2026-09-28" }),
      6,
    );
    const file = rollups.rollupOf(PATH, undefined, UPDATED);
    expect(file?.functions).toEqual([{ name: "Register", calls: 1 }]);
    expect(file?.last.map(({ func, success }) => [func, success])).toEqual([
      ["Fake", false],
      ["Register", true],
    ]);
  });

  it("counts a call with an odd function or no caller, and shows neither; a text shaped like SQL stays text", () => {
    const { db, rollups } = store();
    rollups.add(
      [
        row(5, [
          call(undefined, "x();<script>"),
          { path: PATH, caller: A, func: undefined },
          call(B, "'); DROP TABLE rollup_calls;--"),
        ]),
      ],
      dated({ 5: "2026-09-28" }),
      5,
    );
    const file = rollups.rollupOf(PATH, undefined, UPDATED);
    expect(file).toMatchObject({
      calls: 3,
      callers: 2,
      functions: [],
      days: [{ day: "2026-09-28", calls: 3, callers: 2 }],
    });
    expect(file?.last.map(({ caller, func }) => [caller, func])).toEqual([
      [B, null],
      [A, null],
      [null, null],
    ]);
    expect(counted(db, "SELECT count(*) AS n FROM rollup_calls")).toBe(3);
    expect(RealmRollup.safeParse(file).error).toBeUndefined();
  });

  it("takes no row at or below the height it kept: a page read twice counts once", () => {
    const { rollups } = store();
    rollups.add([row(5, [call(A)])], dated({ 5: "2026-09-28" }), 10);
    rollups.add(
      [row(5, [call(A)]), row(10, [call(B)]), row(11, [call(C)])],
      dated({ 5: "2026-09-28", 10: "2026-09-28", 11: "2026-09-28" }),
      11,
    );
    expect(rollups.rollupOf(PATH, undefined, UPDATED)).toMatchObject({ calls: 2, callers: 2, height: 11 });
  });

  it("has no file for a realm with no call and no importer, and one of importers alone for a realm never called", () => {
    const { rollups } = store();
    expect(rollups.rollupOf(PATH, undefined, UPDATED)).toBeUndefined();
    const importers = { total: 1, top: [{ path: OTHER, calls: 4 }] };
    const file = rollups.rollupOf(PATH, importers, UPDATED);
    expect(file).toMatchObject({ calls: 0, callers: 0, days: [], top: [], last: [], functions: [], importers });
    expect(RealmRollup.safeParse(file).error).toBeUndefined();
  });

  it("starts over for another universe, and drops the last one's rows: no count of one chain reaches another's files", () => {
    const db = openDatabase(":memory:", [ROLLUP_TABLES, PEOPLE_TABLES]);
    rollupStore(db, "onyx").add([row(5, [call(A)])], dated({ 5: "2026-09-28" }), 5);
    const other = rollupStore(db, "gnoland");
    expect(other.height()).toBeUndefined();
    expect(other.rollupOf(PATH, undefined, UPDATED)).toBeUndefined();
    expect(allRows(db)).toBe(0);
  });

  it("keeps its state across a restart: the database closed and opened again, its migrations run again", () => {
    const file = join(dir, "restart.db");
    const first = openDatabase(file, migrations);
    rollupStore(first, "onyx").add(
      [row(5, [call(A)])],
      dated({ 5: "2026-09-28" }, { 5: "2026-09-28T01:00:00.000Z" }),
      7,
    );
    first.close();
    const again = openDatabase(file, migrations);
    const rollups = rollupStore(again, "onyx");
    expect(rollups.height()).toBe(7);
    rollups.add([row(8, [call(B)])], dated({ 8: "2026-09-28" }), 8);
    expect(rollups.rollupOf(PATH, undefined, UPDATED)).toMatchObject({ calls: 2, callers: 2, height: 8 });
    again.close();
  });

  // The plan's threat: a huge realm exhausting the job. 250,000 calls over 500 days from 5,000 callers (20 of them busy), 300 functions
  // (100 of them busy), a seventh with an odd name, fed a page at a time as the read feeds them, and 100 importers of varied names: the
  // file stays under its gzip cap, every list capped and holding the largest, and the state keeps bounded rows.
  it("stays bounded at 250,000 calls: an 8 KB gzip file, every list capped, 100 calls and 400 days kept per realm", () => {
    const { db, rollups } = store();
    const { lastDay } = busy(rollups, 250_000);
    const whole = rollups.rollupOf(PATH, busyImporters(), UPDATED);
    const file = whole === undefined ? undefined : fitted(whole);
    expect(RealmRollup.safeParse(file).error).toBeUndefined();
    expect(gzipSync(JSON.stringify(file), { level: 6 }).length).toBeLessThanOrEqual(ROLLUP_MAX_GZIP);
    expect(file?.calls).toBe(250_000 - Math.ceil(250_000 / 3));
    expect(file?.days.map(({ day }) => day)).toEqual(Array.from({ length: 400 }, (_, i) => dayOf(lastDay - 399 + i)));
    expect(new Set(file?.top.map(({ address }) => address))).toEqual(
      new Set(Array.from({ length: 20 }, (_, i) => realAddressOf(i))),
    );
    expect(file?.functions.map(({ name }) => name.slice(0, 3))).toEqual(Array.from({ length: 100 }, () => "Hot"));
    expect(file?.importers.total).toBe(5_000);
    expect(file?.callers).toBe(counted(db, "SELECT count(*) AS n FROM rollup_callers WHERE realm = ?", PATH));
    for (const realm of [PATH, OTHER]) {
      expect(counted(db, "SELECT count(*) AS n FROM rollup_calls WHERE realm = ?", realm)).toBe(100);
      expect(counted(db, "SELECT count(*) AS n FROM rollup_days WHERE realm = ?", realm)).toBe(400);
      expect(counted(db, "SELECT count(DISTINCT day) AS n FROM rollup_day_callers WHERE realm = ?", realm)).toBe(400);
    }
    // About 2 s on a quiet machine; the gate runs it at a load of 25 and more.
  }, 30_000);

  it("prunes the days once for a pass of batches on one day, and again when a newer day comes", () => {
    const { db, rollups } = store();
    const spy = vi.spyOn(db, "prepare");
    const prunes = () => spy.mock.calls.filter(([sql]) => sql.startsWith("DELETE FROM rollup_days WHERE day")).length;
    for (const height of [10, 20, 30]) rollups.add([row(height, [call(A)])], dated({ [height]: "2026-11-10" }), height);
    expect(prunes()).toBe(1);
    rollups.add([row(40, [call(A)])], dated({ 40: "2026-11-11" }), 40);
    expect(prunes()).toBe(2);
  });

  it("sheds the last calls first, then the importers, the functions and the days, until the file fits; none when nothing fits", () => {
    const { rollups } = store();
    const rows = Array.from({ length: 300 }, (_, i) => row(10 + i, [call(addressOf(i * 977), `Func${String(i)}`)]));
    rollups.add(rows, dated(Object.fromEntries(rows.map(({ height }, i) => [height, dayOf(i)]))), 400);
    const importers = {
      total: 100,
      top: Array.from({ length: 100 }, (_, i) => ({ path: `gno.land/r/n${String(i * 7_919)}/x`, calls: 100 - i })),
    };
    const whole = rollups.rollupOf(PATH, importers, UPDATED);
    if (whole === undefined) throw new Error("no file");
    expect(whole.last.length).toBe(100);
    const size = (value: unknown) => gzipSync(JSON.stringify(value), { level: 6 }).length;
    // A cap a little under the whole file: the last calls alone go.
    const cut = fitted(whole, size(whole) - 200);
    expect([cut?.last.length, cut?.importers.top.length, cut?.functions.length, cut?.days.length]).toEqual([
      50, 100, 100, 300,
    ]);
    expect(size(cut)).toBeLessThanOrEqual(size(whole) - 200);
    // A cap under the file with no last calls: the importers go next, their count kept.
    const noLast = size({ ...whole, last: [] });
    const deeper = fitted(whole, noLast - 200);
    expect([deeper?.last.length, deeper?.importers.top.length, deeper?.importers.total, deeper?.days.length]).toEqual([
      0, 50, 100, 300,
    ]);
    expect(size(deeper)).toBeLessThanOrEqual(noLast - 200);
    expect(RealmRollup.safeParse(deeper).error).toBeUndefined();
    expect(fitted(whole, 100)).toBeUndefined();
  });
});

const START = Date.UTC(2025, 0, 1);
const dayOf = (day: number) => new Date(START + day * DAY_MS).toISOString().slice(0, 10);
// A caller of call `i`: one of 20 busy ones every tenth call, else one of 5,000 drawn by `random`.
// An address as random as a real one, so the file compresses no better than a chain's would.
const realAddressOf = (n: number): string =>
  `g1${[...createHash("sha512").update(String(n)).digest()]
    .slice(0, 38)
    .map((byte) => BECH32[byte % 32] ?? "q")
    .join("")}`;
const busyCaller = (i: number, random: () => number) =>
  realAddressOf(i % 10 === 0 ? (i / 10) % 20 : 100 + Math.floor(random() * 5_000));
// A function of call `i`: an odd name every seventh, one of 300 cold ones every fourth, else one of 100 busy ones.
const busyFunc = (i: number) => {
  if (i % 7 === 0) return `bad name ${String(i % 300)}`;
  return i % 4 === 0 ? `Cold${String(i % 300)}` : `Hot${String(Math.floor(i / 4) % 100)}`;
};
// `total` calls, a third to OTHER, every eleventh failed, from 200 to 800 a day over 500 days, fed 2,000 at a time; the last day reached.
function busy(rollups: ReturnType<typeof rollupStore>, total: number): { lastDay: number } {
  let seed = 7;
  const random = (): number => {
    seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
    return seed / 2_147_483_648;
  };
  const clock = { day: 0, left: 200 + Math.floor(random() * 600) };
  for (let at = 0; at < total; at += 2_000) {
    const rows: Row[] = [];
    const days = new Map<number, string>();
    for (let i = at; i < at + 2_000; i += 1) {
      if (clock.left <= 0 && clock.day < 499)
        Object.assign(clock, { day: clock.day + 1, left: 200 + Math.floor(random() * 600) });
      clock.left -= 1;
      rows.push(row(1_000 + i, [call(busyCaller(i, random), busyFunc(i), i % 3 === 0 ? OTHER : PATH)], i % 11 !== 0));
      days.set(1_000 + i, dayOf(clock.day));
    }
    const times = new Map(
      [...days].map(([h, d]) => [
        h,
        `${d}T${String(h % 24).padStart(2, "0")}:00:07.${String(h % 1000).padStart(3, "0")}Z`,
      ]),
    );
    rollups.add(rows, { days, times }, 1_000 + at + 1_999);
  }
  return { lastDay: clock.day };
}
const busyImporters = () => ({
  total: 5_000,
  top: Array.from({ length: 100 }, (_, i) => ({
    path: `gno.land/r/${addressOf(i * 7_919)}/${String.fromCharCode(97 + (i % 26))}${String(i * 31)}/v${String(i % 9)}`,
    calls: 5_000 - i,
  })),
});

// The chain as the job reads it: the calls paged as onyx-1 pages them, and each block's time 10 s apart from 2026-09-28T23:00Z, so heights
// past 360 fall on the 29th.
const callRow = (
  height: number,
  caller: string,
  { func = "Register", path = PATH, success = true } = {},
): CallRow & { success: boolean } => ({
  block_height: height,
  success,
  messages: [{ value: { __typename: "MsgCall", pkg_path: path, caller, func } }],
});
const timeAt = (height: number) => new Date(Date.UTC(2026, 8, 28, 23) + height * 10_000).toISOString();
const reading = (rows: CallRow[], timeOf: (height: number) => string | undefined = timeAt, page = 3) => {
  const chain = fakeChain({ indexer: withBlocks(pagedCalls(rows), timeOf) });
  return { chain, reader: { send: chain.send, indexer: INDEXER, page } };
};
const asked = (chain: ReturnType<typeof fakeChain>) =>
  chain.asked.map(({ data }) => JSON.parse(data) as { query: string; variables: Record<string, unknown> });
const pagesOf = (chain: ReturnType<typeof fakeChain>) =>
  asked(chain).filter(({ query }) => query.includes("getTransactions"));
const blocksOf = (chain: ReturnType<typeof fakeChain>) =>
  asked(chain).filter(({ query }) => query.includes("getBlocks"));

describe("readRollup, the incremental read", () => {
  it("reads every call on its first pass, then only above the height it kept, and counts none twice", async () => {
    const { rollups } = store();
    const first = [callRow(100, A), callRow(200, B), callRow(300, A), callRow(400, C)];
    expect(await readRollup(reading(first).reader, rollups, { known: KNOWN })).toEqual({ ok: true });
    expect(rollups.height()).toBe(400);
    const two = reading([...first, callRow(500, B), callRow(600, A)]);
    expect(await readRollup(two.reader, rollups, { known: KNOWN })).toEqual({ ok: true });
    const pages = pagesOf(two.chain);
    expect(pages[0]?.variables).toEqual({ above: 400, limit: 3 });
    for (const { variables } of pages.slice(1))
      expect(Number(variables["above"] ?? variables["height"])).toBeGreaterThanOrEqual(400);
    expect(rollups.rollupOf(PATH, undefined, UPDATED)).toMatchObject({
      height: 600,
      calls: 6,
      callers: 3,
      days: [
        { day: "2026-09-28", calls: 3, callers: 2 },
        { day: "2026-09-29", calls: 3, callers: 3 },
      ],
    });
  });

  it("reads onyx-1's recorded page: each call's success and function through the job's own parser", async () => {
    const { rollups } = store();
    rollups.add([], dated({}), 25_500);
    const page = JSON.parse(answer(1).body) as { data: { getTransactions: CallRow[] } };
    const times = parseBlockTimes(JSON.parse(answer(2).body), heightsOf(answer(2).variables));
    const known = new Set([PATH, "gno.land/r/g1n4pl5uc4yt5r96m9w6fmdznx3x0jyg8l6arhmt/bazaar/bazaarv4"]);
    const { reader } = reading(page.data.getTransactions, (height) => times.get(height), 4);
    expect(await readRollup(reader, rollups, { known })).toEqual({ ok: true });
    expect(rollups.rollupOf(PATH, undefined, UPDATED)).toMatchObject({
      calls: 3,
      callers: 3,
      functions: [{ name: "Register", calls: 3 }],
      days: [{ day: "2026-09-29", calls: 3, callers: 3 }],
      last: [
        { height: 35_264, func: "Register", success: true, time: "2026-09-29T09:03:48.068Z" },
        { height: 35_034, func: "Register", success: true, time: "2026-09-29T08:50:51.431Z" },
        { height: 34_657, func: "Register", success: true, time: "2026-09-29T08:29:38.743Z" },
      ],
    });
  });

  it("asks block times fifty heights at most a request", async () => {
    const { rollups } = store();
    const rows = Array.from({ length: 400 }, (_, i) => callRow(100 + i * 3, addressOf(i)));
    const { chain, reader } = reading(rows, timeAt, 2_000);
    expect(await readRollup(reader, rollups, { known: KNOWN })).toEqual({ ok: true });
    const sizes = blocksOf(chain).map(({ variables }) => Object.keys(variables).length);
    expect(sizes.length).toBeGreaterThan(0);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(50);
  });

  it("gives every one of a realm's last calls its block's exact time", async () => {
    const { rollups } = store();
    const rows = Array.from({ length: 30 }, (_, i) => callRow(100 + i * 7, i % 2 === 0 ? A : B));
    expect(await readRollup(reading(rows).reader, rollups, { known: KNOWN })).toEqual({ ok: true });
    const file = rollups.rollupOf(PATH, undefined, UPDATED);
    expect(file?.last.length).toBe(30);
    for (const { height, time } of file?.last ?? []) expect(time).toBe(timeAt(height));
  });

  it("keeps none of a lone page whose block has no time, then reads it whole once it has", async () => {
    const { rollups } = store();
    const rows = [callRow(100, A), callRow(200, B)];
    const missing = reading(rows, (height) => (height === 100 ? undefined : timeAt(height)));
    expect(await readRollup(missing.reader, rollups, { known: KNOWN })).toEqual({ ok: false, kind: "shape" });
    expect(rollups.height()).toBeUndefined();
    expect(rollups.rollupOf(PATH, undefined, UPDATED)).toBeUndefined();
    expect(await readRollup(reading(rows).reader, rollups, { known: KNOWN })).toEqual({ ok: true });
    expect(rollups.rollupOf(PATH, undefined, UPDATED)).toMatchObject({ calls: 2, callers: 2, height: 200 });
  });

  it("keeps the pages before a fault, then resumes above them and counts each call once", async () => {
    const { rollups } = store();
    const rows = Array.from({ length: 6 }, (_, i) => callRow(100 + i * 10, addressOf(i)));
    const broken = reading(rows, (height) => (height === 150 ? undefined : timeAt(height)), 2);
    expect(await readRollup(broken.reader, rollups, { known: KNOWN })).toMatchObject({ ok: false });
    const kept = rollups.height();
    expect(kept).toBeDefined();
    expect(kept).toBeLessThan(150);
    expect(rollups.rollupOf(PATH, undefined, UPDATED)?.calls).toBe(
      rows.filter(({ block_height: h }) => h <= Number(kept)).length,
    );
    expect(await readRollup(reading(rows, timeAt, 2).reader, rollups, { known: KNOWN })).toEqual({ ok: true });
    expect(rollups.rollupOf(PATH, undefined, UPDATED)).toMatchObject({ calls: 6, callers: 6, height: 150 });
  });

  it("past its requests' cap, keeps its progress, and the next passes finish with no call counted twice", async () => {
    const { rollups } = store();
    const rows = Array.from({ length: HISTORY_MAX_PAGES + 1 }, (_, i) => callRow(100 + i, addressOf(i)));
    const outcomes = [];
    for (let pass = 0; pass < 6 && rollups.height() !== 100 + HISTORY_MAX_PAGES; pass += 1)
      outcomes.push(await readRollup(reading(rows, timeAt, 1).reader, rollups, { known: KNOWN }));
    expect(outcomes[0]).toEqual({ ok: false, kind: "too_many" });
    expect(rollups.rollupOf(PATH, undefined, UPDATED)).toMatchObject({
      calls: HISTORY_MAX_PAGES + 1,
      height: 100 + HISTORY_MAX_PAGES,
    });
  });

  it("counts a block cut by a page's end once, a failed call as one, and no transaction without a call", async () => {
    const { rollups } = store();
    const rows: CallRow[] = [
      callRow(100, A),
      callRow(200, A),
      callRow(200, B),
      callRow(200, C, { func: "Update", success: false }),
      { block_height: 250, messages: [{ value: { __typename: "MsgSend" } }] },
      callRow(300, B),
    ];
    expect(await readRollup(reading(rows, timeAt, 2).reader, rollups, { known: KNOWN })).toEqual({ ok: true });
    const file = rollups.rollupOf(PATH, undefined, UPDATED);
    expect(file).toMatchObject({ calls: 5, callers: 3, height: 300 });
    expect(file?.last.find(({ func }) => func === "Update")?.success).toBe(false);
  });

  // A failed call costs its fee and may name any path; a successful one proves a deployed realm.
  it("keeps no failed call to a path the list does not hold: no row for it", async () => {
    const { db, rollups } = store();
    const junk = Array.from({ length: 50 }, (_, i) =>
      callRow(100 + i, A, { path: `gno.land/r/junk/j${String(i)}`, success: false }),
    );
    expect(await readRollup(reading([...junk, callRow(500, A)]).reader, rollups, { known: KNOWN })).toEqual({
      ok: true,
    });
    expect(counted(db, "SELECT count(DISTINCT realm) AS n FROM rollup_calls")).toBe(1);
    expect(rollups.height()).toBe(500);
  });

  // A realm the list did not hold on one pass (a partial list, a shed realm, one deployed meanwhile) keeps its calls (F13007).
  it("keeps the successful calls of a realm the list does not hold yet, so it counts them all once it does", async () => {
    const { rollups } = store();
    const NEW = "gno.land/r/late/comer";
    const first = [callRow(100, A), callRow(110, B, { path: NEW }), callRow(120, C, { path: NEW })];
    await readRollup(reading(first).reader, rollups, { known: KNOWN });
    const later = reading([...first, callRow(200, A, { path: NEW })]);
    expect(await readRollup(later.reader, rollups, { known: new Set([...KNOWN, NEW]) })).toEqual({ ok: true });
    expect(rollups.rollupOf(NEW, undefined, UPDATED)).toMatchObject({ calls: 3, callers: 3 });
  });

  it("keeps no call, failed or not, to a path that is no realm's", async () => {
    const { db, rollups } = store();
    const odd = [callRow(100, A, { path: "gno.land/p/nt/avl/v0" }), callRow(110, A, { path: "<script>" })];
    expect(await readRollup(reading(odd).reader, rollups, { known: KNOWN })).toEqual({ ok: true });
    expect(counted(db, "SELECT count(*) AS n FROM rollup_calls")).toBe(0);
  });

  it("reads nothing of an empty chain, and has no file", async () => {
    const { rollups } = store();
    expect(await readRollup(reading([]).reader, rollups, { known: KNOWN })).toEqual({ ok: true });
    expect(rollups.height()).toBeUndefined();
    expect(rollups.rollupOf(PATH, undefined, UPDATED)).toBeUndefined();
  });

  it("starts over when the chain restarted under the same name: the block it kept has another time, or none", async () => {
    for (const restarted of [
      (h: number) => (h === 400 ? "2027-01-01T00:00:00.000Z" : timeAt(h)),
      (h: number) => (h === 400 ? undefined : timeAt(h)),
    ]) {
      const { rollups } = store();
      await readRollup(reading([callRow(100, A), callRow(400, B)]).reader, rollups, { known: KNOWN });
      const fresh = reading([callRow(50, C)], restarted);
      expect(await readRollup(fresh.reader, rollups, { known: KNOWN })).toEqual({ ok: true });
      expect(rollups.rollupOf(PATH, undefined, UPDATED)).toMatchObject({
        calls: 1,
        callers: 1,
        height: 50,
        top: [{ address: C, calls: 1 }],
      });
    }
  });

  // A pass with no new call of a known realm keeps the block it last dated, so a later restart is still seen.
  it("keeps the dated block through a pass that dated none, and still starts over on a restarted chain", async () => {
    const { rollups } = store();
    await readRollup(reading([callRow(100, A), callRow(400, B)]).reader, rollups, { known: KNOWN });
    const quiet = [callRow(100, A), callRow(400, B), callRow(500, C, { path: "gno.land/r/junk/j", success: false })];
    expect(await readRollup(reading(quiet).reader, rollups, { known: KNOWN })).toEqual({ ok: true });
    expect(rollups.height()).toBe(500);
    expect(rollups.anchor()).toEqual({ height: 400, time: timeAt(400) });
    const restarted = reading([callRow(50, C)], (h) => (h === 400 ? undefined : timeAt(h)));
    expect(await readRollup(restarted.reader, rollups, { known: KNOWN })).toEqual({ ok: true });
    expect(rollups.rollupOf(PATH, undefined, UPDATED)).toMatchObject({ calls: 1, height: 50 });
  });

  it("stops when the job stops", async () => {
    const { rollups } = store();
    expect(
      await readRollup(reading([callRow(100, A)]).reader, rollups, { known: KNOWN, isStopped: () => true }),
    ).toEqual({
      ok: false,
      kind: "stopped",
    });
  });
});

const realmRow = (path: string, imports: string[] = [], calls: number | null = null) => ({
  path,
  imports,
  calls,
  deployer: null,
  deployerName: null,
  functions: [],
  callers: null,
  lastHeight: null,
});
const worldsOf = (worlds: Record<string, ReturnType<typeof realmRow>[]>): Worlds => ({
  version: 1,
  universe: "onyx",
  updated: UPDATED,
  worlds: Object.entries(worlds).map(([id, realms]) => ({ id, namespace: id, realms })),
});

describe("importersOf, the realms that import each realm", () => {
  it("inverts worlds.json's imports across worlds, ranks the importers by their calls, and leaves out packages, itself and twice", () => {
    const importers = importersOf(
      worldsOf({
        a: [
          realmRow("gno.land/r/a/one", [PATH, OTHER, PATH, "gno.land/p/nt/avl/v0"], 5),
          realmRow("gno.land/r/a/three", [PATH], null),
        ],
        z: [realmRow("gno.land/r/z/two", [PATH], 9), realmRow(PATH, [PATH], 1)],
      }),
    );
    expect(importers.get(PATH)).toEqual({
      total: 3,
      top: [
        { path: "gno.land/r/z/two", calls: 9 },
        { path: "gno.land/r/a/one", calls: 5 },
        { path: "gno.land/r/a/three", calls: 0 },
      ],
    });
    expect(importers.get(OTHER)).toEqual({ total: 1, top: [{ path: "gno.land/r/a/one", calls: 5 }] });
    expect(importers.has("gno.land/p/nt/avl/v0")).toBe(false);
  });

  it("keeps the top 100 importers, a tie going to the path first in order, and the count of them all", () => {
    const realms = Array.from({ length: 150 }, (_, i) =>
      realmRow(`gno.land/r/n/r${String(i).padStart(3, "0")}`, [PATH], i < 120 ? i : 7),
    );
    const mine = importersOf(worldsOf({ n: realms })).get(PATH);
    expect(mine?.total).toBe(150);
    expect(mine?.top.length).toBe(100);
    expect(mine?.top[0]).toEqual({ path: "gno.land/r/n/r119", calls: 119 });
    const sevens = mine?.top.filter(({ calls }) => calls === 7).map(({ path }) => path) ?? [];
    expect(sevens).toEqual([...sevens].sort());
  });
});

describe("writeRollups, the files", () => {
  // The server's one thread serves the chat and logins while the job writes: every realm's file costs queries and gzips (F13001).
  it("lets the server's other work run between realms, never one block over every file", async () => {
    const { rollups } = store();
    const paths = Array.from({ length: 20 }, (_, i) => `gno.land/r/many/r${String(i)}`);
    rollups.add(
      [
        row(
          5,
          paths.map((path) => call(A, "Register", path)),
        ),
      ],
      dated({ 5: "2026-09-28" }),
      5,
    );
    let turns = 0;
    const tick = (): void => {
      turns += 1;
      if (turns < 100) setImmediate(tick);
    };
    setImmediate(tick);
    expect(
      await writeRollups(join(dir, "turns"), worldsOf({ many: paths.map((path) => realmRow(path)) }), rollups),
    ).toEqual({
      written: 20,
    });
    expect(turns).toBeGreaterThanOrEqual(10);
  });

  it("writes one file per realm with calls or importers, named by its path's hash, and none for the others", async () => {
    const { rollups } = store();
    rollups.add([row(5, [call(A)])], dated({ 5: "2026-09-28" }), 5);
    const imported = "gno.land/r/gnops/lib";
    const worlds = worldsOf({
      gnops: [realmRow(PATH, [imported], 3), realmRow(imported), realmRow("gno.land/r/gnops/quiet")],
    });
    const folder = join(dir, "written");
    expect(await writeRollups(folder, worlds, rollups)).toEqual({ written: 2 });
    expect(readdirSync(folder).sort()).toEqual([`${rollupName(PATH)}.json`, `${rollupName(imported)}.json`].sort());
    const read = (path: string) =>
      RealmRollup.parse(JSON.parse(readFileSync(join(folder, `${rollupName(path)}.json`), "utf8")));
    expect(read(PATH)).toMatchObject({ path: PATH, calls: 1 });
    expect(read(imported)).toMatchObject({
      path: imported,
      calls: 0,
      importers: { total: 1, top: [{ path: PATH, calls: 3 }] },
    });
    expect(existsSync(join(folder, `${rollupName("gno.land/r/gnops/quiet")}.json`))).toBe(false);
  });

  // A file stays served under its name until removed: after a restarted chain it would show the last chain's counts (F13008).
  it("removes the files of realms it wrote none for this pass, and leaves any other file of the folder", async () => {
    const { rollups } = store();
    rollups.add([row(5, [call(A)])], dated({ 5: "2026-09-28" }), 5);
    const folder = join(dir, "stale");
    const worlds = worldsOf({ gnops: [realmRow(PATH)] });
    expect(await writeRollups(folder, worlds, rollups)).toEqual({ written: 1 });
    writeFileSync(join(folder, "keep.txt"), "x");
    rollups.reset();
    expect(await writeRollups(folder, worlds, rollups)).toEqual({ written: 0 });
    expect(readdirSync(folder)).toEqual(["keep.txt"]);
  });

  it("counts the realms whose file its schema refuses, for the pass to log once, and writes the others", async () => {
    const { rollups } = store();
    rollups.add([row(5, [call(A), call(A, "Register", "gno.land/r/gnops/other")])], dated({ 5: "2026-09-28" }), 5);
    const bad: typeof rollups = {
      ...rollups,
      rollupOf: (path, importers, at) => {
        const whole = rollups.rollupOf(path, importers, at);
        return path === PATH && whole !== undefined ? { ...whole, calls: -1 } : whole;
      },
    };
    const worlds = worldsOf({ gnops: [realmRow(PATH), realmRow("gno.land/r/gnops/other")] });
    expect(await writeRollups(join(dir, "refused"), worlds, bad)).toEqual({ written: 1, refused: 1 });
  });

  it("says a write failed, never throws, when reading a realm's state throws", async () => {
    const { rollups } = store();
    const failing: typeof rollups = {
      ...rollups,
      rollupOf: () => {
        throw new Error("database is locked");
      },
    };
    expect(await writeRollups(join(dir, "thrown"), worldsOf({ gnops: [realmRow(PATH)] }), failing)).toBe(false);
  });

  it("matches the file the job wrote from onyx-1 (onyxValopersRollup.json): the contract the plate reads", () => {
    const file = RealmRollup.parse(
      JSON.parse(readFileSync(new URL("./onyxValopersRollup.json", import.meta.url), "utf8")),
    );
    expect(gzipSync(JSON.stringify(file), { level: 6 }).length).toBeLessThanOrEqual(ROLLUP_MAX_GZIP);
    // Counted apart from the job on 2026-11-09, by a scan of every call on onyx-1's indexer (500 a page, deduplicated by hash) up to the
    // file's height: 95 calls from 70 callers, two of them at 4, the first in order g154xep0….
    expect(file).toMatchObject({
      path: PATH,
      height: VALOPERS.height,
      calls: VALOPERS.calls,
      callers: VALOPERS.callers,
    });
    expect(file.top[0]).toEqual(VALOPERS.top);
  });
});
// What a scan of onyx-1's indexer apart from the job counted for valopers, up to the recorded file's height.
const VALOPERS = {
  height: 1_016_042,
  calls: 95,
  callers: 70,
  top: { address: "g154xep0mgxuccm7r29fe0fjfswwq3jjhxshg29h", calls: 4 },
};
