// The hard stop on what Jarvis spends (ADR-0002 §5, D41): a model call reserves its worst cost before it starts, by
// one statement that adds it only if the day's spent and reserved sums leave room under the cap, so calls running at
// once never pass it together; then it settles its real cost. A UTC day for questions, another for translations,
// kept in jarvis's own file (D45) so a restart never begins the day again at zero; a hold never settled is spent at
// its worst once its deadline passes (D62). The alerts are values the loop logs (D63, D64).
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";

export const BUDGET_TABLES = `
CREATE TABLE budget_days (
  kind TEXT NOT NULL CHECK (kind IN ('ask', 'translate')),
  day TEXT NOT NULL,
  spent INTEGER NOT NULL DEFAULT 0 CHECK (spent >= 0),
  alerted INTEGER NOT NULL DEFAULT 0 CHECK (alerted IN (0, 80, 100)),
  PRIMARY KEY (kind, day)
) STRICT;
CREATE TABLE budget_holds (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL,
  day TEXT NOT NULL,
  worst INTEGER NOT NULL CHECK (worst > 0),
  deadline INTEGER NOT NULL,
  FOREIGN KEY (kind, day) REFERENCES budget_days (kind, day)
) STRICT;
CREATE INDEX budget_holds_by_day ON budget_holds (kind, day);
CREATE INDEX budget_holds_by_deadline ON budget_holds (deadline);
`;

export type Kind = "ask" | "translate";
type Alert = 80 | 100;
interface Hold {
  readonly id: number;
}
type Reservation = { ok: true; hold: Hold; alerts: Alert[] } | { ok: false; reason: "spent"; alerts: Alert[] };
// `over`: a real cost above the worst, charged as it is, the bound being wrong; `unpriced`: none, charged the worst.
type Settlement = { status: "settled" | "over" | "unpriced"; charged: number } | { status: "gone" };
interface DayState {
  spent: number;
  reserved: number;
  cap: number;
}
export interface Budget {
  reserve: (kind: Kind, worst: number) => Reservation;
  settle: (hold: Hold, real: number | undefined) => Settlement;
  state: (kind: Kind) => DayState;
}

// A time's day in UTC, as its date: toISOString writes UTC whatever the machine's zone.
const dayOf = (at: number): string => new Date(at).toISOString().slice(0, 10);
const isCount = (value: number | undefined): value is number =>
  value !== undefined && Number.isSafeInteger(value) && value >= 0;

export function makeBudget(
  db: DatabaseSync,
  { caps, holdMs, now }: { caps: Record<Kind, number>; holdMs: number; now: () => number },
): Budget {
  const Held = z.object({ id: z.number() });
  const Taken = z.object({ kind: z.enum(["ask", "translate"]), day: z.string(), worst: z.number() });
  const Sums = z.object({ spent: z.number(), reserved: z.number(), alerted: z.number() });
  const sql = {
    open: db.prepare("INSERT INTO budget_days (kind, day) VALUES (?, ?) ON CONFLICT DO NOTHING"),
    // The cap's check and the hold's add in one statement.
    hold: db.prepare(`INSERT INTO budget_holds (kind, day, worst, deadline) SELECT :kind, :day, :worst, :deadline
      WHERE (SELECT spent FROM budget_days WHERE kind = :kind AND day = :day)
        + (SELECT COALESCE(SUM(worst), 0) FROM budget_holds WHERE kind = :kind AND day = :day) + :worst <= :cap
      RETURNING id`),
    sums: db.prepare(`SELECT spent, alerted,
      (SELECT COALESCE(SUM(worst), 0) FROM budget_holds h WHERE h.kind = d.kind AND h.day = d.day) AS reserved
      FROM budget_days d WHERE kind = ? AND day = ?`),
    alert: db.prepare("UPDATE budget_days SET alerted = ? WHERE kind = ? AND day = ?"),
    take: db.prepare("DELETE FROM budget_holds WHERE id = ? AND deadline > ? RETURNING kind, day, worst"),
    expired: db.prepare("DELETE FROM budget_holds WHERE deadline <= ? RETURNING kind, day, worst"),
    spend: db.prepare("UPDATE budget_days SET spent = spent + ? WHERE kind = ? AND day = ?"),
  };
  // A hold and the day's sum it moves into change together, or neither does, whatever stops the process between.
  const atomically = <T>(work: () => T): T => {
    db.exec("BEGIN");
    try {
      const done = work();
      db.exec("COMMIT");
      return done;
    } catch (error) {
      if (db.isTransaction) db.exec("ROLLBACK");
      throw error;
    }
  };
  // The holds past their deadline, spent at their worst: the call may have run.
  const release = (at: number): void => {
    for (const row of sql.expired.all(at)) {
      const { kind, day, worst } = Taken.parse(row);
      sql.spend.run(worst, kind, day);
    }
  };
  return {
    reserve(kind, worst) {
      if (!Number.isSafeInteger(worst) || worst < 1) throw new RangeError("a worst cost is a count, from 1");
      const at = now();
      const day = dayOf(at);
      const cap = caps[kind];
      return atomically(() => {
        release(at);
        sql.open.run(kind, day);
        const row = sql.hold.get({ kind, day, worst, deadline: at + holdMs, cap });
        const { spent, reserved, alerted } = Sums.parse(sql.sums.get(kind, day));
        const reached = spent + reserved + (row === undefined ? worst : 0);
        const alerts = ([80, 100] as const).filter((level) => level > alerted && reached * 100 >= cap * level);
        const highest = alerts.at(-1);
        if (highest !== undefined) sql.alert.run(highest, kind, day);
        if (row === undefined) return { ok: false, reason: "spent", alerts };
        return { ok: true, hold: { id: Held.parse(row).id }, alerts };
      });
    },
    settle(hold, real) {
      return atomically(() => {
        const row = sql.take.get(hold.id, now());
        if (row === undefined) return { status: "gone" };
        const { kind, day, worst } = Taken.parse(row);
        const charged = isCount(real) ? real : worst;
        sql.spend.run(charged, kind, day);
        if (!isCount(real)) return { status: "unpriced", charged };
        return { status: real > worst ? "over" : "settled", charged };
      });
    },
    state(kind) {
      const at = now();
      return atomically(() => {
        release(at);
        const row = sql.sums.get(kind, dayOf(at));
        const { spent, reserved } = row === undefined ? { spent: 0, reserved: 0 } : Sums.parse(row);
        return { spent, reserved, cap: caps[kind] };
      });
    },
  };
}
