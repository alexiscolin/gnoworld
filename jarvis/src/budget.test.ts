import { mkdtempSync, rmSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import fc from "fast-check";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { openDatabase } from "@gnoworld/service/db";
import { makeBudget, type Budget, type Kind } from "./budget.ts";
import { jarvisMigrations } from "./migrations.ts";

const T0 = Date.parse("2026-11-04T12:00:00.000Z");
const MIDNIGHT = Date.parse("2026-11-05T00:00:00.000Z");
// The day's caps in nano-dollars, $45 and $5 (D47), and a hold's life.
const CAP = 45_000_000_000;
const PERCENT = CAP / 100;
const TRANSLATE_CAP = 5_000_000_000;
const HOLD = 10 * 60_000;

const dir = mkdtempSync(join(tmpdir(), "gnoworld-jarvis-budget-"));
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});
const opened: DatabaseSync[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) if (db.isOpen) db.close();
  vi.unstubAllEnvs();
});

const setup = (path = ":memory:", at = T0) => {
  const db = openDatabase(path, jarvisMigrations);
  opened.push(db);
  const clock = { now: at };
  const budget = makeBudget(db, {
    caps: { ask: CAP, translate: TRANSLATE_CAP },
    holdMs: HOLD,
    now: () => clock.now,
  });
  return { db, clock, budget };
};

// A call that cost what it reserved.
const spend = (budget: Budget, kind: Kind, amount: number): void => {
  const held = budget.reserve(kind, amount);
  if (!held.ok) throw new Error("the budget refused a call the test meant to spend");
  budget.settle(held.hold, amount);
};

describe("the budget", () => {
  it("reserves a call's worst cost, then settles its real one: the day reads spent, reserved and cap", () => {
    const { budget } = setup();
    expect(budget.state("ask")).toEqual({ spent: 0, reserved: 0, cap: CAP });
    const held = budget.reserve("ask", 3_000_000);
    expect(held).toMatchObject({ ok: true, alerts: [] });
    expect(budget.state("ask")).toEqual({ spent: 0, reserved: 3_000_000, cap: CAP });
    if (!held.ok) throw new Error("refused");
    expect(budget.settle(held.hold, 1_200_000)).toEqual({ status: "settled", charged: 1_200_000 });
    expect(budget.state("ask")).toEqual({ spent: 1_200_000, reserved: 0, cap: CAP });
  });

  it("keeps each kind's day apart, each with its own cap", () => {
    const { budget } = setup();
    spend(budget, "ask", 40 * PERCENT);
    expect(budget.state("translate")).toEqual({ spent: 0, reserved: 0, cap: TRANSLATE_CAP });
    expect(budget.reserve("translate", TRANSLATE_CAP)).toMatchObject({ ok: true });
    expect(budget.reserve("translate", 1)).toEqual({ ok: false, reason: "spent", alerts: [] });
    expect(budget.reserve("ask", PERCENT)).toMatchObject({ ok: true });
  });

  // node:sqlite answers at once and openDatabase holds the file alone, so calls at once are reservations one after
  // another with no settle between; the cap's check and its add are one statement by construction (red pass F10).
  it("lets through, from 99% of the cap, only the reservations that fit with every hold before them, in any order", () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 1, max: PERCENT / 2 }), { minLength: 1, maxLength: 24 }), (worsts) => {
        const { budget } = setup();
        spend(budget, "ask", 99 * PERCENT);
        let committed = 99 * PERCENT;
        for (const worst of worsts) {
          const fits = committed + worst <= CAP;
          expect(budget.reserve("ask", worst).ok).toBe(fits);
          if (fits) committed += worst;
        }
        const { spent, reserved } = budget.state("ask");
        expect([spent, reserved]).toEqual([99 * PERCENT, committed - 99 * PERCENT]);
        expect(spent + reserved).toBeLessThanOrEqual(CAP);
      }),
    );
  });

  it("holds the cap for questions running at once, each awaiting its model between reserve and settle", async () => {
    const { budget } = setup();
    spend(budget, "ask", 99 * PERCENT);
    const ask = async (wait: number): Promise<string> => {
      const held = budget.reserve("ask", (3 * PERCENT) / 10);
      if (!held.ok) return held.reason;
      await new Promise((resolve) => setTimeout(resolve, wait));
      budget.settle(held.hold, PERCENT / 10);
      return "answered";
    };
    const answers = await Promise.all([5, 1, 4, 2, 3, 0, 6, 2, 1, 3].map(ask));
    expect(answers.filter((answer) => answer === "answered")).toHaveLength(3);
    expect(answers.filter((answer) => answer === "spent")).toHaveLength(7);
    expect(budget.state("ask")).toEqual({ spent: 99 * PERCENT + (3 * PERCENT) / 10, reserved: 0, cap: CAP });
  });

  it("answers spent at 100% of the cap, even for the cheapest call", () => {
    const { budget } = setup();
    spend(budget, "ask", CAP);
    expect(budget.reserve("ask", 1)).toMatchObject({ ok: false, reason: "spent" });
    expect(budget.state("ask")).toEqual({ spent: CAP, reserved: 0, cap: CAP });
  });

  it("refuses a reservation past the cap even with nothing spent, the largest count included", () => {
    const { budget } = setup();
    expect(budget.reserve("ask", CAP + 1)).toMatchObject({ ok: false, reason: "spent" });
    expect(budget.reserve("ask", Number.MAX_SAFE_INTEGER)).toMatchObject({ ok: false, reason: "spent" });
    expect(budget.reserve("ask", CAP)).toMatchObject({ ok: true });
  });

  it("reopens at 00:00:00.000 UTC, not a millisecond before", () => {
    const { budget, clock } = setup();
    spend(budget, "ask", CAP);
    clock.now = MIDNIGHT - 1;
    expect(budget.reserve("ask", 1)).toMatchObject({ ok: false, reason: "spent" });
    clock.now = MIDNIGHT;
    expect(budget.state("ask")).toEqual({ spent: 0, reserved: 0, cap: CAP });
    expect(budget.reserve("ask", CAP)).toMatchObject({ ok: true });
  });

  it.each(["Pacific/Kiritimati", "America/Adak"])("counts the day in UTC with the machine in %s", (zone) => {
    vi.stubEnv("TZ", zone);
    // 23:30 UTC on the 4th, written at UTC+2, is the 5th in Kiritimati (UTC+14): the zone took hold.
    const late = Date.parse("2026-11-05T01:30:00+02:00");
    if (zone === "Pacific/Kiritimati") expect([new Date(late).getDate(), new Date(late).getUTCDate()]).toEqual([5, 4]);
    const { budget, clock } = setup(":memory:", late);
    spend(budget, "ask", CAP);
    clock.now = Date.parse("2026-11-04T00:00:00.000Z");
    expect(budget.state("ask").spent).toBe(CAP);
    // 20:00 at UTC-5 on the 4th is 01:00 UTC on the 5th: a new day.
    clock.now = Date.parse("2026-11-04T20:00:00-05:00");
    expect(budget.reserve("ask", 1)).toMatchObject({ ok: true });
  });

  it("settles a hold made before midnight into its own day", () => {
    const { budget, clock } = setup(":memory:", MIDNIGHT - 1);
    const held = budget.reserve("ask", 2_000);
    clock.now = MIDNIGHT + 1_000;
    if (!held.ok) throw new Error("refused");
    expect(budget.settle(held.hold, 1_500)).toEqual({ status: "settled", charged: 1_500 });
    expect(budget.state("ask")).toEqual({ spent: 0, reserved: 0, cap: CAP });
    clock.now = MIDNIGHT - 1;
    expect(budget.state("ask")).toEqual({ spent: 1_500, reserved: 0, cap: CAP });
  });

  it("alerts at 80% once a day and kind, from the reservation that reaches it", () => {
    const { budget, clock } = setup();
    expect(budget.reserve("ask", 80 * PERCENT - 1).alerts).toEqual([]);
    expect(budget.reserve("ask", 1).alerts).toEqual([80]);
    expect(budget.reserve("ask", PERCENT).alerts).toEqual([]);
    expect(budget.reserve("translate", (TRANSLATE_CAP / 100) * 85).alerts).toEqual([80]);
    clock.now = MIDNIGHT;
    expect(budget.reserve("ask", 80 * PERCENT).alerts).toEqual([80]);
  });

  it("alerts at 100% once a day and kind, from the reservation that reaches the cap or the first refused", () => {
    const { budget, clock } = setup();
    expect(budget.reserve("ask", CAP).alerts).toEqual([80, 100]);
    expect(budget.reserve("ask", 1)).toEqual({ ok: false, reason: "spent", alerts: [] });
    clock.now = MIDNIGHT;
    expect(budget.reserve("ask", 85 * PERCENT).alerts).toEqual([80]);
    expect(budget.reserve("ask", 20 * PERCENT)).toEqual({ ok: false, reason: "spent", alerts: [100] });
    expect(budget.reserve("ask", 20 * PERCENT).alerts).toEqual([]);
    expect(budget.reserve("ask", 15 * PERCENT)).toMatchObject({ ok: true, alerts: [] });
  });

  it("alerts both on a first refusal that passes both", () => {
    const { budget } = setup();
    spend(budget, "ask", 50 * PERCENT);
    expect(budget.reserve("ask", 60 * PERCENT)).toEqual({ ok: false, reason: "spent", alerts: [80, 100] });
    expect(budget.reserve("ask", 31 * PERCENT).alerts).toEqual([]);
  });

  it("charges a real cost above the worst as it is, and says so: the bound was wrong, and the money spent", () => {
    const { budget } = setup();
    const held = budget.reserve("ask", 1_000);
    if (!held.ok) throw new Error("refused");
    expect(budget.settle(held.hold, 1_001)).toEqual({ status: "over", charged: 1_001 });
    expect(budget.state("ask")).toEqual({ spent: 1_001, reserved: 0, cap: CAP });
  });

  it("stops the day once a cost above its worst has passed the cap", () => {
    const { budget } = setup();
    const held = budget.reserve("ask", CAP);
    if (!held.ok) throw new Error("refused");
    expect(budget.settle(held.hold, CAP + 5)).toEqual({ status: "over", charged: CAP + 5 });
    expect(budget.reserve("ask", 1)).toMatchObject({ ok: false, reason: "spent" });
    expect(budget.state("ask")).toEqual({ spent: CAP + 5, reserved: 0, cap: CAP });
  });

  it.each([
    ["none", undefined],
    ["below 0", -1],
    ["a fraction", 0.5],
    ["not a number", Number.NaN],
    ["infinite", Number.POSITIVE_INFINITY],
  ])("charges the worst for a real cost of %s, and says the call went unpriced", (_, real) => {
    const { budget } = setup();
    const held = budget.reserve("ask", 1_000);
    if (!held.ok) throw new Error("refused");
    expect(budget.settle(held.hold, real)).toEqual({ status: "unpriced", charged: 1_000 });
    expect(budget.state("ask")).toEqual({ spent: 1_000, reserved: 0, cap: CAP });
  });

  it("settles a translation into the translations' day, never the questions' (red pass F3)", () => {
    const { budget, clock } = setup();
    const [settled, lost] = [budget.reserve("translate", 900), budget.reserve("translate", 2_000)];
    if (!settled.ok || !lost.ok) throw new Error("refused");
    expect(budget.settle(settled.hold, 300)).toEqual({ status: "settled", charged: 300 });
    clock.now = T0 + HOLD;
    expect(budget.state("translate")).toEqual({ spent: 2_300, reserved: 0, cap: TRANSLATE_CAP });
    expect(budget.state("ask")).toEqual({ spent: 0, reserved: 0, cap: CAP });
  });

  it("settles a real cost of 0 and of exactly the worst", () => {
    const { budget } = setup();
    const [free, full] = [budget.reserve("ask", 1_000), budget.reserve("ask", 1_000)];
    if (!free.ok || !full.ok) throw new Error("refused");
    expect(budget.settle(free.hold, 0)).toEqual({ status: "settled", charged: 0 });
    expect(budget.settle(full.hold, 1_000)).toEqual({ status: "settled", charged: 1_000 });
    expect(budget.state("ask")).toEqual({ spent: 1_000, reserved: 0, cap: CAP });
  });

  it("settles a hold once: a second settle changes nothing", () => {
    const { budget } = setup();
    const held = budget.reserve("ask", 1_000);
    if (!held.ok) throw new Error("refused");
    budget.settle(held.hold, 400);
    expect(budget.settle(held.hold, 900)).toEqual({ status: "gone" });
    expect(budget.state("ask")).toEqual({ spent: 400, reserved: 0, cap: CAP });
  });

  it("gives a new hold no id a released one had: the late call's settle answers gone, the new one's counts (F5176)", () => {
    const { budget, clock } = setup();
    const late = budget.reserve("ask", 2_000);
    if (!late.ok) throw new Error("refused");
    clock.now = T0 + HOLD;
    const next = budget.reserve("ask", 3_000);
    if (!next.ok) throw new Error("refused");
    expect(budget.settle(late.hold, 10)).toEqual({ status: "gone" });
    expect(budget.settle(next.hold, 1_000)).toEqual({ status: "settled", charged: 1_000 });
    expect(budget.state("ask")).toEqual({ spent: 3_000, reserved: 0, cap: CAP });
  });

  it("gives a new hold no id a settled one had: a second settle after it answers gone (F5176)", () => {
    const { budget } = setup();
    const first = budget.reserve("ask", 2_000);
    if (!first.ok) throw new Error("refused");
    budget.settle(first.hold, 500);
    const second = budget.reserve("ask", 3_000);
    if (!second.ok) throw new Error("refused");
    expect(budget.settle(first.hold, 900)).toEqual({ status: "gone" });
    expect(budget.settle(second.hold, 700)).toEqual({ status: "settled", charged: 700 });
    expect(budget.state("ask")).toEqual({ spent: 1_200, reserved: 0, cap: CAP });
  });

  it("settles no hold it never made", () => {
    const { budget } = setup();
    expect(budget.settle({ id: 999 }, 10)).toEqual({ status: "gone" });
    expect(budget.state("ask")).toEqual({ spent: 0, reserved: 0, cap: CAP });
  });

  it("refuses to settle a hold at its deadline, with no read before it, and spends its worst (red pass F2)", () => {
    const { budget, clock } = setup();
    const held = budget.reserve("ask", 3_000);
    if (!held.ok) throw new Error("refused");
    clock.now = T0 + HOLD;
    expect(budget.settle(held.hold, 10)).toEqual({ status: "gone" });
    expect(budget.state("ask")).toEqual({ spent: 3_000, reserved: 0, cap: CAP });
  });

  it("releases a hold never settled at its deadline, into the day's spent at its worst: the call may have run", () => {
    const { budget, clock } = setup();
    const [kept, lost] = [budget.reserve("ask", 1_000), budget.reserve("ask", 3_000)];
    if (!kept.ok || !lost.ok) throw new Error("refused");
    clock.now = T0 + HOLD - 1;
    expect(budget.state("ask")).toEqual({ spent: 0, reserved: 4_000, cap: CAP });
    expect(budget.settle(kept.hold, 700)).toEqual({ status: "settled", charged: 700 });
    clock.now = T0 + HOLD;
    expect(budget.state("ask")).toEqual({ spent: 3_700, reserved: 0, cap: CAP });
    expect(budget.settle(lost.hold, 10)).toEqual({ status: "gone" });
    expect(budget.state("ask")).toEqual({ spent: 3_700, reserved: 0, cap: CAP });
  });

  it("releases the holds past their deadline at the next reservation, so their table holds live calls only", () => {
    const { db, budget, clock } = setup();
    for (let call = 0; call < 5; call += 1) budget.reserve("ask", 1_000);
    clock.now = T0 + HOLD;
    expect(budget.reserve("ask", 1_000)).toMatchObject({ ok: true });
    expect(db.prepare("SELECT COUNT(*) AS holds FROM budget_holds").get()).toEqual({ holds: 1 });
  });

  it("undoes a step that failed and keeps its error, whatever ended the transaction", () => {
    const { db } = setup();
    let fault: "none" | "throws" | "ends" = "none";
    const now = (): number => {
      // As SQLite ends a transaction itself on some faults (a full disk, an I/O error).
      if (fault === "ends") db.exec("ROLLBACK");
      if (fault !== "none") throw new Error("the clock failed");
      return T0;
    };
    const budget = makeBudget(db, { caps: { ask: CAP, translate: TRANSLATE_CAP }, holdMs: HOLD, now });
    const held = budget.reserve("ask", 1_000);
    if (!held.ok) throw new Error("refused");
    fault = "throws";
    expect(() => budget.settle(held.hold, 500)).toThrow("the clock failed");
    fault = "ends";
    expect(() => budget.settle(held.hold, 500)).toThrow("the clock failed");
    fault = "none";
    expect(budget.settle(held.hold, 500)).toEqual({ status: "settled", charged: 500 });
    expect(budget.state("ask")).toEqual({ spent: 500, reserved: 0, cap: CAP });
  });

  it("counts a hold past its deadline against the cap before any read releases it", () => {
    const { budget, clock } = setup();
    expect(budget.reserve("ask", 60 * PERCENT)).toMatchObject({ ok: true });
    clock.now = T0 + HOLD;
    expect(budget.reserve("ask", 50 * PERCENT)).toMatchObject({ ok: false, reason: "spent" });
    expect(budget.state("ask")).toEqual({ spent: 60 * PERCENT, reserved: 0, cap: CAP });
  });

  it("writes each commit to the disk before it answers, so a power cut loses no settle (F5180)", () => {
    const { db } = setup(join(dir, "durable.db"));
    expect(db.prepare("PRAGMA synchronous").get()).toEqual({ synchronous: 2 });
  });

  it("keeps the day's sums across a restart, a crashed process's holds included (D45)", () => {
    const path = join(dir, "restart.db");
    const first = setup(path);
    spend(first.budget, "ask", 70 * PERCENT);
    expect(first.budget.reserve("ask", 25 * PERCENT)).toMatchObject({ ok: true });
    // The process dies with its hold unsettled.
    first.db.close();
    const second = setup(path);
    expect(second.budget.state("ask")).toEqual({ spent: 70 * PERCENT, reserved: 25 * PERCENT, cap: CAP });
    // 95% reached before the crash said 80 then: the restart says only what is new (red pass F4).
    expect(second.budget.reserve("ask", 6 * PERCENT)).toEqual({ ok: false, reason: "spent", alerts: [100] });
    second.clock.now = T0 + HOLD;
    expect(second.budget.state("ask")).toEqual({ spent: 95 * PERCENT, reserved: 0, cap: CAP });
  });

  it.each([
    ["0", 0],
    ["below 0", -1],
    ["a fraction", 1.5],
    ["not a number", Number.NaN],
    ["infinite", Number.POSITIVE_INFINITY],
    ["past the safe integers", 1e300],
  ])("refuses a worst cost of %s, a bug in its caller, and holds nothing", (_, worst) => {
    const { budget } = setup();
    expect(() => budget.reserve("ask", worst)).toThrow(new RangeError("a worst cost is a count, from 1"));
    expect(budget.state("ask")).toEqual({ spent: 0, reserved: 0, cap: CAP });
  });
});

// The caps live in jarvis's file (Alexis, "simplement modifiable par admin"): the settings give the first values, once,
// as D95 seeds the door's quotas; an admin's change counts at once, against the day already spent.
describe("the budget's caps, kept in jarvis's file", () => {
  it("seeds each cap once, from the first start's values: a later start's are not read", () => {
    const path = join(dir, "seeded.db");
    const first = setup(path);
    expect(first.budget.caps()).toEqual({ ask: CAP, translate: TRANSLATE_CAP });
    first.db.close();
    const db = openDatabase(path, jarvisMigrations);
    opened.push(db);
    const later = makeBudget(db, { caps: { ask: 3 * PERCENT, translate: 7 }, holdMs: HOLD, now: () => T0 });
    expect(later.caps()).toEqual({ ask: CAP, translate: TRANSLATE_CAP });
    expect(later.state("ask")).toEqual({ spent: 0, reserved: 0, cap: CAP });
  });

  it("counts a cap raised at once, against the day already spent, with no new budget made", () => {
    const { budget } = setup();
    spend(budget, "ask", CAP);
    expect(budget.reserve("ask", 1)).toMatchObject({ ok: false, reason: "spent" });
    budget.change("ask", 2 * CAP);
    expect(budget.caps()).toEqual({ ask: 2 * CAP, translate: TRANSLATE_CAP });
    expect(budget.state("ask")).toEqual({ spent: CAP, reserved: 0, cap: 2 * CAP });
    expect(budget.reserve("ask", CAP)).toMatchObject({ ok: true });
    expect(budget.reserve("ask", 1)).toMatchObject({ ok: false, reason: "spent" });
  });

  it("counts a cap lowered at once: what was spent is kept, and nothing more passes", () => {
    const { budget } = setup();
    spend(budget, "ask", 50 * PERCENT);
    budget.change("ask", 40 * PERCENT);
    expect(budget.state("ask")).toEqual({ spent: 50 * PERCENT, reserved: 0, cap: 40 * PERCENT });
    expect(budget.reserve("ask", 1)).toEqual({ ok: false, reason: "spent", alerts: [80, 100] });
  });

  it("changes one kind's cap alone, and keeps it across a restart", () => {
    const path = join(dir, "changed.db");
    const first = setup(path);
    first.budget.change("translate", 9 * PERCENT);
    expect(first.budget.caps()).toEqual({ ask: CAP, translate: 9 * PERCENT });
    first.db.close();
    expect(setup(path).budget.caps()).toEqual({ ask: CAP, translate: 9 * PERCENT });
  });

  it("alerts against the cap it reads at that reservation", () => {
    const { budget } = setup();
    spend(budget, "ask", 50 * PERCENT);
    budget.change("ask", 60 * PERCENT);
    expect(budget.reserve("ask", PERCENT)).toMatchObject({ ok: true, alerts: [80] });
  });

  it.each([
    ["0", 0],
    ["below 0", -1],
    ["a fraction", 1.5],
    ["not a number", Number.NaN],
    ["past the safe integers", 1e300],
  ])("refuses a cap of %s, a bug in its caller, and keeps the cap it had", (_, cap) => {
    const { budget } = setup();
    expect(() => {
      budget.change("ask", cap);
    }).toThrow(new RangeError("a cap is a count, from 1"));
    expect(budget.caps()).toEqual({ ask: CAP, translate: TRANSLATE_CAP });
  });

  it.each([
    ["the questions'", { ask: 0, translate: TRANSLATE_CAP }],
    ["the translations'", { ask: CAP, translate: 0 }],
    ["a fraction for", { ask: CAP, translate: 0.5 }],
  ])("refuses %s first cap that is no count, before it writes anything", (_case, caps) => {
    const db = openDatabase(":memory:", jarvisMigrations);
    opened.push(db);
    expect(() => makeBudget(db, { caps, holdMs: HOLD, now: () => T0 })).toThrow(
      new RangeError("a cap is a count, from 1"),
    );
    expect(db.prepare("SELECT COUNT(*) AS caps FROM budget_caps").get()).toEqual({ caps: 0 });
  });

  it("keeps a day spent in a file of the first migration alone, its caps added by the next", () => {
    const path = join(dir, "first-migration.db");
    const [first] = jarvisMigrations;
    const old = openDatabase(path, first === undefined ? [] : [first]);
    old.prepare("INSERT INTO budget_days (kind, day, spent) VALUES ('ask', '2026-11-04', 7)").run();
    old.close();
    const { budget } = setup(path);
    expect(budget.state("ask")).toEqual({ spent: 7, reserved: 0, cap: CAP });
    expect(budget.caps()).toEqual({ ask: CAP, translate: TRANSLATE_CAP });
  });

  it("holds the caps in a STRICT table whose every cap is a count, whatever writes it", () => {
    const { db } = setup();
    expect(() => db.prepare("UPDATE budget_caps SET cap = 0 WHERE kind = 'ask'").run()).toThrow(/CHECK/);
    expect(() => db.prepare("INSERT INTO budget_caps (kind, cap) VALUES ('other', 1)").run()).toThrow(/CHECK/);
  });
});
