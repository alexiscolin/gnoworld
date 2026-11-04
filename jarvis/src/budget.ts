// The hard stop on what Jarvis spends (ADR-0002 §5, D41): a model call reserves its worst cost before it starts, by
// one statement that adds it only if the day's spent and reserved sums leave room under the cap, so calls running at
// once never pass it together; then it settles its real cost. A UTC day for questions, another for translations,
// kept in jarvis's own file (D45) so a restart never begins the day again at zero; a hold never settled is spent at
// its worst once its deadline passes (D62). The alerts are values the loop logs (D63, D64). The caps live in the file
// too, seeded once and changed at once by an admin (D173).
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { transaction } from "@gnoworld/service/db";

export const BUDGET_TABLES = `
CREATE TABLE budget_days (
  kind TEXT NOT NULL CHECK (kind IN ('ask', 'translate')),
  day TEXT NOT NULL,
  spent INTEGER NOT NULL DEFAULT 0 CHECK (spent >= 0),
  alerted INTEGER NOT NULL DEFAULT 0 CHECK (alerted IN (0, 80, 100)),
  PRIMARY KEY (kind, day)
) STRICT;
CREATE TABLE budget_holds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  day TEXT NOT NULL,
  worst INTEGER NOT NULL CHECK (worst > 0),
  deadline INTEGER NOT NULL,
  FOREIGN KEY (kind, day) REFERENCES budget_days (kind, day)
) STRICT;
CREATE INDEX budget_holds_by_day ON budget_holds (kind, day);
CREATE INDEX budget_holds_by_deadline ON budget_holds (deadline);
`;

// The day's caps, in nano-dollars: the settings' first values, then an admin's (D173).
export const BUDGET_CAPS = `
CREATE TABLE budget_caps (
  kind TEXT PRIMARY KEY CHECK (kind IN ('ask', 'translate')),
  cap INTEGER NOT NULL CHECK (cap > 0)
) STRICT;
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
  // The caps as the file holds them, and one changed, counted at once against the day.
  caps: () => Record<Kind, number>;
  change: (kind: Kind, cap: number) => void;
}

// A time's day in UTC, as its date: toISOString writes UTC whatever the machine's zone.
const dayOf = (at: number): string => new Date(at).toISOString().slice(0, 10);
const isCount = (value: number | undefined): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
const checkedCap = (cap: number): number => {
  if (!Number.isSafeInteger(cap) || cap < 1) throw new RangeError("a cap is a count, from 1");
  return cap;
};

/** The budget on jarvis's file; `caps` seed the file's caps at its first start alone. */
export function makeBudget(
  db: DatabaseSync,
  { caps, holdMs, now }: { caps: Record<Kind, number>; holdMs: number; now: () => number },
): Budget {
  // openDatabase's NORMAL may lose the last commits to a power cut in WAL mode, and with them settles (F5180).
  db.exec("PRAGMA synchronous = FULL");
  const Held = z.object({ id: z.number() });
  const Taken = z.object({ kind: z.enum(["ask", "translate"]), day: z.string(), worst: z.number() });
  const Sums = z.object({ spent: z.number(), reserved: z.number(), alerted: z.number(), cap: z.number() });
  const capped = capsOf(db, caps);
  const sql = {
    open: db.prepare("INSERT INTO budget_days (kind, day) VALUES (?, ?) ON CONFLICT DO NOTHING"),
    // The cap's read, its check and the hold's add in one statement, so a cap changed counts at the next reservation.
    hold: db.prepare(`INSERT INTO budget_holds (kind, day, worst, deadline) SELECT :kind, :day, :worst, :deadline
      WHERE (SELECT spent FROM budget_days WHERE kind = :kind AND day = :day)
        + (SELECT COALESCE(SUM(worst), 0) FROM budget_holds WHERE kind = :kind AND day = :day) + :worst
        <= (SELECT cap FROM budget_caps WHERE kind = :kind)
      RETURNING id`),
    sums: db.prepare(`SELECT spent, alerted,
      (SELECT COALESCE(SUM(worst), 0) FROM budget_holds h WHERE h.kind = d.kind AND h.day = d.day) AS reserved,
      (SELECT cap FROM budget_caps c WHERE c.kind = d.kind) AS cap
      FROM budget_days d WHERE kind = ? AND day = ?`),
    alert: db.prepare("UPDATE budget_days SET alerted = ? WHERE kind = ? AND day = ?"),
    take: db.prepare("DELETE FROM budget_holds WHERE id = ? AND deadline > ? RETURNING kind, day, worst"),
    expired: db.prepare("DELETE FROM budget_holds WHERE deadline <= ? RETURNING kind, day, worst"),
    spend: db.prepare("UPDATE budget_days SET spent = spent + ? WHERE kind = ? AND day = ?"),
  };
  // The holds past their deadline, spent at their worst: the call may have run.
  const release = (at: number): void => {
    for (const row of sql.expired.all(at)) {
      const { kind, day, worst } = Taken.parse(row);
      sql.spend.run(worst, kind, day);
    }
  };
  // Each one transaction: a hold and the day's sum it moves into change together, or neither does, whatever stops the
  // process between.
  return {
    reserve(kind, worst) {
      if (!Number.isSafeInteger(worst) || worst < 1) throw new RangeError("a worst cost is a count, from 1");
      const at = now();
      const day = dayOf(at);
      return transaction(db, () => {
        release(at);
        sql.open.run(kind, day);
        const row = sql.hold.get({ kind, day, worst, deadline: at + holdMs });
        const { spent, reserved, alerted, cap } = Sums.parse(sql.sums.get(kind, day));
        const reached = spent + reserved + (row === undefined ? worst : 0);
        const alerts = ([80, 100] as const).filter((level) => level > alerted && reached * 100 >= cap * level);
        const highest = alerts.at(-1);
        if (highest !== undefined) sql.alert.run(highest, kind, day);
        if (row === undefined) return { ok: false, reason: "spent", alerts };
        return { ok: true, hold: { id: Held.parse(row).id }, alerts };
      });
    },
    settle(hold, real) {
      return transaction(db, () => {
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
      return transaction(db, () => {
        release(at);
        const row = sql.sums.get(kind, dayOf(at));
        const { spent, reserved } = row === undefined ? { spent: 0, reserved: 0 } : Sums.parse(row);
        return { spent, reserved, cap: capped.read()[kind] };
      });
    },
    caps: capped.read,
    change: capped.change,
  };
}

// The caps in the file: the settings' at the first start alone, both or neither, each checked before anything is
// written; then as they are, an admin's change counted by the next reservation's own statement.
function capsOf(db: DatabaseSync, first: Record<Kind, number>) {
  const Caps = z.array(z.object({ kind: z.enum(["ask", "translate"]), cap: z.number() }));
  const sql = {
    seed: db.prepare("INSERT INTO budget_caps (kind, cap) VALUES (?, ?) ON CONFLICT DO NOTHING"),
    read: db.prepare("SELECT kind, cap FROM budget_caps"),
    change: db.prepare("UPDATE budget_caps SET cap = ? WHERE kind = ?"),
  };
  const checked = { ask: checkedCap(first.ask), translate: checkedCap(first.translate) };
  transaction(db, () => {
    sql.seed.run("ask", checked.ask);
    sql.seed.run("translate", checked.translate);
  });
  return {
    read: (): Record<Kind, number> => {
      const rows = Caps.parse(sql.read.all());
      const capOf = (kind: Kind) => rows.find((row) => row.kind === kind)?.cap ?? 0;
      return { ask: capOf("ask"), translate: capOf("translate") };
    },
    change: (kind: Kind, cap: number): void => {
      sql.change.run(checkedCap(cap), kind);
    },
  };
}
