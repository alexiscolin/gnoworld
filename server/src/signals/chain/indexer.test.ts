import { describe, expect, it, vi } from "vitest";
import { rowOf, call } from "../../testing/chainRecorded.ts";
import {
  HISTORY_PAGE,
  HISTORY_PAGES,
  indexerReaders,
  MAX_BYTES,
  PAGE,
  TIMEOUT_MS,
  type IndexerLog,
} from "./indexer.ts";
import { readChainRow } from "./message.ts";

// Slice 9g (red pass): the only two reads of the indexer's untrusted HTTP answers, driven by a fake `send`: the query they
// ask, the schema every answer goes through, the timeout, and a cap on every size and every loop.
const ACCESS = "gno.land/r/g14wv9hyngyrzpxn3ztvnx2jygs50m0240qncm8j/access";
const ALICE = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
const row = (height: number, hash: string, index = 0): Record<string, unknown> => ({
  ...rowOf(call),
  block_height: height,
  hash,
  index,
});
const answer = (data: unknown, status = 200): Response => new Response(JSON.stringify({ data }), { status });
const rowsOf = (rows: unknown[]): Response => answer({ getTransactions: rows });
const deployRow = (height: number, name: string) => ({
  block_height: height,
  index: 0,
  messages: [
    { value: { __typename: "MsgAddPackage", creator: ALICE, package: { path: `gno.land/r/${ALICE}/${name}` } } },
  ],
});
const withHash = (height: number, name: string, hash = `h${String(height)}`) => ({
  ...deployRow(height, name),
  hash,
  index: 0,
  success: true,
});
const times = (heights: number[], at: (height: number) => string) =>
  answer({ getBlocks: heights.map((height) => ({ height, time: at(height) })) });

function setup(reply: (query: string, ms: number) => Response | Promise<Response>) {
  const queries: string[] = [];
  const log = vi.fn<(what: IndexerLog) => void>();
  const send = vi.fn((_: string, init: RequestInit, ms: number) => {
    const query = (JSON.parse(typeof init.body === "string" ? init.body : "") as { query: string }).query;
    queries.push(query);
    return Promise.resolve(reply(query, ms));
  });
  const readers = indexerReaders({
    url: "https://indexer.example.test/graphql/query",
    watch: new Map([[ACCESS, { world: "access" }]]),
    log,
    send,
  });
  return { readers, queries, log, send };
}

const CONTEXT = { universe: "onyx", watch: new Map([[ACCESS, { world: "access" }]]), log: () => undefined };
const AFTER = { height: 100 };
const TIP = 200;
const tooBig = (): Response => new Response(`{"data":"${"x".repeat(MAX_BYTES)}"}`);

describe("the catch-up", () => {
  it("asks, with a timeout, for the rows after a place up to the tip, in order, and gives each with its place", async () => {
    const { readers, queries, send } = setup(() => rowsOf([row(101, "b", 0), row(101, "c", 1), row(102, "d", 0)]));
    const page = await readers.catchUp({ height: 100, index: 4 }, TIP);
    expect(queries[0]).toContain("{ block_height: { eq: 100 }, index: { gt: 4 } }");
    expect(queries[0]).toContain("block_height: { lt: 201 }");
    expect(queries[0]).toContain("heightAndIndex: ASC");
    expect(queries[0]).toContain(`limit: ${String(PAGE)}`);
    expect(queries[0]).toContain(ACCESS);
    expect(queries[0]).not.toContain("memo");
    expect(send.mock.calls[0]?.[2]).toBe(TIMEOUT_MS);
    expect(send.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
    });
    expect(page.rows.map(({ height, index }) => [height, index])).toEqual([
      [101, 0],
      [101, 1],
      [102, 0],
    ]);
    expect(page.rows.map(({ row: each }) => readChainRow(each, CONTEXT).events[0]?.height)).toEqual([101, 101, 102]);
    expect(page.more).toBe(false);
  });

  it("hands its signal to the request, so a stop ends it (F5886)", async () => {
    const { readers, send } = setup((query) =>
      query.includes("latestBlockHeight") ? answer({ latestBlockHeight: 5 }) : rowsOf([]),
    );
    const signal = AbortSignal.abort();
    await readers.catchUp(AFTER, TIP, signal);
    await readers.tip(signal);
    expect(send.mock.calls.map(([, init]) => init.signal)).toEqual([signal, signal]);
    const plain = setup(() => rowsOf([]));
    await plain.readers.catchUp(AFTER, TIP);
    expect(plain.send.mock.calls[0]?.[1]).not.toHaveProperty("signal");
  });

  it("gives each deployed realm's block time, for the poll to tell before its transaction, so a deploy recovered is counted like a live one", async () => {
    const { readers, queries } = setup((query) =>
      query.includes("getBlocks")
        ? times([101, 103], () => "2026-11-06T00:00:00.000Z")
        : rowsOf([withHash(101, "a", "d1"), row(102, "c"), withHash(103, "b", "d2")]),
    );
    const page = await readers.catchUp(AFTER, TIP);
    expect([...page.times]).toEqual([
      [101, "2026-11-06T00:00:00.000Z"],
      [103, "2026-11-06T00:00:00.000Z"],
    ]);
    expect(queries.filter((each) => each.includes("getBlocks"))).toHaveLength(1);
  });

  it("asks the blocks 100 heights at a time", async () => {
    const heights = Array.from({ length: 101 }, (_, n) => n + 1);
    const { readers, queries } = setup((query) =>
      query.includes("getBlocks")
        ? times(
            [...query.matchAll(/eq: (\d+)/g)].map(([, h = ""]) => Number(h)),
            () => "2026-11-06T00:00:00.000Z",
          )
        : rowsOf(heights.map((height) => withHash(height, `n${String(height)}`))),
    );
    expect((await readers.catchUp({ height: 0 }, TIP)).times.size).toBe(101);
    expect(queries.filter((each) => each.includes("getBlocks")).map((each) => each.match(/eq:/g)?.length)).toEqual([
      100, 1,
    ]);
  });

  it("gives no time for a deploy whose block the indexer did not give, nor when no realm was deployed", async () => {
    const missing = setup((query) =>
      query.includes("getBlocks") ? times([], () => "") : rowsOf([withHash(101, "a")]),
    );
    expect((await missing.readers.catchUp(AFTER, TIP)).times.size).toBe(0);
    const calls = setup(() => rowsOf([row(101, "b")]));
    expect((await calls.readers.catchUp(AFTER, TIP)).times.size).toBe(0);
    expect(calls.queries.filter((each) => each.includes("getBlocks"))).toHaveLength(0);
  });

  it("drops a row that has no place, said, and keeps the others", async () => {
    const { readers, log } = setup(() =>
      rowsOf([
        row(101, "b"),
        "x",
        { block_height: "7", index: 0 },
        { block_height: 7 },
        { block_height: 7, index: -1 },
        row(102, "c"),
      ]),
    );
    expect((await readers.catchUp(AFTER, TIP)).rows.map(({ height }) => height)).toEqual([101, 102]);
    expect(log).toHaveBeenCalledWith("chain_catch_up_row_bad");
    expect(log).toHaveBeenCalledTimes(4);
  });

  it("says a full page is followed by another, and a short one is the last", async () => {
    const full = setup(() => rowsOf(Array.from({ length: PAGE }, (_, n) => row(101 + n, String(n)))));
    expect((await full.readers.catchUp(AFTER, TIP)).more).toBe(true);
    const short = setup(() => rowsOf(Array.from({ length: PAGE - 1 }, (_, n) => row(101 + n, String(n)))));
    expect((await short.readers.catchUp(AFTER, TIP)).more).toBe(false);
  });

  it("says a full page of rows with no place is the last: nothing could move past them", async () => {
    const { readers } = setup(() => rowsOf(Array.from({ length: PAGE }, () => ({ block_height: "x" }))));
    expect((await readers.catchUp(AFTER, TIP)).more).toBe(false);
  });

  it.each([
    ["a status that is no success", () => answer({}, 502)],
    ["an answer that is no JSON", () => new Response("<html>")],
    ["an answer with errors", () => new Response(JSON.stringify({ data: null, errors: [{ message: "x" }] }))],
    [
      "an answer with rows and errors together",
      () => new Response(JSON.stringify({ data: { getTransactions: [] }, errors: [{ message: "x" }] })),
    ],
    ["an answer of no rows", () => answer({ other: 1 })],
    [
      "an answer of more rows than the page it asked for",
      () => rowsOf(Array.from({ length: PAGE + 1 }, (_, n) => ({ block_height: n, index: 0 }))),
    ],
  ])("fails, so the poll says it and backs off, on %s", async (_, reply) => {
    await expect(setup(reply).readers.catchUp(AFTER, TIP)).rejects.toThrow();
  });

  it("fails when the call itself times out or is refused", async () => {
    const { readers } = setup(() => {
      throw new DOMException("the operation timed out", "TimeoutError");
    });
    await expect(readers.catchUp(AFTER, TIP)).rejects.toThrow();
  });

  it("asks half the rows next when a page is past the size cap, said, and grows again once a full page fits (F5885)", async () => {
    let big = true;
    const { readers, queries, log } = setup((query) => {
      if (big && query.includes(`limit: ${String(PAGE)}`)) return tooBig();
      return rowsOf(Array.from({ length: PAGE / 2 }, (_, n) => row(101 + n, String(n))));
    });
    const first = await readers.catchUp(AFTER, TIP);
    expect(first).toEqual({ rows: [], times: new Map(), more: true });
    expect(log).toHaveBeenCalledWith("chain_catch_up_page_halved");
    const second = await readers.catchUp(AFTER, TIP);
    expect(queries.map((each) => /limit: (\d+)/.exec(each)?.[1])).toEqual([String(PAGE), String(PAGE / 2)]);
    expect(second.rows).toHaveLength(PAGE / 2);
    expect(second.more).toBe(true);
    big = false;
    await readers.catchUp(AFTER, TIP);
    expect(queries.at(-1)).toContain(`limit: ${String(PAGE)}`);
  });

  it("keeps the smaller page after a halving until a full one fits: a short page does not double it", async () => {
    let big = true;
    const { readers, queries } = setup((query) => {
      if (big && query.includes(`limit: ${String(PAGE)}`)) return tooBig();
      return rowsOf([row(101, "a")]);
    });
    await readers.catchUp(AFTER, TIP);
    big = false;
    await readers.catchUp(AFTER, TIP);
    await readers.catchUp(AFTER, TIP);
    expect(queries.map((each) => /limit: (\d+)/.exec(each)?.[1])).toEqual(["500", "250", "250"]);
  });

  it("halves down to one row, and never below", async () => {
    const { readers, queries } = setup((query) =>
      query.includes("block_height index }") ? rowsOf([{ block_height: 9, index: 2 }]) : tooBig(),
    );
    const limits = [];
    for (let n = 0; n < 11; n += 1) {
      await readers.catchUp(AFTER, TIP);
      limits.push(/limit: (\d+)/.exec(queries.at(-1) ?? "")?.[1]);
    }
    expect(limits).toEqual(["500", "250", "125", "62", "31", "15", "7", "3", "1", "1", "1"]);
  });

  it("passes a single row too big to read by its place alone, said (F5885)", async () => {
    const { readers, queries, log } = setup((query) =>
      query.includes("block_height index }") ? rowsOf([{ block_height: 9, index: 2 }]) : tooBig(),
    );
    let page = await readers.catchUp(AFTER, TIP);
    while (page.skipped === undefined) page = await readers.catchUp(AFTER, TIP);
    expect(page).toEqual({ rows: [], times: new Map(), more: true, skipped: { height: 9, index: 2 } });
    expect(log).toHaveBeenCalledWith("chain_catch_up_row_skipped");
    expect(queries.at(-1)).toContain("limit: 1) { block_height index }");
    expect(queries.at(-1)).toContain("block_height: { lt: 201 }");
  });

  it("fails when the place of the row too big is not given", async () => {
    const empty = setup((query) => (query.includes("block_height index }") ? rowsOf([]) : tooBig()));
    await expect(
      (async () => {
        for (let n = 0; n < 12; n += 1) await empty.readers.catchUp(AFTER, TIP);
      })(),
    ).rejects.toThrow("no place");
    const bad = setup((query) => (query.includes("block_height index }") ? rowsOf([{ block_height: "x" }]) : tooBig()));
    await expect(
      (async () => {
        for (let n = 0; n < 12; n += 1) await bad.readers.catchUp(AFTER, TIP);
      })(),
    ).rejects.toThrow("no place");
  });

  it("fails on a size cap that is not the answer's: a status or a text that is no JSON still fails and halves nothing", async () => {
    const { readers, log, queries } = setup(() => new Response("<html>"));
    await expect(readers.catchUp(AFTER, TIP)).rejects.toThrow();
    await expect(readers.catchUp(AFTER, TIP)).rejects.toThrow();
    expect(log).not.toHaveBeenCalled();
    expect(queries.map((each) => /limit: (\d+)/.exec(each)?.[1])).toEqual([String(PAGE), String(PAGE)]);
  });
});

describe("an answer that is no success", () => {
  it("fails on a status that is no success though its body is a good answer, and cuts the body off unread", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(JSON.stringify({ data: { latestBlockHeight: 5 } })));
      },
      cancel() {
        cancelled = true;
      },
    });
    const { readers } = setup(() => new Response(body, { status: 502 }));
    await expect(readers.tip()).rejects.toThrow("the indexer gave no answer");
    expect(cancelled).toBe(true);
    const good = setup(() => answer({ latestBlockHeight: 5 }, 502));
    await expect(good.readers.tip()).rejects.toThrow("the indexer gave no answer");
    const empty = setup(() => new Response(null, { status: 502 }));
    await expect(empty.readers.tip()).rejects.toThrow("the indexer gave no answer");
  });

  it("says an answer past the size cap is past it, for the tip too", async () => {
    await expect(setup(tooBig).readers.tip()).rejects.toThrow("past its size");
  });
});

describe("the tip", () => {
  it("asks, with a timeout, for the newest block the indexer holds", async () => {
    const { readers, queries, send } = setup(() => answer({ latestBlockHeight: 924852 }));
    await expect(readers.tip()).resolves.toBe(924852);
    expect(queries).toEqual(["{ latestBlockHeight }"]);
    expect(send.mock.calls[0]?.[2]).toBe(TIMEOUT_MS);
  });

  it("fails on a height of no shape: none, a text, a fraction, below zero", async () => {
    for (const height of [undefined, "924852", 1.5, -1]) {
      const { readers } = setup(() => answer({ latestBlockHeight: height }));
      await expect(readers.tip()).rejects.toThrow("the indexer gave no height");
    }
  });
});

describe("the 24 h history", () => {
  const SINCE = "2026-11-05T12:00:00.000Z";
  const fresh = (): string => "2026-11-06T00:00:00.000Z";

  it("asks the deploys from the newest, with a timeout, and the time of each block, and gives each realm once with its block's time", async () => {
    const { readers, queries, send } = setup((query) =>
      query.includes("getBlocks")
        ? times([20, 10], fresh)
        : rowsOf([deployRow(20, "a"), deployRow(10, "b"), deployRow(10, "b")]),
    );
    const deploys = await readers.history(SINCE);
    expect(queries[0]).toContain("heightAndIndex: DESC");
    expect(queries[0]).toContain("add_package");
    expect(queries[0]).not.toContain(SINCE);
    expect(send.mock.calls.every(([, , ms]) => ms === TIMEOUT_MS)).toBe(true);
    expect(deploys.toSorted((a, b) => a.height - b.height)).toEqual([
      { height: 10, time: fresh(), id: `gno.land/r/${ALICE}/b` },
      { height: 20, time: fresh(), id: `gno.land/r/${ALICE}/a` },
    ]);
  });

  it("stops at the first block older than the bound and keeps none older, by the block's time", async () => {
    let page = 0;
    const { readers, queries } = setup((query) => {
      if (query.includes("getBlocks"))
        return times([300, 200], (height) => (height === 300 ? fresh() : "2026-11-04T00:00:00.000Z"));
      page += 1;
      return rowsOf(
        Array.from({ length: HISTORY_PAGE }, (_, n) => deployRow(n === 0 ? 300 : 200, `p${String(page)}n${String(n)}`)),
      );
    });
    const deploys = await readers.history(SINCE);
    expect(deploys.every(({ time }) => time === fresh())).toBe(true);
    expect(queries.filter((each) => each.includes("getTransactions"))).toHaveLength(1);
  });

  it("counts a deploy whose block is exactly at the bound", async () => {
    const { readers } = setup((query) =>
      query.includes("getBlocks") ? times([20], () => SINCE) : rowsOf([deployRow(20, "a")]),
    );
    expect(await readers.history(SINCE)).toHaveLength(1);
  });

  it("asks the next page below the lowest block seen", async () => {
    const heights = [[50, 40], [30]];
    const { readers, queries } = setup((query) => {
      if (query.includes("getBlocks"))
        return times(
          [...query.matchAll(/eq: (\d+)/g)].map(([, h = ""]) => Number(h)),
          fresh,
        );
      const next = heights.shift() ?? [];
      return rowsOf(
        next
          .map((height) => deployRow(height, `n${String(height)}`))
          .concat(
            next.length > 1 ? Array.from({ length: HISTORY_PAGE - 2 }, (_, n) => deployRow(40, `x${String(n)}`)) : [],
          ),
      );
    });
    expect((await readers.history(SINCE)).length).toBeGreaterThan(2);
    expect(queries.find((each) => each.includes("lt: 41"))).toBeDefined();
  });

  it("counts realms only: a pure package, a call and a message with no path are no deploy", async () => {
    const message = (value: Record<string, unknown>) => ({ block_height: 20, messages: [{ value }] });
    const { readers } = setup((query) =>
      query.includes("getBlocks")
        ? times([20], fresh)
        : rowsOf([
            message({ __typename: "MsgAddPackage", package: { path: `gno.land/p/${ALICE}/lib` } }),
            message({ __typename: "MsgCall", pkg_path: `gno.land/r/${ALICE}/called` }),
            message({ __typename: "MsgAddPackage" }),
            message({ __typename: "MsgCall", package: { path: `gno.land/r/${ALICE}/notadeploy` } }),
            message({ __typename: "MsgAddPackage", package: { path: `gno.land/r/${ALICE}/real` } }),
          ]),
    );
    expect((await readers.history(SINCE)).map(({ id }) => id)).toEqual([`gno.land/r/${ALICE}/real`]);
  });

  it("does not count a deploy whose block the indexer did not give", async () => {
    const { readers } = setup((query) =>
      query.includes("getBlocks") ? times([20], fresh) : rowsOf([deployRow(20, "a"), deployRow(10, "b")]),
    );
    expect((await readers.history(SINCE)).map(({ id }) => id)).toEqual([`gno.land/r/${ALICE}/a`]);
  });

  it("refuses blocks past the heights it asked, and a page that moved no further", async () => {
    await expect(
      setup((query) =>
        query.includes("getBlocks") ? times([20, 21], fresh) : rowsOf([deployRow(20, "a")]),
      ).readers.history(SINCE),
    ).rejects.toThrow();
    const stuck = setup((query) =>
      query.includes("getBlocks")
        ? times([], fresh)
        : rowsOf(Array.from({ length: HISTORY_PAGE }, (_, n) => deployRow(50, `s${String(n)}`))),
    );
    await expect(stuck.readers.history(SINCE)).rejects.toThrow("past its cap");
    expect(stuck.queries.filter((each) => each.includes("getTransactions"))).toHaveLength(2);
  });

  it("drops a row that fails its schema, said", async () => {
    const { readers, log } = setup((query) =>
      query.includes("getBlocks") ? times([20], fresh) : rowsOf([{ block_height: "x" }, deployRow(20, "a")]),
    );
    expect(await readers.history(SINCE)).toHaveLength(1);
    expect(log).toHaveBeenCalledWith("chain_history_row_bad");
  });

  it("is no history, so no count, when the pages never end, when a status fails or the blocks are of no shape", async () => {
    let height = 1_000_000;
    const endless = setup((query) =>
      query.includes("getBlocks")
        ? times([], fresh)
        : rowsOf(Array.from({ length: HISTORY_PAGE }, () => deployRow((height -= 1), `e${String(height)}`))),
    );
    await expect(endless.readers.history(SINCE)).rejects.toThrow();
    expect(endless.queries.filter((each) => each.includes("getTransactions")).length).toBeLessThanOrEqual(
      HISTORY_PAGES,
    );
    await expect(setup(() => answer({}, 500)).readers.history(SINCE)).rejects.toThrow();
    await expect(
      setup((query) =>
        query.includes("getBlocks") ? answer({ getBlocks: "x" }) : rowsOf([deployRow(5, "a")]),
      ).readers.history(SINCE),
    ).rejects.toThrow();
  });
});

// Survivors of StrykerJS: each failure says what it is.
describe("what the readers say", () => {
  it("fails a catch-up with the reason: no answer, rows of no shape, blocks of no shape", async () => {
    const errors = setup(() => new Response(JSON.stringify({ data: {}, errors: [{ message: "no" }] })));
    await expect(errors.readers.catchUp(AFTER, TIP)).rejects.toThrow("the indexer gave no answer");
    const shapeless = setup(() => answer({ getTransactions: "rows" }));
    await expect(shapeless.readers.catchUp(AFTER, TIP)).rejects.toThrow("no rows of that shape");
    const noBlocks = setup((query) =>
      query.includes("getBlocks") ? answer({ getBlocks: "none" }) : rowsOf([withHash(101, "a")]),
    );
    await expect(noBlocks.readers.catchUp(AFTER, TIP)).rejects.toThrow("no such shape");
  });
});
