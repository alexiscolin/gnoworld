// The network line's tables and what is asked of them: a page's transactions kept, the answer read back. Counts and addresses stay here.
import { NETWORK_DAYS, NetworkAnswer } from "@gnoworld/schemas/indexer";
import { transaction } from "@gnoworld/service/db";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { Failure } from "./remote.ts";

export const DAY_MS = 86_400_000;

export const NETWORK_TABLES = `
CREATE TABLE network_state (universe TEXT PRIMARY KEY, height INTEGER NOT NULL) STRICT;
CREATE TABLE network_days (day TEXT PRIMARY KEY, txs INTEGER NOT NULL) STRICT;
CREATE TABLE network_day_accounts (day TEXT NOT NULL, address TEXT NOT NULL, PRIMARY KEY (day, address)) STRICT, WITHOUT ROWID;
`;

export const dayOf = (at: number): string => new Date(at).toISOString().slice(0, 10);

export interface Tx {
  readonly height: number;
  /** The first message's sender, none when it names no address. */
  readonly sender: string | undefined;
}

export interface Batch {
  readonly days: ReadonlyMap<number, string>;
  readonly txs: readonly Tx[];
  /** The height every transaction up to is counted. */
  readonly through: number;
}

// One page's transactions into the tables, with the height read through, in one transaction.
export function keep(db: DatabaseSync, universe: string, { days, txs, through }: Batch): void {
  const counts = db.prepare(
    "INSERT INTO network_days (day, txs) VALUES (?, 1) ON CONFLICT (day) DO UPDATE SET txs = txs + 1",
  );
  const accounts = db.prepare("INSERT OR IGNORE INTO network_day_accounts (day, address) VALUES (?, ?)");
  transaction(db, () => {
    for (const { height, sender } of txs) {
      const day = days.get(height);
      if (day === undefined) throw new Failure("shape");
      counts.run(day);
      if (sender !== undefined) accounts.run(day, sender);
    }
    db.prepare("INSERT OR REPLACE INTO network_state (universe, height) VALUES (?, ?)").run(universe, through);
  });
}

const Counts = z.array(z.object({ day: z.string(), n: z.number() }));

// The last 14 days, oldest first, a day read and empty a zero, from the first day kept to the day of the height read through: a day not
// read yet is absent, never a zero.
export function answerOf(pass: Pass, tip: { height: number; time: string }): NetworkAnswer | undefined {
  const { db, now } = pass;
  const since = dayOf(now() - (NETWORK_DAYS - 1) * DAY_MS);
  const txs = new Map(
    Counts.parse(db.prepare("SELECT day, txs AS n FROM network_days WHERE day >= ?").all(since)).map((r) => [
      r.day,
      r.n,
    ]),
  );
  const accounts = new Map(
    Counts.parse(
      db.prepare("SELECT day, count(*) AS n FROM network_day_accounts WHERE day >= ? GROUP BY day").all(since),
    ).map((r) => [r.day, r.n]),
  );
  const first = [...txs.keys()].sort()[0];
  const through = db.prepare("SELECT height FROM network_state WHERE universe = ?").get(pass.universe)?.["height"];
  const reached = typeof through === "number" && through >= tip.height ? tip.time.slice(0, 10) : "";
  const last = [reached, ...txs.keys()].filter(Boolean).sort().at(-1) ?? since;
  const days: { day: string; txs: number; accounts: number }[] = [];
  for (let at = Date.parse(`${first ?? last}T00:00:00Z`); at <= Date.parse(`${last}T00:00:00Z`); at += DAY_MS) {
    const day = dayOf(at);
    days.push({ day, txs: txs.get(day) ?? 0, accounts: accounts.get(day) ?? 0 });
  }
  const made = NetworkAnswer.safeParse({
    version: 1,
    universe: pass.universe,
    updated: new Date(now()).toISOString(),
    tip,
    days: days.slice(-NETWORK_DAYS),
  });
  return made.success ? made.data : undefined;
}

/** What the answer needs of a pass. */
interface Pass {
  readonly db: DatabaseSync;
  readonly universe: string;
  readonly now: () => number;
}

/** The days of other universes, and the days past the keeping, dropped. */
export function prune(db: DatabaseSync, now: number): void {
  const cutoff = dayOf(now - NETWORK_DAYS * DAY_MS);
  for (const table of ["network_days", "network_day_accounts"])
    db.prepare(`DELETE FROM ${table} WHERE day < ?`).run(cutoff);
}
