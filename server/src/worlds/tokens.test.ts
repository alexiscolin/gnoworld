import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { rollupName } from "@gnoworld/core";
import { TOKEN_PACKAGE } from "@gnoworld/schemas/indexer";
import type { Send } from "./remote.ts";
import { TOKEN_PAGES, readTokens, txsOf } from "./tokens.ts";
import { TOKEN_TABLES, tokenStore } from "./tokenStore.ts";

const REALM = "gno.land/r/demo/coin";
const TOKEN = `${REALM}.COIN.0000000`;
const A = `g1${"q".repeat(38)}`;
const attrs = (pairs: Record<string, string>) => Object.entries(pairs).map(([key, value]) => ({ key, value }));
const event = (type: string, pairs: Record<string, string>, pkg_path = TOKEN_PACKAGE) => ({
  type,
  pkg_path,
  attrs: attrs(pairs),
});
const page = (...txs: { block_height: number; events: unknown[] }[]) => ({
  data: {
    getTransactions:
      txs.length === 0 ? null : txs.map(({ block_height, events }) => ({ block_height, response: { events } })),
  },
});
const born = event("NewToken", { token: TOKEN, name: "Co\u202ein", symbol: "COIN", decimals: "2" });
const mint = (value: string, to = A) => event("Transfer", { token: TOKEN, from: "", to, value });

describe("txsOf, the checks on the indexer's events", () => {
  it("strips a name of its bidi controls, reads an amount as a BigInt, and ignores another package's events", () => {
    const { txs } = txsOf(
      page({
        block_height: 1,
        events: [born, mint("5"), event("Transfer", { token: TOKEN, value: "9" }, "gno.land/r/evil")],
      }),
      0,
    );
    expect(txs[0]?.events).toEqual([
      { kind: "new", token: TOKEN, name: "Coin", symbol: "COIN", decimals: 2 },
      { kind: "transfer", token: TOKEN, from: "", to: A, value: 5n },
    ]);
  });

  it("refuses an amount of 2^63 and a non-number, marking its token, and counts events that are no events", () => {
    const { txs, skipped } = txsOf(
      page({ block_height: 1, events: [mint("9223372036854775808"), mint("-1"), { attrs: 3 }, {}] }),
      0,
    );
    expect(txs[0]?.events).toEqual([
      { kind: "bad", token: TOKEN },
      { kind: "bad", token: TOKEN },
    ]);
    expect(skipped).toBe(1);
  });

  it("fails a page whose heights go back or sit below the bound", () => {
    expect(() => txsOf(page({ block_height: 5, events: [] }, { block_height: 4, events: [] }), 0)).toThrow();
    expect(() => txsOf(page({ block_height: 1, events: [] }), 2)).toThrow();
    expect(() => txsOf({ data: {}, errors: [] }, 0)).toThrow();
  });
});

// An indexer with the chain's pages: a request for events above a height answers the rows there, a block read its height's, blocks' times 2026-11-12.
function chain(rows: ReturnType<typeof page>["data"]["getTransactions"], asked: string[] = []): Send {
  return (_url, init) => {
    const body = JSON.parse(typeof init.body === "string" ? init.body : "") as {
      query: string;
      variables: Record<string, number>;
    };
    asked.push(body.query);
    const { above = -1, height } = body.variables;
    const heights = Object.entries(body.variables).filter(([name]) => /^h\d+$/.test(name));
    const data: unknown =
      heights.length > 0
        ? Object.fromEntries(
            heights.map(([name, h]) => [`b${name.slice(1)}`, [{ height: h, time: "2026-11-12T01:00:00Z" }]]),
          )
        : {
            getTransactions: (rows ?? [])
              .filter((row) => (height === undefined ? row.block_height > above : row.block_height === height))
              .slice(0, body.variables["limit"] ?? 1e9),
          };
    return Promise.resolve(
      new Response(JSON.stringify({ data }), { status: 200, headers: { "content-type": "application/json" } }),
    );
  };
}

describe("readTokens", () => {
  it("replays the events into the database, a hostile token's supply never counted", async () => {
    const db = new DatabaseSync(":memory:");
    db.exec(TOKEN_TABLES);
    const rows = page(
      { block_height: 1, events: [born, mint("100")] },
      { block_height: 2, events: [mint("5")] },
      { block_height: 3, events: [mint("1")] },
    ).data.getTransactions;
    const log: string[] = [];
    const read = await readTokens({
      db,
      log: (name) => void log.push(name),
      reader: { send: chain(rows), indexer: "https://i.example/q" },
      universe: "onyx",
      isStopped: () => false,
      now: () => Date.parse("2026-11-12T12:00:00Z"),
    });
    expect(read).toEqual({ ok: true });
    const token = tokenStore(db, "onyx").answerOf(rollupName(REALM))?.tokens[0];
    expect(token).toMatchObject({ supply: "106", holders: 1, last: { day: "2026-11-12", height: 3 } });
    expect(TOKEN_PAGES).toBe(20);
  });

  it("anchors a restart on the last block read even when it holds no transfer", async () => {
    const db = new DatabaseSync(":memory:");
    db.exec(TOKEN_TABLES);
    const rows = page({ block_height: 4, events: [born] }).data.getTransactions;
    await readTokens({
      db,
      log: () => undefined,
      reader: { send: chain(rows), indexer: "https://i.example/q" },
      universe: "onyx",
      isStopped: () => false,
      now: () => Date.parse("2026-11-12T12:00:00Z"),
    });
    expect(tokenStore(db, "onyx").anchor()).toMatchObject({ height: 4 });
  });

  it("steps past a transaction too large to read, logs it and no longer believes any token", async () => {
    const db = new DatabaseSync(":memory:");
    db.exec(TOKEN_TABLES);
    const rows = page(
      { block_height: 1, events: [born, mint("100")] },
      { block_height: 2, events: [mint("1")] },
      { block_height: 3, events: [mint("5")] },
    ).data.getTransactions;
    const inner = chain(rows);
    const send: Send = (...args) => {
      const body = JSON.parse(typeof args[1].body === "string" ? args[1].body : "") as {
        query: string;
        variables: Record<string, number>;
      };
      const { above = -1, limit } = body.variables;
      if (body.query.includes("limit: 1) { block_height }"))
        return Promise.resolve(Response.json({ data: { getTransactions: [{ block_height: 2 }] } }));
      const events = limit !== undefined && body.query.includes("response { events");
      if (events && above < 2 && above + limit >= 2) return Promise.resolve(new Response("x".repeat(5_000_000)));
      return inner(...args);
    };
    const log: string[] = [];
    const read = await readTokens({
      db,
      log: (name) => void log.push(name),
      reader: { send, indexer: "https://i.example/q" },
      universe: "onyx",
      isStopped: () => false,
      now: () => Date.parse("2026-11-12T12:00:00Z"),
    });
    expect(read).toEqual({ ok: true });
    expect(log).toContain("token_block_too_large");
    const store = tokenStore(db, "onyx");
    expect(store.answerOf(rollupName(REALM))?.tokens[0]).toMatchObject({ ambiguous: true, supply: null });
    expect(store.height()).toBe(3);
  });

  it("resets the store it is given when the chain restarted, so the route sharing it reads the new table", async () => {
    const db = new DatabaseSync(":memory:");
    db.exec(TOKEN_TABLES);
    const shared = tokenStore(db, "onyx");
    const pass = (send: Send) =>
      readTokens({
        db,
        store: shared,
        log: () => undefined,
        reader: { send, indexer: "https://i.example/q" },
        universe: "onyx",
        isStopped: () => false,
        now: () => Date.parse("2026-11-12T12:00:00Z"),
      });
    const first = page({ block_height: 1, events: [born, mint("100")] }).data.getTransactions;
    await pass(chain(first));
    expect(shared.answerOf(rollupName(REALM))?.tokens[0]?.supply).toBe("100");
    // The same height on a chain that restarted: its block 1 has another time, and other rows.
    const second = page({ block_height: 1, events: [born, mint("7")] }).data.getTransactions;
    const restarted: Send = async (...args) =>
      new Response((await (await chain(second)(...args)).text()).replaceAll("01:00:00Z", "02:00:00Z"));
    await pass(restarted);
    expect(shared.answerOf(rollupName(REALM))?.tokens[0]?.supply).toBe("7");
  });

  it(`stops at ${String(TOKEN_PAGES)} pages a pass, keeps what it replayed, says it was capped, and goes on from there next time`, async () => {
    const db = new DatabaseSync(":memory:");
    db.exec(TOKEN_TABLES);
    const rows = page(
      { block_height: 1, events: [born, mint("1")] },
      ...Array.from({ length: 60 }, (_, at) => ({ block_height: at + 2, events: [mint("1")] })),
    ).data.getTransactions;
    const log: string[] = [];
    const pass = () =>
      readTokens({
        db,
        log: (name) => void log.push(name),
        reader: { send: chain(rows), indexer: "https://i.example/q", page: 2 },
        universe: "onyx",
        isStopped: () => false,
        now: () => Date.parse("2026-11-12T12:00:00Z"),
      });
    expect(await pass()).toEqual({ ok: true });
    expect(log).toEqual(["token_read_capped"]);
    const first = tokenStore(db, "onyx").height();
    expect(first).toBe(TOKEN_PAGES);
    await pass();
    expect(tokenStore(db, "onyx").height()).toBe(2 * TOKEN_PAGES);
  });

  it("counts a token made under realm.Sub as an event skipped, and never replays it", () => {
    const sub = { token: `${REALM}#sub.COIN.0000000`, name: "n", symbol: "COIN", decimals: "2" };
    const { txs, skipped } = txsOf(page({ block_height: 1, events: [event("NewToken", sub)] }), 0);
    expect(txs[0]?.events).toEqual([]);
    expect(skipped).toBe(1);
  });
});
