import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { rollupName } from "@gnoworld/core";
import { TOKEN_CAPS } from "@gnoworld/schemas/indexer";
import { TOKEN_TABLES, tokenStore, type TokenEvent, type TokenTx } from "./tokenStore.ts";

const REALM = "gno.land/r/demo/coin";
const TOKEN = `${REALM}.COIN.0000000`;
const [A, B] = [`g1${"q".repeat(38)}`, `g1${"p".repeat(38)}`];
const NOW = Date.parse("2026-11-12T12:00:00Z");

const fresh = () => {
  const db = new DatabaseSync(":memory:");
  db.exec(TOKEN_TABLES);
  return tokenStore(db, "onyx");
};
const born: TokenEvent = { kind: "new", token: TOKEN, name: "Coin", symbol: "COIN", decimals: 2 };
const move = (from: string, to: string, value: bigint): TokenEvent => ({
  kind: "transfer",
  token: TOKEN,
  from,
  to,
  value,
});
const run = (store: ReturnType<typeof fresh>, ...events: TokenEvent[][]) => {
  const txs: TokenTx[] = events.map((each, at) => ({ height: at + 1, events: each }));
  const days = new Map(txs.map(({ height }) => [height, "2026-11-12"]));
  store.add({ txs, dated: { days, times: new Map() }, through: txs.length, now: NOW });
  return store.answerOf(rollupName(REALM))?.tokens[0];
};

describe("the token replay", () => {
  it("counts a mint, a transfer and a burn into supply and holders, and a day of transfers", () => {
    const token = run(fresh(), [born], [move("", A, 100n)], [move(A, B, 30n)], [move(B, "", 10n)]);
    expect(token).toMatchObject({ supply: "90", holders: 2, ambiguous: false, last: { day: "2026-11-12", height: 4 } });
    expect(token?.top).toEqual([
      { address: A, amount: "70" },
      { address: B, amount: "20" },
    ]);
    expect(token?.days).toEqual([{ day: "2026-11-12", transfers: 3 }]);
  });

  it("holds an amount past 2^53 exactly", () => {
    const token = run(
      fresh(),
      [born],
      [move("", A, 9_223_372_036_854_775_807n)],
      [move("", B, 9_223_372_036_854_775_807n)],
    );
    expect(token?.supply).toBe("18446744073709551614");
  });

  it("marks a token ambiguous, with no holders, for a balance below zero", () => {
    const token = run(fresh(), [born], [move("", A, 5n)], [move(B, A, 1n)]);
    expect(token).toMatchObject({ ambiguous: true, supply: null, holders: null, top: [] });
  });

  it("drops the row of a holder whose whole balance moves, one holder fewer", () => {
    const token = run(fresh(), [born], [move("", A, 100n)], [move("", B, 50n)], [move(B, A, 50n)]);
    expect(token).toMatchObject({ supply: "150", holders: 1, top: [{ address: A, amount: "150" }] });
  });

  it("marks a token ambiguous for a burn past its supply, and for a holder past the cap", () => {
    const later = (tamper: string, event: TokenEvent) => {
      const db = new DatabaseSync(":memory:");
      db.exec(TOKEN_TABLES);
      const store = tokenStore(db, "onyx");
      run(store, [born], [move("", A, 100n)]);
      db.exec(tamper);
      store.add({
        txs: [{ height: 3, events: [event] }],
        dated: { days: new Map([[3, "2026-11-12"]]), times: new Map() },
        through: 3,
        now: NOW,
      });
      return store.answerOf(rollupName(REALM))?.tokens[0];
    };
    expect(later("UPDATE grc20_tokens SET supply = '10'", move(A, "", 50n))).toMatchObject({
      ambiguous: true,
      top: [],
    });
    const capped = `UPDATE grc20_tokens SET holders = ${String(TOKEN_CAPS.balances)}`;
    expect(later(capped, move("", B, 1n))).toMatchObject({ ambiguous: true, top: [] });
  });

  it("counts no day and no last move for a transfer whose block has no date", () => {
    const store = fresh();
    store.add({
      txs: [
        { height: 1, events: [born] },
        { height: 2, events: [move("", A, 5n)] },
      ],
      dated: { days: new Map(), times: new Map() },
      through: 2,
      now: NOW,
    });
    expect(store.answerOf(rollupName(REALM))?.tokens[0]).toMatchObject({ supply: "5", days: [], last: null });
  });

  it("marks a token ambiguous for a name announced twice, and for a transfer to oneself", () => {
    expect(run(fresh(), [born], [born])?.ambiguous).toBe(true);
    expect(run(fresh(), [born], [move("", A, 5n)], [move(A, A, 1n)])?.ambiguous).toBe(true);
  });

  it("ignores the transfers of a token never announced, and marks a token whose event failed", () => {
    const store = fresh();
    expect(run(store, [move("", A, 5n)])).toBeUndefined();
    expect(run(fresh(), [born], [{ kind: "bad", token: TOKEN }])?.ambiguous).toBe(true);
  });

  it("gives a person's tokens by amount, and leaves an ambiguous token out", () => {
    const store = fresh();
    run(store, [born], [move("", A, 70n)]);
    expect(store.topTokensOf(A, 5)).toEqual([
      { realm: REALM, symbol: "COIN", name: "Coin", decimals: 2, amount: "70" },
    ]);
    expect(store.topTokensOf(B, 5)).toEqual([]);
  });

  it("leaves an event at or below the height kept out, and resumes above it", () => {
    const store = fresh();
    run(store, [born], [move("", A, 5n)]);
    store.add({
      txs: [{ height: 2, events: [move("", A, 5n)] }],
      dated: { days: new Map([[2, "2026-11-12"]]), times: new Map() },
      through: 2,
      now: NOW,
    });
    expect(store.height()).toBe(2);
    expect(store.answerOf(rollupName(REALM))?.tokens[0]?.supply).toBe("5");
  });

  it("drops its rows for another universe", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(TOKEN_TABLES);
    run(tokenStore(db, "a"), [born]);
    expect(tokenStore(db, "b").answerOf(rollupName(REALM))).toBeUndefined();
  });

  it("keeps the last 30 days only", () => {
    const store = fresh();
    store.add({
      txs: [{ height: 1, events: [born, move("", A, 1n)] }],
      dated: { days: new Map([[1, "2026-09-01"]]), times: new Map() },
      through: 1,
      now: NOW,
    });
    expect(store.answerOf(rollupName(REALM))?.tokens[0]?.days).toEqual([]);
  });

  it("marks a token ambiguous for a balance past an int64", () => {
    const token = run(
      fresh(),
      [born],
      [move("", A, 9_223_372_036_854_775_807n)],
      [move("", A, 9_223_372_036_854_775_807n)],
    );
    expect(token).toMatchObject({ ambiguous: true, supply: null, top: [] });
  });

  it("answers a realm's tokens once for a hash and a height", () => {
    const store = fresh();
    run(store, [born], [move("", A, 5n)]);
    const hash = rollupName(REALM);
    expect(store.answerOf(hash)).toBe(store.answerOf(hash));
  });
});
