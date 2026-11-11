import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { Address } from "@gnoworld/schemas";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase } from "@gnoworld/service/db";
import { QUOTA_TABLES } from "./quota.ts";
import { DAY_TABLES, makeDay, SHARE, STRIKES } from "./day.ts";

// D13985 points 4 and 5: an account's strikes and its own spend, per UTC day, kept in the server's database.
const T0 = Date.parse("2026-11-11T12:00:00.000Z");
const DAY = 24 * 60 * 60_000;
const ANNA = Address.parse("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5");
const BEN = Address.parse("g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv");

const opened: DatabaseSync[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) db.close();
});
const setup = () => {
  const db = openDatabase(":memory:", [DAY_TABLES]);
  opened.push(db);
  const clock = { now: T0 };
  return { db, clock, day: makeDay(db, { now: () => clock.now }) };
};

describe("the tables", () => {
  it("are appended to a database the quota's tables made: it opens with both, and keeps its rows", () => {
    const dir = mkdtempSync(join(tmpdir(), "day-"));
    try {
      const path = join(dir, "door.db");
      const old = openDatabase(path, [QUOTA_TABLES]);
      old.prepare("INSERT INTO jarvis_asked (account, day, count) VALUES ('a', '2026-11-11', 2)").run();
      old.close();
      const db = openDatabase(path, [QUOTA_TABLES, DAY_TABLES]);
      opened.push(db);
      expect(db.prepare("SELECT count FROM jarvis_asked").get()).toEqual({ count: 2 });
      makeDay(db, { now: () => T0 }).strike(ANNA);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("the limits", () => {
  it("are 3 strikes and 250,000 millionths of a dollar", () => {
    expect([STRIKES, SHARE]).toEqual([3, 250_000]);
  });
});

describe("an account's strikes", () => {
  it("count one each, per account, and pause at 3", () => {
    const { day } = setup();
    expect([day.paused(ANNA)]).toEqual([false]);
    day.strike(ANNA);
    day.strike(ANNA);
    expect(day.paused(ANNA)).toBe(false);
    day.strike(ANNA);
    expect([day.paused(ANNA), day.paused(BEN)]).toEqual([true, false]);
  });

  it("end at the next UTC day, not 24 hours after", () => {
    const { day, clock } = setup();
    for (let at = 0; at < 3; at += 1) day.strike(ANNA);
    clock.now = Date.parse("2026-11-11T23:59:59.999Z");
    expect(day.paused(ANNA)).toBe(true);
    clock.now = Date.parse("2026-11-12T00:00:00.000Z");
    expect(day.paused(ANNA)).toBe(false);
  });

  it("are kept in the database: another reader of it sees them", () => {
    const { db, clock, day } = setup();
    for (let at = 0; at < 3; at += 1) day.strike(ANNA);
    expect(makeDay(db, { now: () => clock.now }).paused(ANNA)).toBe(true);
  });
});

describe("an account's own share", () => {
  it("adds each answer's cost, per account, and caps at 250,000", () => {
    const { day } = setup();
    day.spend(ANNA, 100_000);
    day.spend(ANNA, 149_999);
    expect(day.capped(ANNA)).toBe(false);
    day.spend(ANNA, 1);
    expect([day.capped(ANNA), day.capped(BEN)]).toEqual([true, false]);
  });

  it("is capped past 250,000 as well", () => {
    const { day } = setup();
    day.spend(ANNA, 900_000);
    expect(day.capped(ANNA)).toBe(true);
  });

  it("ends at the next UTC day", () => {
    const { day, clock } = setup();
    day.spend(ANNA, SHARE);
    clock.now += DAY;
    expect(day.capped(ANNA)).toBe(false);
  });

  it("is added to the day of the question, as asked, not of the answer", () => {
    const { day, clock } = setup();
    clock.now = Date.parse("2026-11-11T23:59:59.000Z");
    const asked = clock.now;
    clock.now += 2000;
    day.spend(ANNA, SHARE, asked);
    expect(day.capped(ANNA)).toBe(false);
    clock.now = asked;
    expect(day.capped(ANNA)).toBe(true);
  });

  it("keeps a spend of 0 as nothing", () => {
    const { day } = setup();
    day.spend(ANNA, 0);
    expect(day.capped(ANNA)).toBe(false);
  });

  it("purges at most 500 rows of the days gone a call", () => {
    const { db, day } = setup();
    const old = db.prepare("INSERT INTO jarvis_strikes (account, day, count) VALUES (?, '2000-01-01', 1)");
    for (let at = 0; at < 600; at += 1) old.run(`a${String(at)}`);
    day.strike(ANNA);
    expect(db.prepare("SELECT count(*) AS n FROM jarvis_strikes WHERE day = '2000-01-01'").get()).toEqual({ n: 100 });
  });

  it("purges the days gone, a bounded number a call", () => {
    const { db, day, clock } = setup();
    day.spend(ANNA, 1);
    day.strike(ANNA);
    clock.now += 3 * DAY;
    day.spend(BEN, 1);
    day.strike(BEN);
    const rows = (table: string) => db.prepare(`SELECT count(*) AS n FROM ${table}`).get();
    expect([rows("jarvis_spent"), rows("jarvis_strikes")]).toEqual([{ n: 1 }, { n: 1 }]);
  });
});
