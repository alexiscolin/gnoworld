import { describe, expect, it, vi } from "vitest";
import type { ChainFetch } from "./read.ts";
import { readCallFees } from "./fees.ts";

// Answer 9d-1: the fee line is an estimate from the last successful calls of one function, its block named. The wire is the
// recording's field names (SHARED/recordings/README.md), not a recorded answer. The indexer's `order` and `limit` arguments were
// read from its live schema (F5729), so the newest are still chosen here, by block, whatever order it answers in.
const INDEXER = "https://indexer.onyx.testnets.gno.land/graphql/query";
const REALM = "gno.land/r/sys/namereg/v0";
interface Over {
  denom?: string;
  pkg_path?: string;
  func?: string;
  success?: boolean;
}
const row = (
  amount: number,
  block_height = 100,
  { denom = "ugnot", pkg_path = REALM, func = "Register", success = true }: Over = {},
) => ({
  success,
  block_height,
  gas_fee: { amount, denom },
  messages: [{ value: { pkg_path, func } }],
});
const TIP = 5_000_000;
const answer = (rows: unknown) =>
  vi.fn<ChainFetch>(() =>
    Promise.resolve(new Response(JSON.stringify({ data: { latestBlockHeight: TIP, getTransactions: rows } }))),
  );
// An indexer that holds `rows` and answers a transaction query with those above its `from` variable, the tip to any other.
const holding = (rows: ReturnType<typeof row>[]) =>
  vi.fn<ChainFetch>((url) => {
    const asked = new URL(url).searchParams;
    const { from } = JSON.parse(asked.get("variables") ?? "{}") as { from?: number };
    const data = asked.get("query")?.includes("getTransactions")
      ? { getTransactions: rows.filter((r) => r.block_height > (from ?? 0)) }
      : { latestBlockHeight: TIP };
    return Promise.resolve(new Response(JSON.stringify({ data })));
  });
const sent = (fetch: ReturnType<typeof holding>) =>
  fetch.mock.calls.flatMap(([url]) =>
    new URL(url).searchParams.get("query")?.includes("getTransactions")
      ? [(JSON.parse(new URL(url).searchParams.get("variables") ?? "{}") as { from?: number }).from]
      : [],
  );
const fees = async (rows: unknown) => {
  const read = await readCallFees(INDEXER, { realm: REALM, func: "Register" }, { fetch: answer(rows) });
  return read.ok ? read.value : read;
};

describe("readCallFees", () => {
  it("gives the fees in ugnot the last calls of that realm and function paid, newest first, with the newest block, in one GET that names both", async () => {
    const fetch = answer([row(48000, 100), row(1000000, 102), row(52000, 101)]);
    const read = await readCallFees(INDEXER, { realm: REALM, func: "Register" }, { fetch });
    expect(read).toMatchObject({ ok: true, value: { fees: [1000000, 52000, 48000], height: 102 } });
    const [url] = fetch.mock.calls.at(-1) ?? [""];
    expect(decodeURIComponent(url)).toContain(REALM);
    expect(decodeURIComponent(url)).toContain("Register");
    expect(decodeURIComponent(url)).toContain("success");
  });

  it("keeps only ugnot, and only the calls of that realm and function: the server's filter is checked again", async () => {
    expect(
      await fees([
        row(10, 100, { denom: "uatom" }),
        row(20, 100, { pkg_path: "gno.land/r/other" }),
        row(30, 100, { func: "Other" }),
        row(40),
      ]),
    ).toMatchObject({ fees: [40] });
  });

  it("drops a call that failed: its fee was paid and nothing was done, so it is no estimate of a call that works", async () => {
    expect(await fees([row(9_000_000, 105, { success: false }), row(40, 100), row(50, 99)])).toEqual({
      fees: [40, 50],
      height: 100,
    });
  });

  it("is not thrown by the messages that are not a call, which the indexer lets through: they are not counted, the read stays whole", async () => {
    const foreign = {
      success: true,
      block_height: 110,
      gas_fee: { amount: 7, denom: "ugnot" },
      messages: [{ value: {} }],
    };
    const none = { success: true, block_height: 111, gas_fee: { amount: 8, denom: "ugnot" }, messages: [{}] };
    expect(await fees([foreign, none, row(40)])).toEqual({ fees: [40], height: 100 });
  });

  it("does not count a transaction of several messages: its fee paid for all of them, it is no one call's", async () => {
    const two = { ...row(500_000, 120), messages: [{ value: {} }, { value: { pkg_path: REALM, func: "Register" } }] };
    expect(await fees([two, row(40)])).toEqual({ fees: [40], height: 100 });
  });

  it("keeps the 20 newest by block whatever order the indexer answers in, and drops an amount that is no whole non-negative number", async () => {
    const many = Array.from({ length: 30 }, (_, i) => row(1000 + i, 200 + i));
    const shuffled = [...many.slice(10), row(-5, 300), row(1.5, 301), ...many.slice(0, 10)].reverse();
    const read = await fees(shuffled);
    expect(read).toEqual({
      fees: many
        .slice(10)
        .map((r) => r.gas_fee.amount)
        .reverse(),
      height: 229,
    });
  });

  it("drops a row with no block, and gives no fee and no block when none is left", async () => {
    const lost = { ...row(40), block_height: undefined };
    expect(await fees([lost])).toEqual({ fees: [], height: 0 });
    expect(await fees([])).toEqual({ fees: [], height: 0 });
  });

  it("asks only for the blocks of a window under the tip, never every call the function ever had (F5724)", async () => {
    const recent = Array.from({ length: 25 }, (_, i) => row(1000 + i, TIP - 100 + i));
    const old = [row(9, 10), row(8, 11)];
    const fetch = holding([...old, ...recent]);
    const read = await readCallFees(INDEXER, { realm: REALM, func: "Register" }, { fetch });
    expect(read).toMatchObject({ ok: true, value: { height: TIP - 76 } });
    expect(read.ok && read.value.fees).toHaveLength(20);
    expect(sent(fetch)).toEqual([TIP - 1_000]);
  });

  it("asks the indexer for the newest 60 only, in the query: its answer has a bound whatever the function's history (F5729)", async () => {
    const fetch = holding([row(7)]);
    await readCallFees(INDEXER, { realm: REALM, func: "Register" }, { fetch });
    const queries = fetch.mock.calls.map(([url]) => new URL(url).searchParams.get("query") ?? "");
    const transactions = queries.filter((query) => query.includes("getTransactions"));
    expect(transactions.length).toBeGreaterThan(0);
    for (const query of transactions) {
      expect(query).toContain("order: { heightAndIndex: DESC }");
      expect(query).toContain("limit: 60");
    }
  });

  it("widens the window while fewer than 20 calls come back, and gives up past a million blocks (F5724)", async () => {
    const few = [row(7, TIP - 50_000), row(8, TIP - 400_000)];
    const fetch = holding(few);
    const read = await readCallFees(INDEXER, { realm: REALM, func: "Register" }, { fetch });
    expect(read).toMatchObject({ ok: true, value: { fees: [7, 8], height: TIP - 50_000 } });
    expect(sent(fetch)).toEqual([TIP - 1_000, TIP - 10_000, TIP - 100_000, TIP - 1_000_000]);
    const none = holding([]);
    await readCallFees(INDEXER, { realm: REALM, func: "Register" }, { fetch: none });
    expect(sent(none)).toHaveLength(4);
  });

  it("is a failure with a next step for an answer of the wrong shape, an address that is not https and a name past the cap", async () => {
    expect(await readCallFees(INDEXER, { realm: REALM, func: "Register" }, { fetch: answer("no") })).toMatchObject({
      ok: false,
    });
    const fetch = answer([]);
    expect(await readCallFees("http://x.example/graphql", { realm: REALM, func: "Register" }, { fetch })).toMatchObject(
      { ok: false },
    );
    expect(await readCallFees(INDEXER, { realm: REALM, func: "R".repeat(200) }, { fetch })).toMatchObject({
      ok: false,
    });
    expect(await readCallFees(INDEXER, { realm: "r".repeat(300), func: "Register" }, { fetch })).toMatchObject({
      ok: false,
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});
