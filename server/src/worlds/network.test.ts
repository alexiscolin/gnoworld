import { NetworkAnswer } from "@gnoworld/schemas/indexer";
import { openDatabase } from "@gnoworld/service/db";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { networkPass, networkRoutes, NETWORK_PAGES, type NetworkPass } from "./network.ts";
import { dayOf, NETWORK_TABLES } from "./networkStore.ts";

// The network's line: transactions and accounts a UTC day, from a chain whose block h is at BASE + h seconds * 10.
const BASE = Date.parse("2026-11-10T00:00:00Z");
const NOW = Date.parse("2026-11-12T10:00:00Z");
const TIP = 17_000;
const timeOf = (height: number): string => new Date(BASE + height * 10_000).toISOString();
const A = "g1e3vld469ekks28mhtd4aqua3mdaz64qgdtz29k";
const B = "g1etf3rd7dqghksj8r5yunkgmvpupdfszdjhuzju";
const call = (caller: string) => ({ value: { __typename: "MsgCall", caller } });

interface Tx {
  block_height: number;
  messages: unknown;
}
const Ask = z.object({ query: z.string(), variables: z.record(z.string(), z.number()) });
const chain = (txs: Tx[]) => {
  const send = (_url: string, init: RequestInit): Promise<Response> => {
    const { query, variables } = Ask.parse(JSON.parse(typeof init.body === "string" ? init.body : ""));
    const reply = (data: unknown) => Promise.resolve(new Response(JSON.stringify({ data })));
    if (query.includes("latestBlockHeight")) return reply({ latestBlockHeight: TIP });
    if (query.includes("getTransactions")) {
      const rows = txs.filter((tx) => tx.block_height > (variables["above"] ?? 0)).slice(0, variables["limit"]);
      return reply({ getTransactions: rows.length === 0 ? null : rows });
    }
    return reply(
      Object.fromEntries(
        Object.entries(variables).map(([key, height]) => [`b${key.slice(1)}`, [{ height, time: timeOf(height) }]]),
      ),
    );
  };
  return send;
};

const pass = (txs: Tx[], over: Partial<NetworkPass> = {}): NetworkPass => ({
  send: chain(txs),
  indexer: "https://indexer.test/graphql",
  universe: "onyx",
  db: openDatabase(":memory:", [NETWORK_TABLES]),
  log: () => undefined,
  now: () => NOW,
  pace: () => Promise.resolve(),
  isStopped: () => false,
  ...over,
});

describe("the network's line", () => {
  it("counts a transaction and its sender a UTC day, a bundle of three messages once", async () => {
    const day = (hour: number) => (Date.parse(`2026-11-12T${String(hour).padStart(2, "0")}:00:00Z`) - BASE) / 10_000;
    const txs = [
      { block_height: day(0) + 1, messages: [call(A), call(B), call(B)] },
      { block_height: day(1), messages: [call(A)] },
      { block_height: day(2), messages: [call(B)] },
      { block_height: day(3), messages: [{ value: { __typename: "MsgCall", caller: "<script>" } }] },
    ];
    const made = await networkPass(pass(txs));
    expect(NetworkAnswer.safeParse(made).success).toBe(true);
    expect(made.days.at(-1)).toEqual({ day: "2026-11-12", txs: 4, accounts: 2 });
    expect(made.tip).toEqual({ height: TIP, time: timeOf(TIP) });
  });

  it("fills a day with no transaction with a zero, keeps the days oldest first and ends them at the day read through, not today", async () => {
    const made = await networkPass(pass([{ block_height: 5, messages: [call(A)] }]));
    expect(made.days.map(({ day, txs }) => [day, txs])).toEqual([
      ["2026-11-10", 1],
      ["2026-11-11", 0],
    ]);
  });

  it("keeps the addresses of the days shown, not of a month", async () => {
    const first = pass([]);
    const old = (n: number) => dayOf(NOW - n * 86_400_000);
    for (const n of [13, 14, 15, 29]) first.db.prepare("INSERT INTO network_day_accounts VALUES (?, ?)").run(old(n), A);
    await networkPass(first);
    const left = first.db.prepare("SELECT day FROM network_day_accounts ORDER BY day").all();
    expect(left.map((row) => row["day"])).toEqual([old(14), old(13)]);
  });

  it("steps past a full page whose rows all fail, and says so", async () => {
    const said: string[] = [];
    const bad = [5, 6].map((block_height) => ({ block_height, messages: "none" }));
    const made = await networkPass(
      pass([...bad, { block_height: 7, messages: [call(A)] }], { page: 2, log: (e) => said.push(e) }),
    );
    expect(said).toContain("network_page_skipped");
    expect(made.days[0]?.txs).toBe(1);
  });

  it("reads a second pass above the kept height, so no transaction is counted twice", async () => {
    const txs = [{ block_height: 5, messages: [call(A)] }];
    const first = pass(txs);
    await networkPass(first);
    const made = await networkPass({ ...first, send: chain(txs) });
    expect(made.days[0]).toEqual({ day: "2026-11-10", txs: 1, accounts: 1 });
  });

  it("reads a page at a time and keeps a block that spans two pages whole", async () => {
    const txs = [1, 2, 3, 3, 3, 4].map((block_height) => ({ block_height, messages: [call(A)] }));
    const made = await networkPass(pass(txs, { page: 4 }));
    expect(made.days[0]?.txs).toBe(6);
  });

  it("stops at its page cap and says so", async () => {
    const txs = Array.from({ length: NETWORK_PAGES * 2 + 5 }, (_, i) => ({ block_height: i + 1, messages: [call(A)] }));
    const said: string[] = [];
    const made = await networkPass(pass(txs, { page: 2, log: (event) => said.push(event) }));
    expect(said).toContain("network_read_capped");
    // Each full page leaves its last block for the next: a page of two with one transaction a block gains one.
    expect(made.days[0]?.txs).toBe(NETWORK_PAGES);
  });

  it("drops a row that is no transaction and logs it by kind", async () => {
    const said: string[] = [];
    const made = await networkPass(
      pass(
        [
          { block_height: 5, messages: [call(A)] },
          { block_height: 6, messages: "none" },
        ],
        { log: (event) => said.push(event) },
      ),
    );
    expect(said).toContain("network_rows_skipped");
    expect(made.days[0]?.txs).toBe(1);
  });

  it("answers 404 before a first pass and the answer after, public for a minute", async () => {
    const state: { last?: NetworkAnswer } = {};
    const app = networkRoutes(() => state.last);
    expect((await app.request("/")).status).toBe(404);
    state.last = await networkPass(pass([]));
    const res = await app.request("/");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=60");
    expect(NetworkAnswer.safeParse(await res.json()).success).toBe(true);
  });

  it("refuses a days list out of order or past 14 days", () => {
    const day = (n: number) => `2026-11-${String(n).padStart(2, "0")}`;
    const base = { version: 1, universe: "onyx", updated: timeOf(1), tip: { height: 1, time: timeOf(1) } };
    const days = (list: number[]) => list.map((n) => ({ day: day(n), txs: 1, accounts: 1 }));
    expect(NetworkAnswer.safeParse({ ...base, days: days([3, 2]) }).success).toBe(false);
    expect(NetworkAnswer.safeParse({ ...base, days: days([2, 2]) }).success).toBe(false);
    expect(NetworkAnswer.safeParse({ ...base, days: days(Array.from({ length: 15 }, (_, i) => i + 1)) }).success).toBe(
      false,
    );
    expect(NetworkAnswer.safeParse({ ...base, days: days([2, 3]) }).success).toBe(true);
  });
});
