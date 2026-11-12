// The rollup's state (slice 13a) in the server's database, for one universe: per realm its calls, callers, days, functions and last calls,
// and the height every call is counted up to, so a pass reads only what is new and a restart resumes. Every list is bounded: 100 calls a
// realm, the chain's newest 400 days; the callers and functions grow with the transactions alone, each of which paid its fee.
import { ExportedName, PERSON_CAPS, ROLLUP_CAPS, type RealmRollup } from "@gnoworld/schemas/indexer";
import { transaction } from "@gnoworld/service/db";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { Dated } from "./blockDays.ts";
import type { Row } from "./history.ts";
import { Failure } from "./remote.ts";
import { anchorIn, heightIn } from "./stateRows.ts";

export const ROLLUP_TABLES = `
CREATE TABLE rollup_state (universe TEXT PRIMARY KEY, height INTEGER NOT NULL, anchor INTEGER, anchor_time TEXT) STRICT;
CREATE TABLE rollup_realms (realm TEXT PRIMARY KEY, calls INTEGER NOT NULL) STRICT;
CREATE TABLE rollup_callers (realm TEXT NOT NULL, caller TEXT NOT NULL, calls INTEGER NOT NULL, PRIMARY KEY (realm, caller)) STRICT, WITHOUT ROWID;
CREATE TABLE rollup_days (realm TEXT NOT NULL, day TEXT NOT NULL, calls INTEGER NOT NULL, PRIMARY KEY (realm, day)) STRICT, WITHOUT ROWID;
CREATE TABLE rollup_day_callers (realm TEXT NOT NULL, day TEXT NOT NULL, caller TEXT NOT NULL, PRIMARY KEY (realm, day, caller)) STRICT, WITHOUT ROWID;
CREATE TABLE rollup_functions (realm TEXT NOT NULL, func TEXT NOT NULL, calls INTEGER NOT NULL, PRIMARY KEY (realm, func)) STRICT, WITHOUT ROWID;
CREATE TABLE rollup_calls (id INTEGER PRIMARY KEY, realm TEXT NOT NULL, height INTEGER NOT NULL, func TEXT, caller TEXT, success INTEGER NOT NULL, time TEXT) STRICT;
CREATE INDEX rollup_calls_by_realm ON rollup_calls (realm, id);
CREATE INDEX rollup_calls_untimed ON rollup_calls (height) WHERE time IS NULL;
`;
const TABLES = [
  "rollup_caller_days",
  "rollup_state",
  "rollup_realms",
  "rollup_callers",
  "rollup_days",
  "rollup_day_callers",
  "rollup_functions",
  "rollup_calls",
];
const DAY_MS = 86_400_000;

type Importers = RealmRollup["importers"];
type Call = Row["calls"][number];

export interface RollupStore {
  /** The height up to which every call is counted, none before a first page. */
  height: () => number | undefined;
  /** The last dated height and its block's time, which a restarted chain no longer holds. */
  anchor: () => { height: number; time: string } | undefined;
  /** A batch of rows dated by `dated`, every row up to `through` read; a row at or below the height kept is left out. */
  add: (rows: readonly Row[], dated: Dated, through: number) => void;
  /** The heights of kept calls with no time yet, highest first, and their times once read. */
  untimed: (most: number) => number[];
  timed: (times: ReadonlyMap<number, string>) => void;
  /** Every row dropped: another chain. */
  reset: () => void;
  /** A realm's whole file, its lists at their caps; none for a realm with no call and no importer. */
  rollupOf: (path: string, importers: Importers | undefined, updated: string) => RealmRollup | undefined;
}

const Height = z.object({ height: z.number() });
const Counted = z.object({ n: z.number() });
const Days = z.array(z.object({ day: z.string(), calls: z.number(), callers: z.number() }));
const Top = z.array(z.object({ address: z.string(), calls: z.number() }));
const Last = z.array(
  z.object({
    func: z.nullable(z.string()),
    caller: z.nullable(z.string()),
    height: z.number(),
    success: z.number(),
    time: z.nullable(z.string()),
  }),
);
const Functions = z.array(z.object({ name: z.string(), calls: z.number() }));
const Heights = z.array(Height);

// The statements of one call kept, and of the bounds kept after a batch.
function writers(db: DatabaseSync) {
  const upsert = (table: string, columns: number) =>
    db.prepare(`INSERT INTO ${table} VALUES (${"?, ".repeat(columns)}1) ON CONFLICT DO UPDATE SET calls = calls + 1`);
  const [realm, caller, day, func] = [
    upsert("rollup_realms", 1),
    upsert("rollup_callers", 2),
    upsert("rollup_days", 2),
    upsert("rollup_functions", 2),
  ];
  const callerDay = upsert("rollup_caller_days", 2);
  const dayCaller = db.prepare("INSERT OR IGNORE INTO rollup_day_callers VALUES (?, ?, ?)");
  const call = db.prepare(
    "INSERT INTO rollup_calls (realm, height, func, caller, success, time) VALUES (?, ?, ?, ?, ?, ?)",
  );
  const one = (row: Row, { path, caller: by, func: named }: Call, at: { day: string; time: string | null }): void => {
    const name = ExportedName.safeParse(named).success ? (named ?? null) : null;
    realm.run(path);
    day.run(path, at.day);
    if (by !== undefined) {
      caller.run(path, by);
      dayCaller.run(path, at.day, by);
      callerDay.run(by, at.day);
    }
    // A failed call may name any function: a successful one names one the realm has.
    if (name !== null && row.success) func.run(path, name);
    call.run(path, row.height, name, by ?? null, row.success ? 1 : 0, at.time);
  };
  return {
    // A row's calls, each on the UTC day `dated` gives its height.
    row(row: Row, dated: Dated): void {
      const day = dated.days.get(row.height);
      if (day === undefined) throw new Failure("shape");
      for (const each of row.calls) one(row, each, { day, time: dated.times.get(row.height) ?? null });
    },
    keepCalls: db.prepare(
      `DELETE FROM rollup_calls WHERE realm = ? AND id <= (SELECT id FROM rollup_calls WHERE realm = ? ORDER BY id DESC LIMIT 1 OFFSET ${String(ROLLUP_CAPS.last)})`,
    ),
    state: db.prepare(
      "INSERT INTO rollup_state VALUES (?, ?, ?, ?) ON CONFLICT DO UPDATE SET height = excluded.height, anchor = coalesce(excluded.anchor, anchor), anchor_time = coalesce(excluded.anchor_time, anchor_time)",
    ),
  };
}

// The highest height of a batch whose block's time was read: what a later pass checks the chain still holds.
function anchorOf(rows: readonly Row[], dated: Dated): { height: number; time: string } | undefined {
  for (const { height } of rows.toReversed()) {
    const time = dated.times.get(height);
    if (time !== undefined) return { height, time };
  }
  return undefined;
}

// The days kept: the newest 400 of the chain's, counted from `newest`, the newest day read (rows come in height order, so no stored day is later).
function keepDays(db: DatabaseSync, newest: string): void {
  const cutoff = new Date(Date.parse(newest) - (ROLLUP_CAPS.days - 1) * DAY_MS).toISOString().slice(0, 10);
  for (const table of ["rollup_days", "rollup_day_callers"])
    db.prepare(`DELETE FROM ${table} WHERE day < ?`).run(cutoff);
  const person = new Date(Date.parse(newest) - (PERSON_CAPS.days - 1) * DAY_MS).toISOString().slice(0, 10);
  db.prepare("DELETE FROM rollup_caller_days WHERE day < ?").run(person);
}

// A realm's whole file from the state.
function fileOf(
  db: DatabaseSync,
  head: { universe: string; path: string; height: number; updated: string },
  importers: Importers,
) {
  const { path } = head;
  const all = <T>(schema: z.ZodType<T>, sql: string): T => schema.parse(db.prepare(sql).all(path));
  const count = (sql: string) => Counted.parse(db.prepare(sql).get(path)).n;
  return {
    version: 1 as const,
    ...head,
    calls: count("SELECT coalesce(sum(calls), 0) AS n FROM rollup_realms WHERE realm = ?"),
    callers: count("SELECT count(*) AS n FROM rollup_callers WHERE realm = ?"),
    days: all(
      Days,
      `SELECT day, calls, (SELECT count(*) FROM rollup_day_callers c WHERE c.realm = d.realm AND c.day = d.day) AS callers
       FROM rollup_days d WHERE realm = ? ORDER BY day DESC LIMIT ${String(ROLLUP_CAPS.days)}`,
    ).reverse(),
    top: all(
      Top,
      `SELECT caller AS address, calls FROM rollup_callers WHERE realm = ? ORDER BY calls DESC, caller LIMIT ${String(ROLLUP_CAPS.callers)}`,
    ),
    last: all(
      Last,
      `SELECT func, caller, height, success, time FROM rollup_calls WHERE realm = ? ORDER BY id DESC LIMIT ${String(ROLLUP_CAPS.last)}`,
    ).map((row) => ({ ...row, success: row.success === 1 })),
    importers,
    functions: all(
      Functions,
      `SELECT func AS name, calls FROM rollup_functions WHERE realm = ? ORDER BY calls DESC, func LIMIT ${String(ROLLUP_CAPS.functions)}`,
    ),
  };
}

/** The rollup's state in `db`, for `universe` alone: rows of another are dropped at once. */
export function rollupStore(db: DatabaseSync, universe: string): RollupStore {
  // The newest day the days were pruned for: the cutoff moves only when a newer day arrives.
  let pruned = "";
  const reset = (): void => {
    pruned = "";
    transaction(db, () => {
      for (const table of TABLES) db.exec(`DELETE FROM ${table}`);
    });
  };
  if (db.prepare("SELECT 1 FROM rollup_state WHERE universe <> ?").get(universe) !== undefined) reset();
  const height = (): number | undefined => heightIn(db, "rollup_state", universe);
  const write = writers(db);
  const add = (rows: readonly Row[], dated: Dated, through: number): void => {
    const kept = height() ?? -1;
    const fresh = rows.filter((row) => row.height > kept && row.calls.length > 0);
    transaction(db, () => {
      for (const row of fresh) write.row(row, dated);
      for (const path of new Set(fresh.flatMap(({ calls }) => calls.map((call) => call.path))))
        write.keepCalls.run(path, path);
      const newest = [...dated.days.values()].sort().at(-1) ?? "";
      if (newest > pruned) keepDays(db, (pruned = newest));
      const anchor = anchorOf(fresh, dated);
      if (through > kept) write.state.run(universe, through, anchor?.height ?? null, anchor?.time ?? null);
    });
  };
  return {
    height,
    anchor: () => anchorIn(db, "rollup_state", universe),
    add,
    untimed: (most) =>
      Heights.parse(
        db
          .prepare(
            `SELECT DISTINCT height FROM rollup_calls WHERE time IS NULL ORDER BY height DESC LIMIT ${String(most)}`,
          )
          .all(),
      ).map((row) => row.height),
    timed: (times) => {
      transaction(db, () => {
        const set = db.prepare("UPDATE rollup_calls SET time = ? WHERE height = ? AND time IS NULL");
        for (const [at, time] of times) set.run(time, at);
      });
    },
    reset,
    rollupOf: (path, importers, updated) => {
      const file = fileOf(db, { universe, path, height: height() ?? 0, updated }, importers ?? { total: 0, top: [] });
      return file.calls === 0 && file.importers.total === 0 ? undefined : file;
    },
  };
}
