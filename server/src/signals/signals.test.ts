import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { openDatabase } from "@gnoworld/service/db";
import { afterEach, describe, expect, it } from "vitest";
import type { Said } from "../irc/link.ts";
import { migrations } from "../migrations.ts";
import { makeProgress, PROGRESS_TABLES } from "../moderation/catchup.ts";
import { VERDICT_TABLES, type Verdict } from "../moderation/check.ts";
import { moderate } from "../moderation/way.ts";
import { makeStream } from "../stream/stream.ts";
import { firstSignals, firstWords, makeSignals, SIGNAL_TABLES, type Signals } from "./signals.ts";

// Slice 9h (D210 to D219): who charted a world first and who spoke first, recorded once a world by a unique key in
// SQLite, a migration of its own. The store is the truth; the routes and the stream only tell it.
const T0 = Date.parse("2026-11-05T12:00:00.000Z");
const ALICE = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
const BOB = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";

const opened: DatabaseSync[] = [];
const folders: string[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) db.close();
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});
const memory = () => {
  const db = openDatabase(":memory:", [SIGNAL_TABLES]);
  opened.push(db);
  return db;
};

// The server holds one connection alone (db.ts: EXCLUSIVE), so a race is not two processes: it is two callers of one
// store whose ask and write are not one step. node:sqlite is synchronous, so only a hook between them makes it: this
// store's first write waits for `rival`. The Proxy hands every call to the real connection and statement.
const bound = <T extends object>(target: T, wrap: (value: unknown, name: string | symbol) => unknown): T =>
  new Proxy(target, {
    get: (real, name) => {
      const value: unknown = Reflect.get(real, name, real);
      return typeof value === "function" ? wrap(value.bind(real), name) : value;
    },
  });
const racing = (db: DatabaseSync, rival: () => void): DatabaseSync => {
  let waited = false;
  return bound(db, (prepare, name) =>
    name !== "prepare"
      ? prepare
      : (sql: string) => {
          const statement = (prepare as DatabaseSync["prepare"])(sql);
          if (!/^\s*insert/i.test(sql)) return statement;
          return bound(statement, (call, method) =>
            method !== "run"
              ? call
              : (...args: unknown[]) => {
                  if (!waited) {
                    waited = true;
                    rival();
                  }
                  return (call as (...rest: unknown[]) => unknown)(...args);
                },
          );
        },
  );
};
// One database, two stores over it: the server's, which a rival's call lands under, and the rival's.
const withRival = (hold: (rival: Signals) => void) => {
  const db = memory();
  const rival = makeSignals(db, { now: () => T0 + 1 });
  const mine = makeSignals(
    racing(db, () => {
      hold(rival);
    }),
    { now: () => T0 },
  );
  return { db, mine, rival };
};

describe("the signals' migration", () => {
  it("is one of the server's, of its own, and makes the table", () => {
    // Its place is migrations.test.ts's to hold (its pinned hashes); a later migration must not make this one fail.
    expect(migrations).toContain(SIGNAL_TABLES);
    const db = memory();
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all()).toContainEqual({
      name: "first_signals",
    });
  });
});

describe("first to chart", () => {
  it("is recorded for the first account that asks, with the time, and for no other", () => {
    const signals = makeSignals(memory(), { now: () => T0 });
    expect(signals.chart("govdao", ALICE)).toBe(true);
    expect(signals.chart("govdao", BOB)).toBe(false);
    expect(signals.chart("govdao", ALICE)).toBe(false);
    expect(signals.firsts("govdao")).toEqual({
      world: "govdao",
      charted: { account: ALICE, at: "2026-11-05T12:00:00.000Z" },
      words: null,
    });
  });

  it("is one record a world: another world has its own first", () => {
    const signals = makeSignals(memory(), { now: () => T0 });
    expect(signals.chart("govdao", ALICE)).toBe(true);
    expect(signals.chart("bubble", BOB)).toBe(true);
    expect(signals.firsts("bubble").charted?.account).toBe(BOB);
  });

  it("is won by the unique key, not the order of the calls: a rival that lands between the ask and the write wins, this one is told no", () => {
    const { mine, rival } = withRival((other) => other.chart("fresh-mint", BOB));
    expect(mine.chart("fresh-mint", ALICE)).toBe(false);
    expect(rival.firsts("fresh-mint").charted?.account).toBe(BOB);
    expect(mine.firsts("fresh-mint").charted?.account).toBe(BOB);
  });

  it("is refused by the table itself for a second record of a world and a kind", () => {
    const db = memory();
    const signals = makeSignals(db, { now: () => T0 });
    expect(signals.chart("fresh-mint", ALICE)).toBe(true);
    const again = () =>
      db.prepare("INSERT INTO first_signals (world, kind, account, at) VALUES ('fresh-mint', 'chart', ?, 0)").run(BOB);
    expect(again).toThrow(/UNIQUE|constraint/i);
    // Another kind of the same world is its own record.
    expect(signals.words("fresh-mint", BOB)).toBe(true);
  });

  it("has first words won the same way: a rival's line that lands first keeps it", () => {
    const { mine, rival } = withRival((other) => other.words("fresh-mint", BOB));
    expect(mine.words("fresh-mint", ALICE)).toBe(false);
    expect(rival.firsts("fresh-mint").words?.account).toBe(BOB);
  });

  it("never charts for a guest or for anything that is no address", () => {
    const db = memory();
    const signals = makeSignals(db, { now: () => T0 });
    for (const who of ["guest-zzzzzz", "", "<script>alert(1)</script>", "G10GH7YQ7SWV77EFWFCQY2ZNP37CMEUGHXX3Y5TV"])
      expect(signals.chart("govdao", who)).toBe(false);
    expect(signals.chart("Not A Slug", ALICE)).toBe(false);
    expect(db.prepare("SELECT count(*) AS n FROM first_signals").get()).toEqual({ n: 0 });
  });

  it("is kept by a restart: the database reopened still names the first, and a late account still loses", () => {
    const folder = mkdtempSync(join(tmpdir(), "signals-"));
    folders.push(folder);
    const file = join(folder, "server.db");
    const before = openDatabase(file, [SIGNAL_TABLES]);
    expect(makeSignals(before, { now: () => T0 }).chart("govdao", ALICE)).toBe(true);
    before.close();
    const after = openDatabase(file, [SIGNAL_TABLES]);
    opened.push(after);
    const signals = makeSignals(after, { now: () => T0 + 60_000 });
    expect(signals.chart("govdao", BOB)).toBe(false);
    expect(signals.firsts("govdao").charted).toEqual({ account: ALICE, at: "2026-11-05T12:00:00.000Z" });
  });

  // The page's plate hears who is first on the stream alone: a new process tells the stream every first it holds.
  it("gives a new process every first it holds as the signals its stream tells, and none for a world without one", () => {
    const db = memory();
    const signals = makeSignals(db, { now: () => T0 });
    signals.chart("govdao", ALICE);
    signals.words("govdao", BOB);
    signals.chart("bubble", BOB);
    const at = "2026-11-05T12:00:00.000Z";
    expect(firstSignals(signals, ["govdao", "earth", "bubble"])).toEqual([
      { kind: "chart", world: "govdao", account: ALICE, at },
      { kind: "words", world: "govdao", account: BOB, at },
      { kind: "chart", world: "bubble", account: BOB, at },
    ]);
  });
});

const said = (over: Partial<Said> = {}): Said => ({
  room: "#bubble",
  account: ALICE,
  msgid: "m1",
  text: "gm",
  ...over,
});

const open = () => true;

describe("first words", () => {
  it("records the first line that passed in any room of the world, with the time, and tells it once", () => {
    const told: unknown[] = [];
    const signals = makeSignals(memory(), { now: () => T0 });
    const words = firstWords({ signals, publish: (signal) => told.push(signal), isPublic: open });
    words(said({ room: "#bubble/games", account: BOB }));
    words(said({ msgid: "m2" }));
    expect(told).toEqual([{ kind: "words", world: "bubble", account: BOB, at: "2026-11-05T12:00:00.000Z" }]);
    expect(signals.firsts("bubble").words?.account).toBe(BOB);
  });

  it("is a world's own: a line in another world is that world's first", () => {
    const told: unknown[] = [];
    const words = firstWords({
      signals: makeSignals(memory(), { now: () => T0 }),
      publish: (s) => told.push(s),
      isPublic: open,
    });
    words(said());
    words(said({ room: "#govdao", account: BOB, msgid: "m2" }));
    expect(told).toHaveLength(2);
  });

  it("never takes a guest's line or an account that is no address", () => {
    const told: unknown[] = [];
    const signals = makeSignals(memory(), { now: () => T0 });
    const words = firstWords({ signals, publish: (s) => told.push(s), isPublic: open });
    words(said({ account: "guest-zzzzzz" }));
    words(said({ account: "<b>x</b>", msgid: "m2" }));
    expect(told).toEqual([]);
    expect(signals.firsts("bubble").words).toBeNull();
  });

  // D214: the record is told to anyone on the stream and drawn as a banner, so only a line said to everyone in an
  // open, listed room is first words: never a line to the operators alone, an edit, or a room that is not open to all.
  it("takes no line said to the operators alone, no edit, and no line of a room that is not public: the next one is first", () => {
    const told: unknown[] = [];
    const signals = makeSignals(memory(), { now: () => T0 });
    const words = firstWords({
      signals,
      publish: (s) => told.push(s),
      isPublic: (room) => room === "#bubble",
    });
    words(said({ few: true }));
    words(said({ msgid: "m2", edits: "m1" }));
    words(said({ msgid: "m3", room: "#bubble/crew" }));
    words(said({ msgid: "m4", room: "#bubble/news" }));
    expect(told).toEqual([]);
    expect(signals.firsts("bubble").words).toBeNull();
    words(said({ msgid: "m5", account: BOB }));
    expect(told).toEqual([{ kind: "words", world: "bubble", account: BOB, at: "2026-11-05T12:00:00.000Z" }]);
  });

  it("is kept by a restart", () => {
    const folder = mkdtempSync(join(tmpdir(), "signals-"));
    folders.push(folder);
    const file = join(folder, "server.db");
    const before = openDatabase(file, [SIGNAL_TABLES]);
    firstWords({ signals: makeSignals(before, { now: () => T0 }), publish: () => undefined, isPublic: open })(said());
    before.close();
    const after = openDatabase(file, [SIGNAL_TABLES]);
    opened.push(after);
    const told: unknown[] = [];
    firstWords({
      signals: makeSignals(after, { now: () => T0 + 1 }),
      publish: (s) => told.push(s),
      isPublic: open,
    })(said({ account: BOB, msgid: "m2" }));
    expect(told).toEqual([]);
    expect(makeSignals(after, { now: () => T0 }).firsts("bubble").words?.account).toBe(ALICE);
  });
});

// The moderation's own way hands a line on only once it passed: a hidden, unchecked or busy line is never first words.
describe("first words behind moderation (the way a line goes)", () => {
  const run = (verdict: Verdict | "seen" | "busy") => {
    const db = openDatabase(":memory:", [SIGNAL_TABLES, VERDICT_TABLES, PROGRESS_TABLES]);
    opened.push(db);
    db.prepare("INSERT INTO verdicts (msgid, room, account, action, at) VALUES ('m1', '#bubble', ?, 'pass', 0)").run(
      ALICE,
    );
    const signals = makeSignals(db, { now: () => T0 });
    const told: unknown[] = [];
    const moderated = moderate({
      db,
      check: () => Promise.resolve(verdict),
      send: () => true,
      stream: makeStream(),
      progress: makeProgress(db),
      strike: () => undefined,
      passed: firstWords({ signals, publish: (s) => told.push(s), isPublic: open }),
    });
    return { moderated, told, signals };
  };
  const PASS: Verdict = { action: "pass" };
  const HIDE: Verdict = { action: "hide", reason: "banned_word" };

  it("records a line that passed", async () => {
    const { moderated, told, signals } = run(PASS);
    await moderated(said());
    expect(told).toHaveLength(1);
    expect(signals.firsts("bubble").words?.account).toBe(ALICE);
  });

  it.each([["hide"], ["seen"], ["busy"]] as const)("records nothing for a line that is %s", async (outcome) => {
    const { moderated, told, signals } = run(outcome === "hide" ? HIDE : outcome);
    await moderated(said());
    expect(told).toEqual([]);
    expect(signals.firsts("bubble").words).toBeNull();
  });
});
