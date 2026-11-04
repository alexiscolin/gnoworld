import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { Address, toAddress } from "@gnoworld/schemas";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { openDatabase } from "@gnoworld/service/db";
import { makeQuota, QUOTA_TABLES } from "./quota.ts";

// 10g: D43's quota per account and UTC day, its allowlist, and both kept in the server's database (D47, D95).
const T0 = Date.parse("2026-11-04T12:00:00.000Z");
const ANNA = Address.parse("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5");
const BEN = Address.parse("g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv");
const CAT = Address.parse("g1zgldsmn6ck6w4p325xd3j8y779ky6fpjnz3uh9");
const FIRST = { quota: 20, quotaUnnamed: 5, unlimited: [CAT] };

const opened: DatabaseSync[] = [];
const folders: string[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) db.close();
  for (const dir of folders.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const open = (path = ":memory:") => {
  const db = openDatabase(path, [QUOTA_TABLES]);
  opened.push(db);
  return db;
};
const setup = (first = FIRST) => {
  const db = open();
  const clock = { now: T0 };
  return { db, clock, quota: makeQuota(db, { first, now: () => clock.now }) };
};
const takes = (take: () => boolean, times: number): boolean[] => Array.from({ length: times }, take);
const Count = z.object({ count: z.number() });
const countOf = (db: DatabaseSync, account: string, day: string): number | undefined => {
  const row = db.prepare("SELECT count FROM jarvis_asked WHERE account = ? AND day = ?").get(account, day);
  return row === undefined ? undefined : Count.parse(row).count;
};

describe("the quota", () => {
  it("lets an account with a mainnet name ask 20 questions a UTC day, and refuses the 21st", () => {
    const { quota } = setup();
    const answers = takes(() => quota.take(ANNA, true), 21);
    expect(answers.slice(0, 20).every(Boolean)).toBe(true);
    expect(answers[20]).toBe(false);
  });

  it("lets an account with no mainnet name ask 5", () => {
    const { quota } = setup();
    expect(takes(() => quota.take(BEN, false), 6)).toEqual([true, true, true, true, true, false]);
  });

  it("counts each account apart", () => {
    const { quota } = setup();
    takes(() => quota.take(BEN, false), 5);
    expect([quota.take(BEN, false), quota.take(ANNA, false)]).toEqual([false, true]);
  });

  it("counts an account named after some questions by the quota of its kind at each one", () => {
    const { quota } = setup();
    takes(() => quota.take(BEN, false), 5);
    expect(quota.take(BEN, false)).toBe(false);
    // Named since: its 7th asked counts against 20, as the refused 6th did not count.
    expect(takes(() => quota.take(BEN, true), 15).every(Boolean)).toBe(true);
    expect(quota.take(BEN, true)).toBe(false);
  });

  it("opens again on the next UTC day, at its very first millisecond", () => {
    const { clock, quota } = setup();
    clock.now = Date.parse("2026-11-04T23:59:59.999Z");
    takes(() => quota.take(BEN, false), 5);
    expect(quota.take(BEN, false)).toBe(false);
    clock.now = Date.parse("2026-11-05T00:00:00.000Z");
    expect(quota.take(BEN, false)).toBe(true);
  });

  it("counts a day's first question at its very first millisecond in that day, not the day before", () => {
    const { db, clock, quota } = setup();
    clock.now = Date.parse("2026-11-05T00:00:00.000Z");
    quota.take(BEN, false);
    expect([countOf(db, BEN, "2026-11-05"), countOf(db, BEN, "2026-11-04")]).toEqual([1, undefined]);
  });

  it("counts an account on the allowlist but never refuses it", () => {
    const { db, quota } = setup();
    expect(takes(() => quota.take(CAT, false), 50).every(Boolean)).toBe(true);
    expect(countOf(db, CAT, "2026-11-04")).toBe(50);
  });
});

describe("the quota's settings", () => {
  it("take the environment's values at the first start, the allowlist included", () => {
    const { quota } = setup();
    expect(quota.values()).toEqual({ quota: 20, quotaUnnamed: 5, unlimited: [CAT] });
  });

  it("keep the database's values at a later start, whatever the environment says then", () => {
    const dir = mkdtempSync(join(tmpdir(), "gnoworld-quota-"));
    folders.push(dir);
    const file = join(dir, "server.db");
    const first = open(file);
    const quota = makeQuota(first, { first: FIRST, now: () => T0 });
    quota.change({ setting: "quota", questions: 30 });
    first.close();
    opened.splice(opened.indexOf(first), 1);
    const later = makeQuota(open(file), { first: { quota: 7, quotaUnnamed: 2, unlimited: [ANNA] }, now: () => T0 });
    expect(later.values()).toEqual({ quota: 30, quotaUnnamed: 5, unlimited: [CAT] });
  });

  it("keep an allowlist emptied by an admin empty, and an unnamed quota set to its first value, at a later start", () => {
    const dir = mkdtempSync(join(tmpdir(), "gnoworld-quota-"));
    folders.push(dir);
    const file = join(dir, "server.db");
    const first = open(file);
    const quota = makeQuota(first, { first: FIRST, now: () => T0 });
    quota.change({ setting: "unlimited", account: CAT, unlimited: false });
    quota.change({ setting: "quota_unnamed", questions: 9 });
    quota.change({ setting: "quota_unnamed", questions: 5 });
    first.close();
    opened.splice(opened.indexOf(first), 1);
    const later = makeQuota(open(file), { first: { quota: 7, quotaUnnamed: 2, unlimited: [ANNA] }, now: () => T0 });
    expect(later.values()).toEqual({ quota: 20, quotaUnnamed: 5, unlimited: [] });
  });

  it("change the quota at once: the next question counts against the new one, with no restart", () => {
    const { quota } = setup();
    takes(() => quota.take(ANNA, true), 20);
    expect(quota.take(ANNA, true)).toBe(false);
    expect(quota.change({ setting: "quota", questions: 22 })).toBe("changed");
    expect(takes(() => quota.take(ANNA, true), 3)).toEqual([true, true, false]);
    expect(quota.values().quota).toBe(22);
  });

  it("change the unnamed quota at once, and lower it below what was asked", () => {
    const { quota } = setup();
    takes(() => quota.take(BEN, false), 3);
    quota.change({ setting: "quota_unnamed", questions: 2 });
    expect(quota.take(BEN, false)).toBe(false);
    expect(quota.values().quotaUnnamed).toBe(2);
  });

  it("give an account no quota at once, then its quota again", () => {
    const { quota } = setup();
    takes(() => quota.take(BEN, false), 5);
    expect(quota.change({ setting: "unlimited", account: BEN, unlimited: true })).toBe("changed");
    expect(quota.take(BEN, false)).toBe(true);
    expect(quota.values().unlimited).toEqual([CAT, BEN].toSorted());
    quota.change({ setting: "unlimited", account: BEN, unlimited: false });
    expect(quota.take(BEN, false)).toBe(false);
    expect(quota.values().unlimited).toEqual([CAT]);
  });

  it("take an account added twice once, and an account not listed off with no error", () => {
    const { quota } = setup();
    quota.change({ setting: "unlimited", account: CAT, unlimited: true });
    expect(quota.change({ setting: "unlimited", account: ANNA, unlimited: false })).toBe("changed");
    expect(quota.values().unlimited).toEqual([CAT]);
  });

  it("hold 1,000 accounts with no quota at most, and still take one off when full", () => {
    const { db, quota } = setup({ ...FIRST, unlimited: [] });
    const add = db.prepare("INSERT INTO jarvis_unlimited (address, added_at) VALUES (?, ?)");
    for (let at = 0; at < 999; at += 1) add.run(toAddress(Buffer.from(String(at).padStart(20, "0"))), T0);
    expect(quota.change({ setting: "unlimited", account: ANNA, unlimited: true })).toBe("changed");
    expect(quota.change({ setting: "unlimited", account: BEN, unlimited: true })).toBe("full");
    expect(quota.change({ setting: "unlimited", account: ANNA, unlimited: true })).toBe("changed");
    expect(quota.change({ setting: "unlimited", account: ANNA, unlimited: false })).toBe("changed");
    expect(quota.values().unlimited).toHaveLength(999);
  });
});

describe("the quota's counts", () => {
  it("leave once their day is past, 500 rows a question at most", () => {
    const { db, clock, quota } = setup();
    const add = db.prepare("INSERT INTO jarvis_asked (account, day, count) VALUES (?, ?, 1)");
    for (let at = 0; at < 700; at += 1) add.run(`g1old${String(at)}`, "2026-11-03");
    add.run("g1today", "2026-11-04");
    const left = () => db.prepare("SELECT count(*) AS count FROM jarvis_asked WHERE day < '2026-11-04'").get();
    quota.take(ANNA, true);
    expect(Count.parse(left()).count).toBe(200);
    clock.now += 1;
    quota.take(ANNA, true);
    expect(Count.parse(left()).count).toBe(0);
    expect(countOf(db, "g1today", "2026-11-04")).toBe(1);
  });
});

describe("a question given back (the second round's T1)", () => {
  it("takes one off the account's count of the day, never below none", () => {
    const db = openDatabase(":memory:", [QUOTA_TABLES]);
    try {
      const clock = { now: Date.parse("2026-11-04T12:00:00.000Z") };
      const anna = Address.parse("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5");
      const quota = makeQuota(db, { first: { quota: 1, quotaUnnamed: 1, unlimited: [] }, now: () => clock.now });
      expect(quota.take(anna, true)).toBe(true);
      expect(quota.take(anna, true)).toBe(false);
      quota.giveBack(anna);
      expect(quota.take(anna, true)).toBe(true);
      quota.giveBack(anna);
      quota.giveBack(anna);
      const rows = db.prepare("SELECT count FROM jarvis_asked").all();
      expect(rows).toEqual([{ count: 0 }]);
    } finally {
      db.close();
    }
  });
});
