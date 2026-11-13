import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MARKETS_HISTORY_MOST, MarketsHistory } from "@gnoworld/schemas/indexer";
import { afterAll, describe, expect, it } from "vitest";
import { historyRoutes, makeHistory, SEED_BELOW } from "./history.ts";

// The prices' day (8i): each token's price at each read, 288 at most, kept in a file so a restart keeps the day.
const T0 = Date.parse("2026-11-04T12:00:00.000Z");
const STEP = 5 * 60_000;
const dir = mkdtempSync(join(tmpdir(), "gnoworld-history-"));
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});
let made = 0;
const fileOf = (): string => {
  made += 1;
  const folder = join(dir, `t${String(made)}`);
  mkdirSync(folder);
  return join(folder, "markets-history.json");
};
const token = (symbol: "GNOT" | "ATONE" | "BTC", usd: number) => ({ symbol, usd, change24h: null });
const lineOf = (history: ReturnType<typeof makeHistory>, symbol: string) =>
  history.current()?.tokens.find((each) => each.symbol === symbol)?.usd;
const stored = (file: string): unknown => JSON.parse(readFileSync(file, "utf8"));

describe("the prices' history", () => {
  it("has no day before the first price", () => {
    expect(makeHistory(fileOf(), () => T0).current()).toBeUndefined();
  });

  it("appends each read's price to the end of its token's line, oldest first, and says the file took them", () => {
    const file = fileOf();
    const history = makeHistory(file, () => T0);
    expect(history.add([token("GNOT", 1), token("BTC", 100)], T0)).toBe(true);
    expect(history.add([token("GNOT", 2), token("BTC", 90)], T0 + STEP)).toBe(true);
    expect(history.current()).toEqual({
      updated: new Date(T0 + STEP).toISOString(),
      tokens: [
        { symbol: "GNOT", usd: [1, 2] },
        { symbol: "BTC", usd: [100, 90] },
      ],
    });
    expect(stored(file)).toEqual(history.current());
  });

  it(`keeps ${String(MARKETS_HISTORY_MOST)} prices a token at most, the oldest leaving first`, () => {
    const history = makeHistory(fileOf(), () => T0);
    for (let read = 0; read < MARKETS_HISTORY_MOST + 2; read += 1) history.add([token("GNOT", read + 1)], T0);
    const line = lineOf(history, "GNOT") ?? [];
    expect(line).toHaveLength(MARKETS_HISTORY_MOST);
    expect(line[0]).toBe(3);
    expect(line.at(-1)).toBe(MARKETS_HISTORY_MOST + 2);
  });

  it("keeps a token's line as it was when a read brings no price for it", () => {
    const history = makeHistory(fileOf(), () => T0);
    history.add([token("GNOT", 1), token("BTC", 100)], T0);
    history.add([token("BTC", 90)], T0 + STEP);
    expect(lineOf(history, "BTC")).toEqual([100, 90]);
    expect(lineOf(history, "GNOT")).toEqual([1]);
  });

  it("keeps the day over a restart, and goes on from it", () => {
    const file = fileOf();
    makeHistory(file, () => T0).add([token("GNOT", 1)], T0);
    const restarted = makeHistory(file, () => T0 + STEP);
    expect(lineOf(restarted, "GNOT")).toEqual([1]);
    restarted.add([token("GNOT", 2)], T0 + STEP);
    expect(lineOf(restarted, "GNOT")).toEqual([1, 2]);
  });

  it("starts the day again from a file older than a day, and keeps one just under", () => {
    const file = fileOf();
    makeHistory(file, () => T0).add([token("GNOT", 1)], T0);
    const day = 24 * 3_600_000;
    expect(makeHistory(file, () => T0 + day - 1).current()).toBeDefined();
    const late = makeHistory(file, () => T0 + day);
    expect(late.current()).toBeUndefined();
    late.add([token("GNOT", 2)], T0 + day);
    expect(lineOf(late, "GNOT")).toEqual([2]);
  });

  it("starts the day again from a file its schema refuses, or that is no JSON, or a folder gone", () => {
    const refused = [
      "not json",
      "",
      JSON.stringify({ updated: new Date(T0).toISOString(), tokens: [{ symbol: "DOGE", usd: [1] }] }),
      JSON.stringify({ updated: new Date(T0).toISOString(), tokens: [{ symbol: "GNOT", usd: [1] }], extra: 1 }),
      JSON.stringify({ updated: "yesterday", tokens: [] }),
      JSON.stringify({
        updated: new Date(T0).toISOString(),
        tokens: [
          { symbol: "GNOT", usd: [1] },
          { symbol: "GNOT", usd: [2] },
        ],
      }),
    ];
    for (const content of refused) {
      const file = fileOf();
      writeFileSync(file, content);
      expect(makeHistory(file, () => T0).current(), content).toBeUndefined();
    }
    expect(makeHistory(join(dir, "nowhere", "h.json"), () => T0).current()).toBeUndefined();
  });

  it("says the file refused the day when its folder is gone, and still holds the day in memory", () => {
    const history = makeHistory(join(dir, "nowhere", "h.json"), () => T0);
    expect(history.add([token("GNOT", 1)], T0)).toBe(false);
    expect(lineOf(history, "GNOT")).toEqual([1]);
  });
});

describe("the prices' history: seeded from a source's own past", () => {
  const line = (n: number, from = 1) => Array.from({ length: n }, (_, i) => from + i);

  it("is short with no day, and with any line under SEED_BELOW prices, and not once every line is past it", () => {
    const history = makeHistory(fileOf(), () => T0);
    expect(history.short()).toBe(true);
    history.add([token("GNOT", 1)], T0);
    expect(history.short()).toBe(true);
    history.seed([{ symbol: "GNOT", usd: line(SEED_BELOW) }], T0);
    expect(history.short()).toBe(false);
  });

  it("puts the seeded line in front of the reads that follow, oldest first, and keeps it in the file", () => {
    const file = fileOf();
    const history = makeHistory(file, () => T0);
    expect(history.seed([{ symbol: "GNOT", usd: [1, 2, 3] }], T0)).toBe(true);
    history.add([token("GNOT", 4)], T0 + STEP);
    expect(lineOf(history, "GNOT")).toEqual([1, 2, 3, 4]);
    expect(stored(file)).toEqual(history.current());
  });

  it("replaces a short line but never a line that is already long enough, and never goes past MARKETS_HISTORY_MOST", () => {
    const history = makeHistory(fileOf(), () => T0);
    history.seed([{ symbol: "BTC", usd: line(SEED_BELOW) }], T0);
    history.seed(
      [
        { symbol: "BTC", usd: [9, 9] },
        { symbol: "GNOT", usd: line(MARKETS_HISTORY_MOST + 50) },
      ],
      T0,
    );
    expect(lineOf(history, "BTC")).toEqual(line(SEED_BELOW));
    expect(lineOf(history, "GNOT")).toEqual(line(MARKETS_HISTORY_MOST + 50).slice(-MARKETS_HISTORY_MOST));
  });
});

describe("GET the prices' history", () => {
  const ask = async (day: MarketsHistory | undefined) => {
    const response = await historyRoutes(() => day).request("/");
    return { status: response.status, cache: response.headers.get("cache-control"), body: await response.json() };
  };

  it("answers 404 before the first price, still kept a minute by any cache", async () => {
    expect(await ask(undefined)).toEqual({ status: 404, cache: "public, max-age=60", body: { error: "not_ready" } });
  });

  it("answers the day so far, public and kept a minute", async () => {
    const day = { updated: new Date(T0).toISOString(), tokens: [{ symbol: "GNOT" as const, usd: [1, 2] }] };
    expect(await ask(day)).toEqual({ status: 200, cache: "public, max-age=60", body: day });
  });
});
