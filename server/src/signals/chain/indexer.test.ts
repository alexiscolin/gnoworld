import { describe, expect, it, vi } from "vitest";
import { call } from "../../testing/chainRecorded.ts";
import {
  HISTORY_PAGE,
  HISTORY_PAGES,
  indexerReaders,
  MAX_BYTES,
  PAGE,
  PAGES,
  TIMEOUT_MS,
  type IndexerLog,
} from "./indexer.ts";
import { readChainMessage } from "./message.ts";

// Slice 9g (red pass): the only two reads of the indexer's untrusted HTTP answers, driven by a fake `send`: the query they
// ask, the schema every answer goes through, the timeout, and a cap on every size and every loop.
const ACCESS = "gno.land/r/g14wv9hyngyrzpxn3ztvnx2jygs50m0240qncm8j/access";
const ALICE = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
const recorded = (): Record<string, unknown> =>
  (JSON.parse(call) as { payload: { data: { getTransactions: Record<string, unknown> } } }).payload.data
    .getTransactions;
const row = (height: number, hash: string): Record<string, unknown> => ({ ...recorded(), block_height: height, hash });
const answer = (data: unknown, status = 200): Response => new Response(JSON.stringify({ data }), { status });
const rowsOf = (rows: unknown[]): Response => answer({ getTransactions: rows });
const deployRow = (height: number, name: string) => ({
  block_height: height,
  messages: [
    { value: { __typename: "MsgAddPackage", creator: ALICE, package: { path: `gno.land/r/${ALICE}/${name}` } } },
  ],
});
const withHash = (height: number, name: string, hash = `h${String(height)}`) => ({
  ...deployRow(height, name),
  hash,
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

describe("the catch-up", () => {
  it("asks, with a timeout, for the transactions from the height on, in order, and gives each as the subscription's own text", async () => {
    const { readers, queries, send } = setup(() => rowsOf([row(101, "b"), row(102, "c")]));
    const texts = await readers.catchUp(101);
    expect(queries[0]).toContain("gt: 100");
    expect(queries[0]).toContain("heightAndIndex: ASC");
    expect(queries[0]).toContain(ACCESS);
    expect(queries[0]).not.toContain("memo");
    expect(send.mock.calls[0]?.[2]).toBe(TIMEOUT_MS);
    expect(send.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
    });
    const read = texts.map((text) =>
      readChainMessage(text, {
        universe: "onyx",
        watch: new Map([[ACCESS, { world: "access" }]]),
        log: () => undefined,
      }),
    );
    expect(read.map(({ events }) => events[0]?.height)).toEqual([101, 102]);
  });

  it("gives each deployed realm's block time before its transaction, so a deploy recovered is counted like a live one", async () => {
    const { readers, queries } = setup((query) =>
      query.includes("getBlocks")
        ? times([101, 103], () => "2026-11-06T00:00:00.000Z")
        : rowsOf([withHash(101, "a", "d1"), row(102, "c"), withHash(103, "b", "d2")]),
    );
    const context = { universe: "onyx", watch: new Map([[ACCESS, { world: "access" }]]), log: () => undefined };
    const read = (await readers.catchUp(101)).map((text) => readChainMessage(text, context));
    expect(read.map(({ block, height }) => block?.height ?? height)).toEqual([101, 101, 102, 103, 103]);
    expect(read.map(({ block }) => block !== undefined)).toEqual([true, false, false, true, false]);
    expect(read[0]?.block?.time).toBe("2026-11-06T00:00:00.000Z");
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
    expect(await readers.catchUp(1)).toHaveLength(202);
    expect(queries.filter((each) => each.includes("getBlocks")).map((each) => each.match(/eq:/g)?.length)).toEqual([
      100, 1,
    ]);
  });

  it("gives a block's time once, before the first of the deploys it holds", async () => {
    const { readers } = setup((query) =>
      query.includes("getBlocks")
        ? times([101], () => "2026-11-06T00:00:00.000Z")
        : rowsOf([withHash(101, "a"), withHash(101, "b")]),
    );
    const kinds = (await readers.catchUp(101)).map((text) => (text.includes("getBlocks") ? "block" : "tx"));
    expect(kinds).toEqual(["block", "tx", "tx"]);
  });

  it("gives no block for a deploy whose block the indexer did not give, nor when no realm was deployed", async () => {
    const lone = withHash(101, "a");
    const missing = setup((query) => (query.includes("getBlocks") ? times([], () => "") : rowsOf([lone])));
    expect(await missing.readers.catchUp(101)).toHaveLength(1);
    const calls = setup(() => rowsOf([row(101, "b")]));
    expect(await calls.readers.catchUp(101)).toHaveLength(1);
    expect(calls.queries.filter((each) => each.includes("getBlocks"))).toHaveLength(0);
  });

  it("drops a row that is no transaction, said, and keeps the others", async () => {
    const { readers, log } = setup(() => rowsOf([row(101, "b"), "x", { block_height: "7" }, row(102, "c")]));
    expect(await readers.catchUp(100)).toHaveLength(2);
    expect(log).toHaveBeenCalledWith("chain_catch_up_row_bad");
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
    ["an answer past its size", () => new Response(`{"data":"${"x".repeat(MAX_BYTES)}"}`)],
    [
      "an answer of 100,000 rows when it asked for a page",
      () => rowsOf(Array.from({ length: 100_000 }, (_, n) => row(n, String(n)))),
    ],
  ])("fails, so the follower says it and connects again, on %s", async (_, reply) => {
    await expect(setup(reply).readers.catchUp(1)).rejects.toThrow();
  });

  it("fails when the call itself times out or is refused", async () => {
    const { readers } = setup(() => {
      throw new DOMException("the operation timed out", "TimeoutError");
    });
    await expect(readers.catchUp(1)).rejects.toThrow();
  });

  it("stops at its pages' cap, said, when the indexer never ends", async () => {
    let height = 0;
    const { readers, log, queries } = setup(() =>
      rowsOf(Array.from({ length: PAGE }, () => row((height += 1), String(height)))),
    );
    expect((await readers.catchUp(1)).length).toBe(PAGE * PAGES);
    expect(queries).toHaveLength(PAGES);
    expect(log).toHaveBeenCalledWith("chain_catch_up_capped");
  });

  it("stops, said, when a full page moves no further", async () => {
    const { readers, log, queries } = setup(() => rowsOf(Array.from({ length: PAGE }, (_, n) => row(7, String(n)))));
    await readers.catchUp(7);
    expect(queries).toHaveLength(1);
    expect(log).toHaveBeenCalledWith("chain_catch_up_capped");
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
