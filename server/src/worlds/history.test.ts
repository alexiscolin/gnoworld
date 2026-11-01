import { describe, expect, it } from "vitest";
import { fakeChain, INDEXER } from "../testing/fakeWorldsChain.ts";
import { HISTORY_MAX_BYTES, HISTORY_MAX_CALLS, readHistory, realmsOfPass } from "./history.ts";

// THE ANSWER'S SHAPE IS OURS, NOT RECORDED (F2950): no indexer answer was read through gnomcp, so the first live proof is
// deploy/test.sh. History holds DIRECT calls only, and a line may be a failed transaction: a count is a count of attempts,
// and a realm with none is not dead.
const PATH = "gno.land/r/samcrew/launchpad/market/v1";
const CALLER_A = "g10ragdr3cjqkael8rslpw4y6rlelhev4h0fswcx";
const CALLER_B = "g1kfj7rq3cjqkael8rslpw4y6rlelhev4h0fswcx";

const call = (height: number, caller: string) => ({
  block_height: height,
  messages: [{ value: { __typename: "MsgCall", pkg_path: PATH, caller } }],
});
const deploy = (height: number, caller: string) => ({
  block_height: height,
  messages: [{ value: { __typename: "MsgAddPackage", creator: caller } }],
});
const answer = (rows: unknown[]) => JSON.stringify({ data: { getTransactions: rows } });
const ask = (given: Parameters<typeof fakeChain>[0]["indexer"]) => {
  const chain = fakeChain({ indexer: given });
  return { chain, read: () => readHistory({ send: chain.send, indexer: INDEXER }, PATH) };
};

describe("readHistory", () => {
  it("counts the calls, their distinct callers and the last height, and leaves the deploys out of the calls", async () => {
    const rows = [deploy(230_000, CALLER_A), call(230_768, CALLER_B), call(230_808, CALLER_B), call(230_845, CALLER_A)];
    expect(await ask(() => answer(rows)).read()).toEqual({
      ok: true,
      history: { calls: 3, callers: 2, lastHeight: 230_845 },
    });
  });

  it("gives the same result for the same rows in any order: the last height is the highest, not the last row", async () => {
    const rows = [deploy(230_000, CALLER_A), call(230_768, CALLER_B), call(230_808, CALLER_B), call(230_845, CALLER_A)];
    const expected = { ok: true, history: { calls: 3, callers: 2, lastHeight: 230_845 } };
    expect(await ask(() => answer([...rows].reverse())).read()).toEqual(expected);
    expect(await ask(() => answer([rows[2], rows[0], rows[3], rows[1]])).read()).toEqual(expected);
  });

  it("counts each call message of a transaction, and leaves out the messages that are no call", async () => {
    const rows = [
      {
        block_height: 10,
        messages: [
          { value: { __typename: "MsgCall", pkg_path: PATH, caller: CALLER_A } },
          { value: { __typename: "MsgCall", pkg_path: PATH, caller: CALLER_A } },
          { value: { __typename: "MsgRun", caller: CALLER_B } },
          { value: { __typename: "MsgSend" } },
        ],
      },
    ];
    expect(await ask(() => answer(rows)).read()).toEqual({
      ok: true,
      history: { calls: 2, callers: 1, lastHeight: 10 },
    });
  });

  it("counts only the messages aimed at the realm asked: a transaction bundling calls to two realms adds one call to each", async () => {
    const rows = [
      {
        block_height: 9,
        messages: [
          { value: { __typename: "MsgCall", pkg_path: PATH, caller: CALLER_A } },
          { value: { __typename: "MsgCall", pkg_path: "gno.land/r/b/other", caller: CALLER_B } },
        ],
      },
      {
        block_height: 12,
        messages: [{ value: { __typename: "MsgCall", pkg_path: "gno.land/r/b/other", caller: CALLER_B } }],
      },
    ];
    expect(await ask(() => answer(rows)).read()).toEqual({
      ok: true,
      history: { calls: 1, callers: 1, lastHeight: 9 },
    });
  });

  it("refuses a call message that names no path, for it cannot be tied to the realm asked", async () => {
    const rows = [{ block_height: 9, messages: [{ value: { __typename: "MsgCall", caller: CALLER_A } }] }];
    expect(await ask(() => answer(rows)).read()).toEqual({ ok: false, kind: "shape" });
  });

  it("counts a busy realm: 5,000 calls from 300 callers are an answer, not a refusal", async () => {
    const alphabet = "023456789acdefghjklmnpqrstuvwxyz";
    const callers = Array.from(
      { length: 300 },
      (_, i) => `g1${"q".repeat(36)}${alphabet[Math.floor(i / 32)] ?? "q"}${alphabet[i % 32] ?? "q"}`,
    );
    const rows = Array.from({ length: 5_000 }, (_, i) => call(i, callers[i % 300] ?? CALLER_A));
    const result = await ask(() => answer(rows)).read();
    expect(result).toEqual({ ok: true, history: { calls: 5_000, callers: 300, lastHeight: 4_999 } });
  });

  it("takes an answer of exactly the byte cap and refuses one byte over", async () => {
    const padded = (size: number) => {
      const base = answer([call(1, CALLER_A)]);
      return base + " ".repeat(size - base.length);
    };
    expect(await ask(() => padded(HISTORY_MAX_BYTES)).read()).toMatchObject({ ok: true });
    expect(await ask(() => padded(HISTORY_MAX_BYTES + 1)).read()).toEqual({ ok: false, kind: "too_large" });
  });

  it("cancels an answer that never ends, without reading it to its end", async () => {
    let pulled = 0;
    const endless = () =>
      new Response(
        new ReadableStream<Uint8Array>({
          pull(controller) {
            pulled += 1;
            controller.enqueue(new Uint8Array(64 * 1024));
          },
        }),
      );
    expect(await ask(endless).read()).toEqual({ ok: false, kind: "too_large" });
    expect(pulled).toBeLessThan(100);
  });

  it("goes through the pace once, with a time limit and no credential", async () => {
    let paced = 0;
    const chain = fakeChain({ indexer: () => answer([]) });
    await readHistory({ send: chain.send, indexer: INDEXER, pace: () => Promise.resolve(void (paced += 1)) }, PATH);
    expect(paced).toBe(1);
    expect(chain.asked[0]?.ms).toBeGreaterThan(0);
    expect(chain.asked[0]?.ms).toBeLessThanOrEqual(30_000);
    expect(JSON.stringify(chain.asked[0]?.init.headers ?? {}).toLowerCase()).not.toMatch(/cookie|authorization/);
  });

  it("gives a realm with a deploy and no call as no call and no last height", async () => {
    expect(await ask(() => answer([deploy(5, CALLER_A)])).read()).toEqual({
      ok: true,
      history: { calls: 0, callers: 0, lastHeight: null },
    });
  });

  it("gives a realm the indexer has no line for as no call: an empty answer is an answer", async () => {
    expect(await ask(() => answer([])).read()).toEqual({
      ok: true,
      history: { calls: 0, callers: 0, lastHeight: null },
    });
  });

  it("sends the path as a GraphQL variable, never inside the query text, as a POST of JSON", async () => {
    const { chain, read } = ask(() => answer([]));
    await read();
    const request = chain.asked[0];
    expect(request?.init.method).toBe("POST");
    expect(new Headers(request?.init.headers).get("content-type")).toBe("application/json");
    const body = JSON.parse(request?.data ?? "{}") as { query: string; variables: Record<string, unknown> };
    expect(body.query).not.toContain(PATH);
    expect(Object.values(body.variables)).toContain(PATH);
  });

  it("asks for no file body: a deploy carries its whole source (chain-feasibility.md, item 12)", async () => {
    const { chain, read } = ask(() => answer([]));
    await read();
    const { query } = JSON.parse(chain.asked[0]?.data ?? "{}") as { query: string };
    expect(query).not.toMatch(/\bbody\b/);
  });

  it("refuses to build a request for a path that is no realm path", async () => {
    const chain = fakeChain({ indexer: () => answer([]) });
    const result = await readHistory({ send: chain.send, indexer: INDEXER }, 'gno.land/r/a"}) { x } #');
    expect(result).toEqual({ ok: false, kind: "path" });
    expect(chain.asked).toHaveLength(0);
  });

  describe("an indexer that does not answer", () => {
    it.each([
      ["a timeout", () => Object.assign(new Error("t"), { name: "TimeoutError" }), "timeout"],
      ["a network fault", () => new TypeError("fetch failed"), "request"],
      ["a 502", () => new Response("bad gateway", { status: 502 }), "status"],
      ["a 429", () => new Response("slow down", { status: 429 }), "rate_limited"],
      ["a page of HTML", () => new Response("<html>"), "not_json"],
    ])("gives %s as a fault kind, and does not throw", async (_name, given, kind) => {
      expect(await ask(given).read()).toEqual({ ok: false, kind });
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
      ["a caller that is no address", answer([call(1, 'g1"; evil')])],
    ])("gives %s as a wrong shape", async (_name, body) => {
      expect(await ask(() => body).read()).toEqual({ ok: false, kind: "shape" });
    });

    it("refuses an answer past the size cap", async () => {
      const rows = Array.from({ length: 200_000 }, (_, i) => call(i, CALLER_A));
      expect(await ask(() => answer(rows)).read()).toEqual({ ok: false, kind: "too_large" });
    });

    it("never puts what the indexer wrote into a fault", async () => {
      const result = await ask(() => new Error("secret-token-123")).read();
      expect(JSON.stringify(result)).not.toContain("secret");
    });
  });
});

describe("realmsOfPass (F3518)", () => {
  const realms = (n: number): string[] =>
    Array.from({ length: n }, (_, i) => `gno.land/r/ns/r${String(i).padStart(4, "0")}`);

  it("holds the cap at 10,000 calls a pass", () => {
    expect(HISTORY_MAX_CALLS).toBe(10_000);
  });

  it("gives every realm while they are no more than the cap", () => {
    expect(realmsOfPass(realms(7), 3, 10)).toEqual(realms(7));
    expect(realmsOfPass(realms(10), 99, 10)).toEqual(realms(10));
    expect(realmsOfPass([], 5, 10)).toEqual([]);
  });

  it("gives a run of the cap's length, starting further on each pass, wrapping round", () => {
    const all = realms(25);
    expect(realmsOfPass(all, 0, 10)).toEqual(all.slice(0, 10));
    expect(realmsOfPass(all, 1, 10)).toEqual(all.slice(10, 20));
    expect(realmsOfPass(all, 2, 10)).toEqual([...all.slice(20), ...all.slice(0, 5)]);
    expect(realmsOfPass(all, 3, 10)).toEqual(all.slice(5, 15));
  });

  it("reaches every realm within the passes that must reach it, from any pass, each run of the cap's length", () => {
    for (const total of [11, 19, 20, 21, 25, 30, 47, 100]) {
      const all = realms(total);
      for (const first of [0, 1, 7, 1_000_003]) {
        const reached = new Set<string>();
        const needed = Math.ceil(total / 10);
        for (let pass = first; pass < first + needed; pass += 1) {
          const run = realmsOfPass(all, pass, 10);
          expect(run).toHaveLength(10);
          expect(new Set(run).size).toBe(10);
          run.forEach((path) => reached.add(path));
        }
        expect(reached.size).toBe(total);
      }
    }
  });

  it("uses the default cap when none is given", () => {
    expect(realmsOfPass(realms(HISTORY_MAX_CALLS + 5), 0)).toHaveLength(HISTORY_MAX_CALLS);
  });
});
