// The replay of grc20's events (slice 13) into the token tables: a token announced once, its transfers applied to balances and supply, each
// transaction one transfer of a token a day. A balance below zero, a name announced twice, a transfer to oneself or more rows than the cap for one token
// mark a token `ambiguous`: its balances are dropped and it shows no holders. Amounts are BigInt here and decimal text in the table.
import { rollupName } from "@gnoworld/core";
import { INT64_MAX, TOKEN_CAPS, tokenIdOf } from "@gnoworld/schemas/indexer";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { Dated } from "./blockDays.ts";
import type { TokenEvent, TokenTx } from "./tokenStore.ts";

const Known = z.object({ supply: z.string(), holders: z.number(), ambiguous: z.number() });
const Balance = z.object({ amount: z.string() });

// The statements of a replay.
export function statements(db: DatabaseSync) {
  return {
    known: db.prepare("SELECT supply, holders, ambiguous FROM grc20_tokens WHERE token = ?"),
    count: db.prepare("SELECT count(*) AS n FROM grc20_tokens"),
    insert: db.prepare("INSERT INTO grc20_tokens VALUES (?, ?, ?, ?, ?, '0', 0, 0, NULL, NULL)"),
    doubt: db.prepare("UPDATE grc20_tokens SET ambiguous = 1, holders = 0, supply = '0' WHERE token = ?"),
    dropBalances: db.prepare("DELETE FROM grc20_balances WHERE token = ?"),
    balance: db.prepare("SELECT amount FROM grc20_balances WHERE token = ? AND address = ?"),
    setBalance: db.prepare(
      "INSERT INTO grc20_balances VALUES (?, ?, ?) ON CONFLICT DO UPDATE SET amount = excluded.amount",
    ),
    delBalance: db.prepare("DELETE FROM grc20_balances WHERE token = ? AND address = ?"),
    setTotals: db.prepare("UPDATE grc20_tokens SET supply = ?, holders = ? WHERE token = ?"),
    day: db.prepare("INSERT INTO grc20_days VALUES (?, ?, 1) ON CONFLICT DO UPDATE SET transfers = transfers + 1"),
    last: db.prepare("UPDATE grc20_tokens SET last_height = ?, last_day = ? WHERE token = ?"),
    state: db.prepare(
      "INSERT INTO grc20_state VALUES (?, ?, ?, ?) ON CONFLICT DO UPDATE SET height = excluded.height, anchor = coalesce(excluded.anchor, anchor), anchor_time = coalesce(excluded.anchor_time, anchor_time)",
    ),
  };
}
export type Statements = ReturnType<typeof statements>;

// A token marked unbelievable: its balances go, so a hostile token holds no rows.
function doubted(sql: Statements, token: string): void {
  sql.doubt.run(token);
  sql.dropBalances.run(token);
}

// One transfer applied to a token's balances and supply; false when it makes the token unbelievable.
function moved(sql: Statements, token: string, event: Extract<TokenEvent, { kind: "transfer" }>): boolean {
  const known = Known.parse(sql.known.get(token));
  const { from, to, value } = event;
  if ((from === "" && to === "") || from === to) return false;
  let supply = BigInt(known.supply);
  let holders = known.holders;
  // A balance moved by `by`, its row made or dropped; false below zero.
  const shift = (address: string, by: bigint): boolean => {
    const row = sql.balance.get(token, address);
    const before = row === undefined ? 0n : BigInt(Balance.parse(row).amount);
    const after = before + by;
    if (after < 0n || after > INT64_MAX) return false;
    if (after === 0n) {
      if (row !== undefined) sql.delBalance.run(token, address);
      holders -= row === undefined ? 0 : 1;
    } else {
      sql.setBalance.run(token, address, after.toString());
      holders += row === undefined ? 1 : 0;
    }
    return true;
  };
  if (from === "") supply += value;
  else if (!shift(from, -value)) return false;
  if (to === "") supply -= value;
  else if (!shift(to, value)) return false;
  if (supply < 0n || holders > TOKEN_CAPS.balances) return false;
  sql.setTotals.run(supply.toString(), holders, token);
  return true;
}

// A token announced: once, with a symbol its id names, under the cap; a second announcement makes it unbelievable.
function announced(sql: Statements, event: Extract<TokenEvent, { kind: "new" }>, known: boolean): void {
  if (known) {
    doubted(sql, event.token);
    return;
  }
  const id = tokenIdOf(event.token);
  const room = z.number().parse(sql.count.get()?.["n"]) < TOKEN_CAPS.tokens;
  if (id?.symbol === event.symbol && room)
    sql.insert.run(event.token, rollupName(id.realm), event.symbol, event.name, event.decimals);
}

// One transaction's events in order; the tokens it moved.
function applied(sql: Statements, events: readonly TokenEvent[]): Set<string> {
  const moving = new Set<string>();
  for (const event of events) {
    const row = sql.known.get(event.token);
    if (event.kind === "new") announced(sql, event, row !== undefined);
    else if (row !== undefined && Known.parse(row).ambiguous === 0) {
      if (event.kind === "bad" || !moved(sql, event.token, event)) doubted(sql, event.token);
      else moving.add(event.token);
    }
  }
  return moving;
}

/** A batch of transactions replayed in order, each token that moved in one counted for its block's day. */
export function fold(sql: Statements, txs: readonly TokenTx[], dated: Dated): void {
  for (const { height, events } of txs) {
    const day = dated.days.get(height);
    for (const token of applied(sql, events)) {
      if (day === undefined) continue;
      sql.day.run(token, day);
      sql.last.run(height, day, token);
    }
  }
}
