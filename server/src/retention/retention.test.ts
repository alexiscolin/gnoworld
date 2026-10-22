import type { DatabaseSync } from "node:sqlite";
import fc from "fast-check";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { openDatabase } from "../db.ts";
import { logger } from "../log.ts";
import { LOGIN_TABLES, NONCE_HOST } from "../login/login.ts";
import { TICKET_TABLES } from "../login/ticket.ts";
import { PROGRESS_TABLES } from "../moderation/catchup.ts";
import { VERDICT_TABLES } from "../moderation/check.ts";
import { MUTE_TABLES } from "../moderation/mute.ts";
import { STRIKE_TABLES } from "../moderation/strikes.ts";
import { ROOM_STATE } from "../rooms/create.ts";
import { ROOM_TABLES } from "../rooms/rooms.ts";
import { makeRetention, startRetention } from "./retention.ts";

const DAY = 24 * 60 * 60_000;
const T0 = Date.parse("2026-10-22T12:00:00.000Z");
const PEPPER = "a-pepper-of-forty-characters-0123456789";
// Every table main.ts opens, in its order.
const TABLES = [
  LOGIN_TABLES,
  TICKET_TABLES,
  NONCE_HOST,
  ROOM_TABLES,
  VERDICT_TABLES,
  PROGRESS_TABLES,
  MUTE_TABLES,
  STRIKE_TABLES,
  ROOM_STATE,
];
const opened: DatabaseSync[] = [];
afterEach(() => {
  vi.useRealTimers();
  for (const db of opened.splice(0)) if (db.isOpen) db.close();
});

interface Limits {
  maxVerdicts?: number;
  maxBytes?: number;
  batch?: number;
  batches?: number;
}

const setup = (limits: Limits = {}) => {
  const db = openDatabase(":memory:", TABLES);
  opened.push(db);
  const lines: string[] = [];
  const clock = { now: T0 };
  const options = { log: logger(PEPPER, (line) => lines.push(line)), now: () => clock.now, ...limits };
  const retention = makeRetention(db, options);
  const add = db.prepare(
    "INSERT INTO verdicts (msgid, room, account, action, at) VALUES (?, '#bubble', 'h', 'pass', ?)",
  );
  // n verdicts from `at` on, each `step` ms after the last (0: all in one millisecond).
  const verdicts = (n: number, at: number, { prefix = "m", step = 1 } = {}): void => {
    for (let i = 0; i < n; i += 1) add.run(`${prefix}${String(i)}`, at + i * step);
  };
  const Times = z.array(z.object({ at: z.number() }));
  const times = (): number[] =>
    Times.parse(db.prepare("SELECT at FROM verdicts ORDER BY at").all()).map(({ at }) => at);
  const alerts = (name: string): number => lines.filter((line) => line.includes(`"error":"${name}"`)).length;
  return { db, clock, retention, verdicts, times, alerts, lines, options };
};

describe("the verdicts' retention by days and by cap (3n)", () => {
  it("removes the verdicts older than 180 days, and keeps one exactly 180 days old", () => {
    const { retention, verdicts, times } = setup();
    verdicts(1, T0 - 180 * DAY - 1, { prefix: "old" });
    verdicts(1, T0 - 180 * DAY, { prefix: "edge" });
    verdicts(1, T0, { prefix: "new" });
    retention.tick();
    expect(times()).toEqual([T0 - 180 * DAY, T0]);
  });

  it("keeps the newest past its row cap, the oldest going first", () => {
    const { retention, verdicts, times } = setup({ maxVerdicts: 3 });
    verdicts(5, T0 - 10);
    retention.tick();
    expect(times()).toEqual([T0 - 8, T0 - 7, T0 - 6]);
  });

  it("keeps exactly its cap when the verdicts share one millisecond", () => {
    const { retention, verdicts, times } = setup({ maxVerdicts: 3 });
    verdicts(5, T0, { step: 0 });
    retention.tick();
    expect(times()).toEqual([T0, T0, T0]);
  });

  it("removes nothing when the clock goes back, nor a verdict dated after it", () => {
    const { clock, retention, verdicts, times } = setup();
    verdicts(1, T0 - 10 * DAY, { prefix: "past" });
    verdicts(1, T0 + DAY, { prefix: "ahead" });
    retention.tick();
    clock.now = T0 - 300 * DAY;
    retention.tick();
    expect(times()).toEqual([T0 - 10 * DAY, T0 + DAY]);
  });

  it("touches no other table: a very old row in each stays", () => {
    const { db, retention } = setup({ maxVerdicts: 1 });
    const old = T0 - 1000 * DAY;
    db.prepare("INSERT INTO accounts (address, first_seen) VALUES ('g1x', ?)").run(old);
    db.prepare("INSERT INTO nonces (nonce, chain, text, expires_at) VALUES ('n', 'c', 't', ?)").run(old);
    db.prepare("INSERT INTO tokens (hash, address, signed_at, expires_at) VALUES (x'01', 'g1x', ?, ?)").run(old, old);
    db.prepare("INSERT INTO tickets (hash, address, expires_at) VALUES (x'02', 'g1x', ?)").run(old);
    db.prepare("INSERT INTO rooms (name, world, created_at) VALUES ('#old', 'old', ?)").run(old);
    db.prepare("INSERT INTO progress (room, time) VALUES ('#old', '2023-01-01T00:00:00.000Z')").run();
    db.prepare("INSERT INTO mutes (account, world, until) VALUES ('g1x', 'old', ?)").run(old);
    const Count = z.object({ n: z.number() });
    const counts = () =>
      ["accounts", "nonces", "tokens", "tickets", "rooms", "progress", "mutes"].map(
        (table) => Count.parse(db.prepare(`SELECT count(*) AS n FROM ${table}`).get()).n,
      );
    retention.tick();
    expect(counts()).toEqual([1, 1, 1, 1, 1, 1, 1]);
  });
});

describe("the retention's budget (3n)", () => {
  it("removes at most its budget a tick, in small batches, the rest at the next ticks", () => {
    const { retention, verdicts, times } = setup({ batch: 10, batches: 3 });
    verdicts(70, T0 - 200 * DAY);
    verdicts(2, T0, { prefix: "new" });
    const left = [];
    for (let n = 0; n < 3; n += 1) {
      retention.tick();
      left.push(times().length);
    }
    expect(left).toEqual([42, 12, 2]);
  });

  it("shares one budget between the days and the cap, the days first", () => {
    const { retention, verdicts, times } = setup({ maxVerdicts: 20, batch: 10, batches: 3 });
    verdicts(20, T0 - 200 * DAY, { prefix: "old" });
    verdicts(40, T0 - 100, { prefix: "new" });
    retention.tick();
    // 30 a tick: the 20 old ones, then 10 of the 20 past the cap.
    expect(times()).toEqual(Array.from({ length: 30 }, (_, i) => T0 - 90 + i));
  });

  it("holds its default budget at 10,000 rows a tick", () => {
    const { retention, verdicts, times } = setup();
    verdicts(10_001, T0 - 200 * DAY);
    retention.tick();
    expect(times()).toHaveLength(1);
  });
});

describe("the retention's alerts (3n)", () => {
  it("measures after it removed: rows past their days raise nothing", () => {
    const { retention, verdicts, alerts } = setup({ maxVerdicts: 10 });
    verdicts(9, T0 - 200 * DAY);
    retention.tick();
    expect(alerts("verdicts_near_cap")).toBe(0);
  });

  it("raises the alert when a backlog past the cap outlasts the tick's budget", () => {
    const { retention, verdicts, alerts } = setup({ maxVerdicts: 10, batch: 5, batches: 1 });
    verdicts(30, T0);
    retention.tick();
    expect(alerts("verdicts_near_cap")).toBe(1);
  });

  it("raises the verdicts' alert once at 80% of their cap, again only after they fell below it", () => {
    const { db, retention, verdicts, alerts } = setup({ maxVerdicts: 10 });
    verdicts(7, T0);
    retention.tick();
    expect(alerts("verdicts_near_cap")).toBe(0);
    verdicts(2, T0 + 100, { prefix: "more" });
    retention.tick();
    // Down to 8, still at 80%, and up again: no new alert.
    db.prepare("DELETE FROM verdicts WHERE msgid = 'more1'").run();
    retention.tick();
    verdicts(1, T0 + 200, { prefix: "back" });
    retention.tick();
    expect(alerts("verdicts_near_cap")).toBe(1);
    // Down to 7, below, then 8: the alert again.
    db.prepare("DELETE FROM verdicts WHERE msgid IN ('more0', 'back0')").run();
    retention.tick();
    verdicts(1, T0 + 300, { prefix: "again" });
    retention.tick();
    expect(alerts("verdicts_near_cap")).toBe(2);
  });

  const usedBytes = (db: DatabaseSync): number => {
    const N = z.object({ n: z.number() });
    const pages = N.parse(
      db.prepare("SELECT page_count - freelist_count AS n FROM pragma_page_count, pragma_freelist_count").get(),
    );
    return pages.n * N.parse(db.prepare("SELECT page_size AS n FROM pragma_page_size").get()).n;
  };

  it("raises the database's alert at 80% of its size to the byte, none a byte below, again after a fall", () => {
    const { db, verdicts, options } = setup();
    const lines: string[] = [];
    const watch = (maxBytes: number) =>
      makeRetention(db, { ...options, log: logger(PEPPER, (line) => lines.push(line)), maxBytes });
    const raised = (): number => lines.filter((line) => line.includes('"error":"database_near_cap"')).length;
    verdicts(200, T0);
    // used / max = 80% exactly when used * 5 = max * 4: the largest max at 80% or above, and one past it.
    const atCap = Math.floor((usedBytes(db) * 5) / 4);
    watch(atCap + 1).tick();
    expect(raised()).toBe(0);
    const watched = watch(atCap);
    watched.tick();
    watched.tick();
    expect(raised()).toBe(1);
    db.prepare("DELETE FROM verdicts").run();
    watched.tick();
    verdicts(200, T0, { prefix: "again" });
    watched.tick();
    expect(raised()).toBe(2);
  });

  it("raises both alerts in one tick, each re-armed on its own", () => {
    const { db, verdicts, options } = setup();
    const lines: string[] = [];
    verdicts(9, T0);
    const both = makeRetention(db, {
      ...options,
      log: logger(PEPPER, (line) => lines.push(line)),
      maxVerdicts: 10,
      maxBytes: Math.floor((usedBytes(db) * 5) / 4),
    });
    both.tick();
    const names = () => lines.map((line) => /"error":"(\w+)"/.exec(line)?.[1]);
    expect(names()).toEqual(["verdicts_near_cap", "database_near_cap"]);
    db.prepare("DELETE FROM verdicts WHERE msgid IN ('m0', 'm1')").run();
    both.tick();
    verdicts(2, T0 + 100, { prefix: "back" });
    both.tick();
    expect(names()).toEqual(["verdicts_near_cap", "database_near_cap", "verdicts_near_cap"]);
  });
});

describe("the retention's runs (3n)", () => {
  it("runs at once, then every five minutes, and never after its stop", () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const { db, verdicts, times, options } = setup();
    verdicts(1, T0 - 200 * DAY, { prefix: "a" });
    const job = startRetention(db, options);
    expect(times()).toEqual([]);
    verdicts(1, T0 - 200 * DAY, { prefix: "b" });
    vi.advanceTimersByTime(5 * 60_000 - 1);
    expect(times()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(times()).toEqual([]);
    verdicts(1, T0 - 200 * DAY, { prefix: "c" });
    job.stop();
    vi.advanceTimersByTime(10 * 60_000);
    expect(times()).toHaveLength(1);
  });

  it("throws on a database that failed, so the process stops rather than serve unpruned", () => {
    const { db, retention } = setup();
    db.close();
    expect(() => {
      retention.tick();
    }).toThrow();
  });

  it("leaves, for any verdicts and caps, none older than its days and no more than its cap, the newest kept", () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ age: fc.integer({ min: 0, max: 400 }), ms: fc.integer({ min: 0, max: 3 }) }), {
          maxLength: 60,
        }),
        fc.integer({ min: 1, max: 40 }),
        (rows, max) => {
          const { db, retention, times } = setup({ maxVerdicts: max, batch: 7, batches: 2 });
          const add = db.prepare(
            "INSERT INTO verdicts (msgid, room, account, action, at) VALUES (?, '#b', 'h', 'pass', ?)",
          );
          const ats = rows.map(({ age, ms }) => T0 - age * DAY - ms);
          ats.forEach((at, i) => add.run(`p${String(i)}`, at));
          // Enough ticks for a backlog of 60 at 14 a tick.
          for (let n = 0; n < 5; n += 1) retention.tick();
          const kept = ats.filter((at) => at >= T0 - 180 * DAY).toSorted((a, b) => a - b);
          expect(times()).toEqual(kept.slice(Math.max(0, kept.length - max)));
          db.close();
        },
      ),
      { numRuns: 100 },
    );
  });
});
