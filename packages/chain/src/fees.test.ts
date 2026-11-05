import { describe, expect, it, vi } from "vitest";
import type { ChainFetch } from "./read.ts";
import { readCallFees } from "./fees.ts";

// Answer 9d-1: the fee line is an estimate from the last successful calls of one function, its block named. The wire is the
// recording's field names (SHARED/recordings/README.md), not a recorded answer; no `order` or `limit` argument is recorded, so
// the newest are chosen here, by block, whatever order the indexer answers in.
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
const answer = (rows: unknown) =>
  vi.fn<ChainFetch>(() => Promise.resolve(new Response(JSON.stringify({ data: { getTransactions: rows } }))));
const fees = async (rows: unknown) => {
  const read = await readCallFees(INDEXER, { realm: REALM, func: "Register" }, { fetch: answer(rows) });
  return read.ok ? read.value : read;
};

describe("readCallFees", () => {
  it("gives the fees in ugnot the last calls of that realm and function paid, newest first, with the newest block, in one GET that names both", async () => {
    const fetch = answer([row(48000, 100), row(1000000, 102), row(52000, 101)]);
    const read = await readCallFees(INDEXER, { realm: REALM, func: "Register" }, { fetch });
    expect(read).toMatchObject({ ok: true, value: { fees: [1000000, 52000, 48000], height: 102 } });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url] = fetch.mock.calls[0] ?? [""];
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
