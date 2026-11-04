import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fakeChain, INDEXER, pagedCalls, type CallRow } from "../testing/fakeWorldsChain.ts";
import { HISTORY_MAX_BYTES, HISTORY_MAX_PAGES, HISTORY_PAGE, readHistories } from "./history.ts";

// The worlds job's one read of the indexer (7k3): every call of the chain, a page at a time, counted for the realms asked. onyx-1's own
// answers to its queries are recorded in onyxIndexer.json. History holds DIRECT calls only, and a line may be a failed transaction: a
// count is a count of attempts, and a realm with none is not dead.
const PATH = "gno.land/r/samcrew/launchpad/market/v1";
const OTHER = "gno.land/r/b/other";
const CALLER_A = "g10ragdr3cjqkael8rslpw4y6rlelhev4h0fswcx";
const CALLER_B = "g1kfj7rq3cjqkael8rslpw4y6rlelhev4h0fswcx";
const CALLER_C = "g1ut6usp7lsurwsk9n3cyeu3ckn8ftw7mtufzhcz";

const msg = (path: string, caller?: string) => ({
  value:
    caller === undefined
      ? { __typename: "MsgCall", pkg_path: path }
      : { __typename: "MsgCall", pkg_path: path, caller },
});
const call = (height: number, caller: string, path = PATH): CallRow => ({
  block_height: height,
  messages: [msg(path, caller)],
});
const burst = (height: number, caller: string, calls: number): CallRow => ({
  block_height: height,
  messages: Array.from({ length: calls }, () => msg(PATH, caller)),
});
const answer = (rows: readonly unknown[] | null) => JSON.stringify({ data: { getTransactions: rows } });

type Given = Parameters<typeof fakeChain>[0]["indexer"];
const reading = (
  given: Given,
  options: { paths?: string[]; page?: number; since?: Record<string, number>; isStopped?: () => boolean } = {},
) => {
  const chain = fakeChain({ indexer: given });
  const since = options.since ?? {};
  const read = () =>
    readHistories(
      { send: chain.send, indexer: INDEXER, ...(options.page === undefined ? {} : { page: options.page }) },
      options.paths ?? [PATH, OTHER],
      { sinceOf: (path) => since[path], ...(options.isStopped === undefined ? {} : { isStopped: options.isStopped }) },
    );
  return { chain, read };
};
// Each realm's history, read from `rows` paged as onyx-1 pages them; a read that failed as itself.
const histories = async (rows: CallRow[], options: Parameters<typeof reading>[1] = {}) => {
  const read = await reading(pagedCalls(rows), options).read();
  return read.ok ? Object.fromEntries(read.histories) : read;
};
const variablesOf = (data: string | undefined): Record<string, unknown> =>
  (JSON.parse(data ?? "{}") as { variables: Record<string, unknown> }).variables;
const queryOf = (data: string | undefined): string => (JSON.parse(data ?? "{}") as { query: string }).query;
const asked = (chain: { asked: { data: string }[] }) => chain.asked.map(({ data }) => variablesOf(data));
const none = { calls: 0, callers: 0, lastHeight: null };

describe("readHistories", () => {
  it("counts each realm's calls, their distinct callers and its last height, and leaves the deploys out of the calls", async () => {
    const rows = [
      { block_height: 230_000, messages: [{ value: { __typename: "MsgAddPackage", creator: CALLER_A } }] },
      call(230_768, CALLER_B),
      call(230_800, CALLER_C, OTHER),
      call(230_808, CALLER_B),
      call(230_845, CALLER_A),
    ];
    expect(await histories(rows)).toEqual({
      [PATH]: { calls: 3, callers: 2, lastHeight: 230_845 },
      [OTHER]: { calls: 1, callers: 1, lastHeight: 230_800 },
    });
  });

  it("counts each call message of a transaction, and leaves out the messages that are no call", async () => {
    const rows = [
      {
        block_height: 10,
        messages: [
          msg(PATH, CALLER_A),
          msg(PATH, CALLER_A),
          { value: { __typename: "MsgRun", caller: CALLER_B } },
          { value: { __typename: "MsgSend" } },
          { value: { __typename: "UnexpectedMessage" } },
        ],
      },
    ];
    expect(await histories(rows, { paths: [PATH] })).toEqual({ [PATH]: { calls: 2, callers: 1, lastHeight: 10 } });
  });

  it("counts for each realm only the messages aimed at it: a transaction bundling calls to two realms adds to each its own", async () => {
    const rows = [
      { block_height: 9, messages: [msg(PATH, CALLER_A), msg(OTHER, CALLER_B), msg(OTHER, CALLER_B)] },
      call(12, CALLER_B, OTHER),
    ];
    expect(await histories(rows)).toEqual({
      [PATH]: { calls: 1, callers: 1, lastHeight: 9 },
      [OTHER]: { calls: 3, callers: 1, lastHeight: 12 },
    });
  });

  it("gives every realm asked a history, one with no call as none, and none to a realm it was not asked about", async () => {
    expect(await histories([call(5, CALLER_A, "gno.land/r/not/asked")])).toEqual({ [PATH]: none, [OTHER]: none });
  });

  it("gives every realm none for a chain with no call: onyx-1's empty page is null, not a list", async () => {
    expect(await histories([])).toEqual({ [PATH]: none, [OTHER]: none });
  });

  // One odd call must not stop every realm's counts on every pass, as one odd answer stopped one realm's before (the red pass's F1).
  describe("an odd call in the chain", () => {
    it("counts a call whose caller is no address as a call with none, and says it left something out", async () => {
      const rows = [{ block_height: 1, messages: [msg(PATH, 'g1"; evil')] }, call(2, CALLER_A)];
      const read = await reading(pagedCalls(rows), { paths: [PATH] }).read();
      expect(read).toEqual({
        ok: true,
        skipped: 1,
        histories: new Map([[PATH, { calls: 2, callers: 1, lastHeight: 2 }]]),
      });
    });

    it("leaves out a call that names no path, for it cannot be tied to a realm, and says so", async () => {
      const rows = [
        { block_height: 9, messages: [{ value: { __typename: "MsgCall", caller: CALLER_A } }] },
        call(10, CALLER_B),
      ];
      expect(await reading(pagedCalls(rows), { paths: [PATH] }).read()).toEqual({
        ok: true,
        skipped: 1,
        histories: new Map([[PATH, { calls: 1, callers: 1, lastHeight: 10 }]]),
      });
    });

    it("says it left nothing out when every call was whole", async () => {
      expect(await reading(pagedCalls([call(1, CALLER_A)]), { paths: [PATH] }).read()).toMatchObject({
        ok: true,
        skipped: 0,
      });
    });
  });

  // 7t3's window: what a realm drew between the job's last two passes, counted from the height the last file wrote for it. A transaction is
  // one however many calls it bundles, so one address's burst counts once; its senders are given, for a world's realms count each once.
  describe("above the height the last file wrote for each realm", () => {
    it("counts the transactions with a call to the realm, a transaction of five calls once, and the different addresses that sent them", async () => {
      const rows = [
        call(100, CALLER_A),
        burst(101, CALLER_A, 5),
        call(102, CALLER_B),
        { block_height: 103, messages: [{ value: { __typename: "MsgAddPackage", creator: CALLER_C } }] },
        call(104, CALLER_B),
        call(105, CALLER_C, OTHER),
      ];
      expect(await histories(rows, { paths: [PATH], since: { [PATH]: 100 } })).toEqual({
        [PATH]: {
          calls: 8,
          callers: 2,
          lastHeight: 104,
          recent: {
            transactions: [`101:${CALLER_A}`, `102:${CALLER_B}`, `104:${CALLER_B}`],
            callers: [CALLER_A, CALLER_B],
          },
        },
      });
    });

    it("counts each realm's window from its own height", async () => {
      const rows = [call(100, CALLER_A), call(101, CALLER_B, OTHER), call(102, CALLER_C), call(103, CALLER_C, OTHER)];
      expect(await histories(rows, { since: { [PATH]: 101, [OTHER]: 0 } })).toMatchObject({
        [PATH]: { recent: { transactions: [`102:${CALLER_C}`], callers: [CALLER_C] } },
        [OTHER]: { recent: { transactions: [`101:${CALLER_B}`, `103:${CALLER_C}`], callers: [CALLER_B, CALLER_C] } },
      });
    });

    it("keeps a window whole across the pages it spans", async () => {
      const rows = [call(1, CALLER_A), call(2, CALLER_B), call(3, CALLER_A), call(3, CALLER_B), call(4, CALLER_A)];
      expect(await histories(rows, { paths: [PATH], page: 3, since: { [PATH]: 2 } })).toEqual({
        [PATH]: {
          calls: 5,
          callers: 2,
          lastHeight: 4,
          recent: { transactions: [`3:${CALLER_A}`, `3:${CALLER_B}`, `4:${CALLER_A}`], callers: [CALLER_A, CALLER_B] },
        },
      });
    });

    it("counts nothing at the height itself, the last pass's, and every call above a height of none", async () => {
      const rows = [call(100, CALLER_A), call(101, CALLER_B)];
      expect(await histories(rows, { paths: [PATH], since: { [PATH]: 101 } })).toMatchObject({
        [PATH]: { recent: { transactions: [], callers: [] } },
      });
      expect(await histories(rows, { paths: [PATH], since: { [PATH]: 0 } })).toMatchObject({
        [PATH]: { recent: { transactions: [`100:${CALLER_A}`, `101:${CALLER_B}`], callers: [CALLER_A, CALLER_B] } },
      });
    });

    it("gives the transactions and the addresses sorted, whatever order the calls came in", async () => {
      const rows = [call(101, CALLER_B), call(102, CALLER_A), call(103, CALLER_B)];
      expect(await histories(rows, { paths: [PATH], since: { [PATH]: 100 } })).toMatchObject({
        [PATH]: {
          recent: {
            transactions: [`101:${CALLER_B}`, `102:${CALLER_A}`, `103:${CALLER_B}`],
            callers: [CALLER_A, CALLER_B],
          },
        },
      });
    });

    it("counts a call that names no caller as its transaction, with no address", async () => {
      const rows = [{ block_height: 101, messages: [msg(PATH)] }, call(102, CALLER_A)];
      expect(await histories(rows, { paths: [PATH], since: { [PATH]: 100 } })).toMatchObject({
        [PATH]: { calls: 2, callers: 1, recent: { transactions: ["101:", `102:${CALLER_A}`], callers: [CALLER_A] } },
      });
    });

    // The security review of 7t3: one transaction calling K realms of a world counted K times, past the floor. Its mark is its height and its
    // senders, so the world counts it once, whichever realms it called.
    it("marks a transaction by its height and its senders, whatever calls it bundles, so a world's realms count it once", async () => {
      const both = { block_height: 101, messages: [msg(PATH, CALLER_B), msg(PATH, CALLER_A), msg(PATH, CALLER_B)] };
      expect(await histories([both], { paths: [PATH], since: { [PATH]: 100 } })).toMatchObject({
        [PATH]: { recent: { transactions: [`101:${CALLER_A},${CALLER_B}`], callers: [CALLER_A, CALLER_B] } },
      });
    });

    // The second round of 7t3's review: one transaction signed by two, each calling a realm of one world, gave each realm the mark of its
    // own caller: two marks, two transactions. A mark carries the senders of all the transaction's calls, so each realm gives the same.
    it("marks a transaction by the senders of all its calls, so a realm called by one of its signers gives the mark another realm does", async () => {
      const both = { block_height: 101, messages: [msg(PATH, CALLER_A), msg(OTHER, CALLER_B)] };
      const mark = `101:${CALLER_A},${CALLER_B}`;
      expect(await histories([both], { since: { [PATH]: 100, [OTHER]: 100 } })).toEqual({
        [PATH]: { calls: 1, callers: 1, lastHeight: 101, recent: { transactions: [mark], callers: [CALLER_A] } },
        [OTHER]: { calls: 1, callers: 1, lastHeight: 101, recent: { transactions: [mark], callers: [CALLER_B] } },
      });
    });

    it("gives no window to a realm the last file never read", async () => {
      expect(await histories([call(101, CALLER_A)], { paths: [PATH] })).toEqual({
        [PATH]: { calls: 1, callers: 1, lastHeight: 101 },
      });
    });
  });

  // onyx-1's indexer cuts a page at its size and pages by height: a block may straddle two pages, so each page's last block is read again
  // whole on the next, a page of one block is read as that block alone, and only an empty page ends the read, for an indexer may give fewer
  // rows than asked. A negative bound answers nothing there (recorded), so the first page has none.
  describe("a page at a time", () => {
    it("asks the first page with no bound and its size, then each next above the last whole block, and the last block alone", async () => {
      const rows = [call(1, CALLER_A), call(2, CALLER_A), call(3, CALLER_A), call(3, CALLER_B), call(4, CALLER_A)];
      const { chain, read } = reading(pagedCalls(rows), { paths: [PATH], page: 3 });
      expect(await read()).toEqual({
        ok: true,
        skipped: 0,
        histories: new Map([[PATH, { calls: 5, callers: 2, lastHeight: 4 }]]),
      });
      expect(asked(chain)).toEqual([
        { limit: 3 },
        { above: 2, limit: 3 },
        { above: 3, limit: 3 },
        { height: 4 },
        { above: 4, limit: 3 },
      ]);
    });

    it("reads a block cut by a page's end once, whole: each call counted once, none lost", async () => {
      const rows = [call(1, CALLER_A), call(2, CALLER_A), call(2, CALLER_B), call(3, CALLER_C), call(5, CALLER_A)];
      expect(await histories(rows, { paths: [PATH], page: 3 })).toEqual({
        [PATH]: { calls: 5, callers: 3, lastHeight: 5 },
      });
    });

    it("reads a block that fills a page alone by itself, every call of it counted", async () => {
      const rows = [burst(7, CALLER_A, 1), call(7, CALLER_B), call(7, CALLER_C), call(7, CALLER_A), call(9, CALLER_B)];
      const { chain, read } = reading(pagedCalls(rows), { paths: [PATH], page: 3 });
      expect(await read()).toEqual({
        ok: true,
        skipped: 0,
        histories: new Map([[PATH, { calls: 5, callers: 3, lastHeight: 9 }]]),
      });
      expect(asked(chain)).toEqual([
        { limit: 3 },
        { height: 7 },
        { above: 7, limit: 3 },
        { height: 9 },
        { above: 9, limit: 3 },
      ]);
    });

    it("ends only at an empty page: an indexer that gives fewer rows than asked is read to its end", async () => {
      const rows = [call(1, CALLER_A), call(2, CALLER_A), call(3, CALLER_A), call(4, CALLER_A)];
      const capped = (request: { query: string; variables: Record<string, unknown> }) => {
        const page = pagedCalls(rows)(request);
        if (typeof page !== "string" || typeof request.variables["height"] === "number") return page;
        const kept = (JSON.parse(page) as { data: { getTransactions: unknown[] | null } }).data.getTransactions;
        return answer(kept === null ? null : kept.slice(0, 2));
      };
      expect(await reading(capped, { paths: [PATH], page: 5 }).read()).toMatchObject({
        ok: true,
        histories: new Map([[PATH, { calls: 4, callers: 1, lastHeight: 4 }]]),
      });
    });

    it("reads an indexer that gives more rows than asked, each call once", async () => {
      const rows = [call(1, CALLER_A), call(2, CALLER_A), call(3, CALLER_B)];
      const loose = (request: { query: string; variables: Record<string, unknown> }) =>
        pagedCalls(rows)({ ...request, variables: { ...request.variables, limit: 100 } });
      expect(await reading(loose, { paths: [PATH], page: 2 }).read()).toMatchObject({
        ok: true,
        histories: new Map([[PATH, { calls: 3, callers: 2, lastHeight: 3 }]]),
      });
    });

    it("never asks a negative bound, even when the first page is all the chain's first block", async () => {
      const rows = [call(0, CALLER_A), call(0, CALLER_B), call(0, CALLER_C), call(1, CALLER_A)];
      const { chain, read } = reading(pagedCalls(rows), { paths: [PATH], page: 3 });
      expect(await read()).toMatchObject({
        ok: true,
        histories: new Map([[PATH, { calls: 4, callers: 3, lastHeight: 1 }]]),
      });
      expect(asked(chain)).toEqual([
        { limit: 3 },
        { height: 0 },
        { above: 0, limit: 3 },
        { height: 1 },
        { above: 1, limit: 3 },
      ]);
    });

    it("asks pages of its default size unless told", async () => {
      const { chain, read } = reading(pagedCalls([]), { paths: [PATH] });
      await read();
      expect(asked(chain)).toEqual([{ limit: HISTORY_PAGE }]);
    });

    it("asks a page past the byte cap again with half its rows until it fits, and the next page at its size again", async () => {
      const rows = [call(1, CALLER_A), call(2, CALLER_B)];
      const big = "x".repeat(HISTORY_MAX_BYTES + 1);
      const heavy = (request: { query: string; variables: Record<string, unknown> }) =>
        Number(request.variables["limit"]) > 500 ? big : pagedCalls(rows)(request);
      const { chain, read } = reading(heavy, { paths: [PATH] });
      expect(await read()).toMatchObject({
        ok: true,
        histories: new Map([[PATH, { calls: 2, callers: 2, lastHeight: 2 }]]),
      });
      expect(asked(chain).slice(0, 4)).toEqual([
        { limit: 2000 },
        { limit: 1000 },
        { limit: 500 },
        { above: 1, limit: 2000 },
      ]);
    });

    it("fails whole as too large only when a page of one row is past the cap", async () => {
      const big = "x".repeat(HISTORY_MAX_BYTES + 1);
      const { chain, read } = reading(() => big, { paths: [PATH] });
      expect(await read()).toEqual({ ok: false, kind: "too_large" });
      expect(asked(chain).map(({ limit }) => limit)).toEqual([2000, 1000, 500, 250, 125, 63, 32, 16, 8, 4, 2, 1]);
    });

    it("fails whole as too large when a block alone is past the cap", async () => {
      const big = "x".repeat(HISTORY_MAX_BYTES + 1);
      const blocky = (request: { query: string; variables: Record<string, unknown> }) =>
        typeof request.variables["height"] === "number" ? big : answer([call(5, CALLER_A), call(5, CALLER_B)]);
      expect(await reading(blocky, { paths: [PATH], page: 2 }).read()).toEqual({ ok: false, kind: "too_large" });
    });

    it("gives up past its most pages as too many, every realm without a history rather than half of one", async () => {
      let height = 0;
      const endless = ({ variables }: { variables: Record<string, unknown> }) =>
        answer(Array.from({ length: Number(variables["limit"]) }, () => call((height += 1), CALLER_A)));
      const { chain, read } = reading(endless, { paths: [PATH], page: 2 });
      expect(await read()).toEqual({ ok: false, kind: "too_many" });
      expect(chain.asked).toHaveLength(HISTORY_MAX_PAGES);
    });

    it.each([
      ["reads a chain that ends at its last page allowed", HISTORY_MAX_PAGES, true],
      ["gives up on a chain one page longer", HISTORY_MAX_PAGES + 1, false],
    ])("%s", async (_name, pages, ok) => {
      let n = 0;
      const chain = () => {
        n += 1;
        return answer(n >= pages ? null : [call(2 * n - 1, CALLER_A), call(2 * n, CALLER_A)]);
      };
      expect(await reading(chain, { paths: [PATH], page: 2 }).read()).toMatchObject(
        ok ? { ok: true } : { ok: false, kind: "too_many" },
      );
    });

    it("fails whole when a later page fails: no realm keeps a count of half the chain", async () => {
      const rows = [call(1, CALLER_A), call(2, CALLER_A), call(3, CALLER_A)];
      let n = 0;
      const second = (request: { query: string; variables: Record<string, unknown> }) =>
        (n += 1) === 2 ? new Response("bad gateway", { status: 502 }) : pagedCalls(rows)(request);
      expect(await reading(second, { paths: [PATH], page: 2 }).read()).toEqual({ ok: false, kind: "status" });
    });

    it("stops between two pages when the pass is stopped", async () => {
      const rows = [call(1, CALLER_A), call(2, CALLER_A), call(3, CALLER_A)];
      let pages = 0;
      const counting = (request: { query: string; variables: Record<string, unknown> }) => {
        pages += 1;
        return pagedCalls(rows)(request);
      };
      const { read } = reading(counting, { paths: [PATH], page: 2, isStopped: () => pages >= 1 });
      expect(await read()).toEqual({ ok: false, kind: "stopped" });
      expect(pages).toBe(1);
    });

    it("refuses a first page out of height order as a wrong shape", async () => {
      const { chain, read } = reading(() => answer([call(3, CALLER_A), call(1, CALLER_A), call(2, CALLER_A)]), {
        page: 3,
      });
      expect(await read()).toEqual({ ok: false, kind: "shape" });
      expect(chain.asked).toHaveLength(1);
    });

    it.each([
      ["rows out of height order", [call(5, CALLER_A), call(4, CALLER_A)]],
      ["a row at the bound asked above", [call(2, CALLER_A), call(3, CALLER_A)]],
      ["a row below the bound asked above", [call(1, CALLER_A), call(3, CALLER_A)]],
      ["the first page again, its bound ignored", [call(1, CALLER_A), call(2, CALLER_A), call(3, CALLER_A)]],
    ])("refuses a next page with %s as a wrong shape, and asks no more", async (_name, second) => {
      let n = 0;
      const given = () => answer((n += 1) === 1 ? [call(1, CALLER_A), call(2, CALLER_A), call(3, CALLER_A)] : second);
      const { chain, read } = reading(given, { paths: [PATH], page: 3 });
      expect(await read()).toEqual({ ok: false, kind: "shape" });
      expect(chain.asked).toHaveLength(2);
    });

    it("refuses a block that holds a row of another height as a wrong shape", async () => {
      const given = (request: { query: string; variables: Record<string, unknown> }) =>
        answer(
          typeof request.variables["height"] === "number"
            ? [call(5, CALLER_A), call(6, CALLER_A)]
            : [call(5, CALLER_A), call(5, CALLER_B)],
        );
      expect(await reading(given, { paths: [PATH], page: 2 }).read()).toEqual({ ok: false, kind: "shape" });
    });

    it("goes through the pace once a request, each with a time limit and no credential", async () => {
      let paced = 0;
      const chain = fakeChain({ indexer: pagedCalls([call(1, CALLER_A), call(2, CALLER_A), call(3, CALLER_A)]) });
      const pace = () => Promise.resolve(void (paced += 1));
      await readHistories({ send: chain.send, indexer: INDEXER, pace, page: 2 }, [PATH], { sinceOf: () => undefined });
      expect(chain.asked).toHaveLength(5);
      expect(paced).toBe(5);
      for (const { ms, init } of chain.asked) {
        expect(ms).toBeGreaterThan(0);
        expect(ms).toBeLessThanOrEqual(30_000);
        expect(JSON.stringify(init.headers ?? {}).toLowerCase()).not.toMatch(/cookie|authorization/);
      }
    });
  });

  it("counts a busy realm: 5,000 calls from 300 callers are an answer, not a refusal", async () => {
    const alphabet = "023456789acdefghjklmnpqrstuvwxyz";
    const callers = Array.from(
      { length: 300 },
      (_, i) => `g1${"q".repeat(36)}${alphabet[Math.floor(i / 32)] ?? "q"}${alphabet[i % 32] ?? "q"}`,
    );
    const rows = Array.from({ length: 5_000 }, (_, i) => call(i, callers[i % 300] ?? CALLER_A));
    expect(await histories(rows, { paths: [PATH] })).toEqual({
      [PATH]: { calls: 5_000, callers: 300, lastHeight: 4_999 },
    });
  });

  it("takes a page of exactly the byte cap", async () => {
    const base = answer([call(1, CALLER_A), call(2, CALLER_A)]);
    let n = 0;
    const exact = () => ((n += 1) === 1 ? base + " ".repeat(HISTORY_MAX_BYTES - base.length) : answer(null));
    expect(await reading(exact, { paths: [PATH] }).read()).toMatchObject({
      ok: true,
      histories: new Map([[PATH, { calls: 1, callers: 1, lastHeight: 1 }]]),
    });
  });

  it("cancels each answer that never ends, without reading it to its end", async () => {
    const pulls: number[] = [];
    const endless = () => {
      const index = pulls.push(0) - 1;
      return new Response(
        new ReadableStream<Uint8Array>({
          pull(controller) {
            pulls[index] = (pulls[index] ?? 0) + 1;
            controller.enqueue(new Uint8Array(64 * 1024));
          },
        }),
      );
    };
    expect(await reading(endless).read()).toEqual({ ok: false, kind: "too_large" });
    expect(pulls.length).toBeGreaterThan(0);
    expect(Math.max(...pulls)).toBeLessThan(100);
  });

  it("asks as a POST of JSON, its bound and page's size as GraphQL variables, never inside the query text, and no realm's path", async () => {
    const { chain, read } = reading(pagedCalls([call(1, CALLER_A), call(2, CALLER_A)]), { page: 1 });
    await read();
    const request = chain.asked.find(({ data }) => variablesOf(data)["above"] !== undefined);
    expect(request?.init.method).toBe("POST");
    expect(new Headers(request?.init.headers).get("content-type")).toBe("application/json");
    expect(variablesOf(request?.data)).toEqual({ above: 1, limit: 1 });
    for (const { data } of chain.asked) expect(queryOf(data)).not.toMatch(/\d/);
    expect(chain.asked.map(({ data }) => data).join("")).not.toContain(PATH);
  });

  it("asks for no file body: a deploy carries its whole source (chain-feasibility.md, item 12)", async () => {
    const { chain, read } = reading(pagedCalls([call(1, CALLER_A), call(2, CALLER_A)]), { page: 1 });
    await read();
    for (const { data } of chain.asked) expect(queryOf(data)).not.toMatch(/\b(body|files|package)\b/);
  });

  describe("an indexer that does not answer", () => {
    it.each([
      ["a timeout", () => Object.assign(new Error("t"), { name: "TimeoutError" }), "timeout"],
      ["a network fault", () => new TypeError("fetch failed"), "request"],
      ["a 502", () => new Response("bad gateway", { status: 502 }), "status"],
      ["a 429", () => new Response("slow down", { status: 429 }), "rate_limited"],
      ["a page of HTML", () => new Response("<html>"), "not_json"],
    ])("gives %s as a fault kind, and does not throw", async (_name, given, kind) => {
      expect(await reading(given).read()).toEqual({ ok: false, kind });
    });
  });

  describe("hostile answers", () => {
    it.each([
      ["GraphQL errors beside data", JSON.stringify({ data: { getTransactions: [] }, errors: [{ message: "x" }] })],
      ["no data", JSON.stringify({})],
      ["rows that are no list", JSON.stringify({ data: { getTransactions: { a: 1 } } })],
      ["a height that is a string", answer([{ block_height: "12", messages: [] }])],
      ["a negative height", answer([call(-1, CALLER_A)])],
      ["a height past the safe integers", answer([call(2 ** 60, CALLER_A)])],
      [
        "a path that is no text",
        answer([{ block_height: 1, messages: [{ value: { __typename: "MsgCall", pkg_path: 7 } }] }]),
      ],
    ])("gives %s as a wrong shape", async (_name, body) => {
      expect(await reading(() => body).read()).toEqual({ ok: false, kind: "shape" });
    });

    it("refuses a page past the size cap, however few rows it is asked", async () => {
      const body = answer(Array.from({ length: 200_000 }, (_, i) => call(i, CALLER_A)));
      expect(await reading(() => body).read()).toEqual({ ok: false, kind: "too_large" });
    });

    it("never puts what the indexer wrote into a fault", async () => {
      const result = await reading(() => new Error("secret-token-123")).read();
      expect(JSON.stringify(result)).not.toContain("secret");
    });
  });
});

// onyx-1's indexer answering the job's queries, as given (onyxIndexer.json, recorded on 2026-11-04 by 7k3): the per-realm filter 7c wrote was
// refused there, so no history was ever read (F4870).
describe("readHistories against onyx-1's recorded answers", () => {
  interface Recorded {
    what: string;
    query: string;
    variables: Record<string, unknown>;
    status: number;
    body: string;
  }
  const recorded = (): Recorded[] =>
    (JSON.parse(readFileSync(new URL("./onyxIndexer.json", import.meta.url), "utf8")) as { answers: Recorded[] })
      .answers;
  const named = (what: string): Recorded => {
    const found = recorded().find((answer) => answer.what === what);
    if (found === undefined) throw new Error(`no recorded answer: ${what}`);
    return found;
  };
  // A recorded answer's rows, paged as onyx-1 pages them.
  const rowsOf = (what: string): CallRow[] =>
    (JSON.parse(named(what).body) as { data: { getTransactions: CallRow[] | null } }).data.getTransactions ?? [];
  // Each recorded query answers as onyx-1 did, any other a 404, so a query of another shape reads nothing.
  const replay = (request: { query: string; variables: Record<string, unknown> }): Response => {
    const found = recorded().find(
      (answer) =>
        answer.query === request.query && JSON.stringify(answer.variables) === JSON.stringify(request.variables),
    );
    return new Response(found?.body ?? "not recorded", { status: found?.status ?? 404 });
  };

  it("asks with the very queries onyx-1 answered: its first page's, then the one above a bound", async () => {
    const { chain, read } = reading(replay, { page: 3 });
    await read();
    const [first, above] = [named("the first page"), named("a page above the tip")];
    expect([first.status, above.status]).toEqual([200, 200]);
    expect(chain.asked.map(({ data }) => queryOf(data))).toEqual([first.query, above.query]);
  });

  it("reads a block alone with the query onyx-1 answered, and counts its recorded rows", async () => {
    const block = named("a block alone");
    const valopers = "gno.land/r/gnops/valopers";
    const bazaar = "gno.land/r/g1n4pl5uc4yt5r96m9w6fmdznx3x0jyg8l6arhmt/bazaar/c/bazaargens3";
    const route = (request: { query: string; variables: Record<string, unknown> }) =>
      typeof request.variables["height"] === "number"
        ? replay(request)
        : answer(request.variables["above"] === undefined ? [call(41_641, CALLER_A), call(41_641, CALLER_B)] : null);
    const { chain, read } = reading(route, { paths: [valopers, bazaar], page: 3 });
    expect(await read()).toEqual({
      ok: true,
      skipped: 0,
      histories: new Map([
        [valopers, { calls: 1, callers: 1, lastHeight: 41_641 }],
        [bazaar, { calls: 1, callers: 1, lastHeight: 41_641 }],
      ]),
    });
    expect(block.status).toBe(200);
    expect(queryOf(chain.asked[1]?.data)).toBe(block.query);
  });

  it("is refused the per-realm filter 7c wrote (recorded 422), and sends none of it", async () => {
    const refused = named("the per-realm filter 7c wrote");
    expect(refused.status).toBe(422);
    expect(refused.body).toContain('Field \\"pkg_path\\" is not defined by type \\"NestedFilterMessageValue\\"');
    const { chain, read } = reading(replay, { page: 3 });
    await read();
    expect(chain.asked.map(({ data }) => queryOf(data))).not.toContain(refused.query);
  });

  it("reads onyx-1's recorded first page: its two calls at the chain's first block and the next", async () => {
    const valopers = "gno.land/r/gnops/valopers";
    const names = "gno.land/r/sys/names";
    expect(await histories(rowsOf("the first page"), { paths: [valopers, names] })).toEqual({
      [valopers]: { calls: 2, callers: 2, lastHeight: 19_656 },
      [names]: { calls: 1, callers: 1, lastHeight: 0 },
    });
  });

  it("counts the call beside a session message in a recorded page, and leaves the session message out", async () => {
    const connect4 = "gno.land/r/samcrew/connect4";
    const catalog = "gno.land/r/nym-alexiscolin000/gnoradio/catalog/v1";
    const rows = rowsOf("a page with a session message beside a call");
    expect(rows[0]?.messages[0]?.value).toEqual({ __typename: "UnexpectedMessage" });
    expect(await histories(rows, { paths: [connect4, catalog] })).toEqual({
      [connect4]: { calls: 1, callers: 1, lastHeight: 253_605 },
      [catalog]: { calls: 2, callers: 1, lastHeight: 253_608 },
    });
  });

  it("counts a recorded transaction calling two realms for each, by its own calls", async () => {
    const golf = "gno.land/r/nym-alexiscolin000/gnogolf/golf";
    const namereg = "gno.land/r/sys/namereg/v0";
    expect(await histories(rowsOf("a page with a transaction calling two realms"), { paths: [golf, namereg] })).toEqual(
      {
        [golf]: { calls: 2, callers: 1, lastHeight: 65_431 },
        [namereg]: { calls: 1, callers: 1, lastHeight: 65_431 },
      },
    );
  });

  it("reads onyx-1's empty page, null, and its answer to a negative bound, null too, as no call", async () => {
    for (const what of ["a page above the tip", "a negative bound"]) {
      const page = named(what);
      expect(page.body).toBe('{"data":{"getTransactions":null}}');
      expect(await reading(() => page.body, { paths: [PATH] }).read()).toEqual({
        ok: true,
        skipped: 0,
        histories: new Map([[PATH, none]]),
      });
    }
  });
});
