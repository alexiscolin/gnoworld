// An account's strikes and its own share of Jarvis's cost, each per UTC day, in the server's database (D13985): a strike
// for each question declined, three pause the account until the next day; the cost of each answer in millionths of a
// dollar, 250,000 (0.25 $) caps it. The day is the question's, whenever its answer lands. A share is read before an answer
// is paid for, so questions in flight past the cap overshoot it by at most the rate's few.
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";

export const DAY_TABLES = `
CREATE TABLE jarvis_strikes (account TEXT NOT NULL, day TEXT NOT NULL, count INTEGER NOT NULL, PRIMARY KEY (account, day)) STRICT;
CREATE INDEX jarvis_strikes_by_day ON jarvis_strikes (day);
CREATE TABLE jarvis_spent (account TEXT NOT NULL, day TEXT NOT NULL, micros INTEGER NOT NULL, PRIMARY KEY (account, day)) STRICT;
CREATE INDEX jarvis_spent_by_day ON jarvis_spent (day);
`;

export const STRIKES = 3;
export const SHARE = 250_000;

export interface Day {
  strike: (account: string, at?: number) => void;
  paused: (account: string, at?: number) => boolean;
  spend: (account: string, micros: number, at?: number) => void;
  capped: (account: string, at?: number) => boolean;
}

const dayOf = (at: number): string => new Date(at).toISOString().slice(0, 10);
const Total = z.object({ n: z.number() });

export function makeDay(db: DatabaseSync, { now }: { now: () => number }): Day {
  const sql = {
    strike: db.prepare(`INSERT INTO jarvis_strikes (account, day, count) VALUES (?, ?, 1)
      ON CONFLICT (account, day) DO UPDATE SET count = count + 1`),
    struck: db.prepare("SELECT count AS n FROM jarvis_strikes WHERE account = ? AND day = ?"),
    spend: db.prepare(`INSERT INTO jarvis_spent (account, day, micros) VALUES (?, ?, ?)
      ON CONFLICT (account, day) DO UPDATE SET micros = micros + excluded.micros`),
    spent: db.prepare("SELECT micros AS n FROM jarvis_spent WHERE account = ? AND day = ?"),
    // At most 500 past rows a write, by the day's index: a day's turn never holds the event loop.
    purge: ["jarvis_strikes", "jarvis_spent"].map((table) =>
      db.prepare(`DELETE FROM ${table} WHERE rowid IN (SELECT rowid FROM ${table} WHERE day < ? LIMIT 500)`),
    ),
  };
  const purge = (day: string): void => {
    for (const statement of sql.purge) statement.run(day);
  };
  const total = (statement: ReturnType<DatabaseSync["prepare"]>, account: string, at: number): number => {
    const row = statement.get(account, dayOf(at));
    return row === undefined ? 0 : Total.parse(row).n;
  };
  return {
    strike(account, at = now()) {
      purge(dayOf(at));
      sql.strike.run(account, dayOf(at));
    },
    paused: (account, at = now()) => total(sql.struck, account, at) >= STRIKES,
    spend(account, micros, at = now()) {
      purge(dayOf(at));
      sql.spend.run(account, dayOf(at), micros);
    },
    capped: (account, at = now()) => total(sql.spent, account, at) >= SHARE,
  };
}
