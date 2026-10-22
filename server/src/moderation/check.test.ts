import { createHmac } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { toAddress } from "@gnoworld/schemas";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { openDatabase } from "../db.ts";
import { logger } from "../log.ts";
import { LOGIN_TABLES } from "../login/login.ts";
import type { Rules } from "../roles/roles.ts";
import { makeChecker, VERDICT_TABLES } from "./check.ts";
import { CATEGORIES, type Answer, type Category } from "./provider.ts";

const T0 = Date.parse("2026-10-22T12:00:00.000Z");
const HOUR = 60 * 60_000;
const PEPPER = "a-pepper-of-forty-characters-0123456789";
const OLD = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
const RULES: Rules = { bannedWords: ["spam"], linksPerMessage: 3, mentionsPerMessage: 5, linksForNewAccount: 2 };
const said = (text: string, msgid = "m1", account = OLD) => ({ room: "#bubble", account, msgid, text });
const answer = (
  flags: Partial<Record<Category, boolean>> = {},
  scores: Partial<Record<Category, number>> = {},
): Answer => ({
  flagged: Object.fromEntries(CATEGORIES.map((c) => [c, flags[c] ?? false])) as Record<Category, boolean>,
  scores: Object.fromEntries(CATEGORIES.map((c) => [c, scores[c] ?? 0])) as Record<Category, number>,
});
const Row = z.object({
  msgid: z.string(),
  room: z.string(),
  account: z.string(),
  action: z.string(),
  reason: z.string().nullable(),
  flags: z.string().nullable(),
  scores: z.string().nullable(),
  thresholds: z.string().nullable(),
  at: z.number(),
});

const opened: DatabaseSync[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) db.close();
});

const setup = (provider: (text: string) => Promise<Answer | "unchecked">, thresholds = {}) => {
  const db = openDatabase(":memory:", [LOGIN_TABLES, VERDICT_TABLES]);
  opened.push(db);
  db.prepare("INSERT INTO accounts (address, first_seen) VALUES (?, ?)").run(OLD, T0 - 30 * 24 * HOUR);
  const clock = { now: T0 };
  const asked: string[] = [];
  const lines: string[] = [];
  const check = makeChecker({
    db,
    rulesOf: (room) => (room === "#bubble" ? RULES : undefined),
    provider: (text) => {
      asked.push(text);
      return provider(text);
    },
    thresholds,
    pepper: PEPPER,
    log: logger(PEPPER, (line) => lines.push(line)),
    now: () => clock.now,
  });
  const rows = () => z.array(Row).parse(db.prepare("SELECT * FROM verdicts ORDER BY msgid").all());
  return { db, clock, check, asked, rows, lines };
};

describe("checking a message", () => {
  it("hides on a rule and calls no provider", async () => {
    const { check, asked, rows } = setup(() => Promise.resolve(answer()));
    expect(await check(said("buy spam"))).toEqual({ action: "hide", reason: "banned_word" });
    expect(asked).toEqual([]);
    expect(rows()).toEqual([
      expect.objectContaining({ msgid: "m1", action: "hide", reason: "banned_word", scores: null }),
    ]);
  });

  it("asks the provider when no rule hits, and records the verdict, its scores and the thresholds used", async () => {
    const flagged = answer({ violence: true }, { violence: 0.97 });
    const { check, asked, rows, lines } = setup(() => Promise.resolve(flagged), { harassment: 0.9 });
    expect(await check(said("I will hurt you"))).toEqual({ action: "hide", reason: "violence" });
    expect(asked).toEqual(["I will hurt you"]);
    const [row] = rows();
    expect(row).toEqual({
      msgid: "m1",
      room: "#bubble",
      account: createHmac("sha256", PEPPER).update(OLD).digest("hex"),
      action: "hide",
      reason: "violence",
      flags: JSON.stringify(flagged.flagged),
      scores: JSON.stringify(flagged.scores),
      thresholds: JSON.stringify({ harassment: 0.9 }),
      at: T0,
    });
    expect(lines.join("")).not.toMatch(/hurt|g1jg8m/);
  });

  it("records a pass, and an unchecked message as unchecked, the text never", async () => {
    const answers: (Answer | "unchecked")[] = [answer(), "unchecked"];
    const { check, rows, db } = setup(() => Promise.resolve(answers.shift() ?? "unchecked"));
    expect(await check(said("hello there", "m1"))).toEqual({ action: "pass" });
    expect(await check(said("hello again", "m2"))).toEqual({ action: "unchecked" });
    expect(rows().map(({ action }) => action)).toEqual(["pass", "unchecked"]);
    expect(JSON.stringify(db.prepare("SELECT * FROM verdicts").all())).not.toMatch(/hello|g1jg8m/);
  });

  it("checks a message once, the same one arriving twice at once included", async () => {
    let release = (): void => undefined;
    const held = new Promise<Answer>((resolve) => {
      release = () => {
        resolve(answer());
      };
    });
    const { check, asked } = setup(() => held);
    const first = check(said("hi"));
    const second = check(said("hi"));
    release();
    expect(await Promise.all([first, second])).toEqual([{ action: "pass" }, "seen"]);
    expect(asked).toHaveLength(1);
    expect(await check(said("hi"))).toBe("seen");
  });

  it("checks a message once across two checkers on one database, its id the table's key", async () => {
    const { db, check } = setup(() => Promise.resolve(answer()));
    const other = makeChecker({
      db,
      rulesOf: () => RULES,
      provider: () => Promise.resolve(answer()),
      thresholds: {},
      pepper: PEPPER,
      log: logger(PEPPER, () => true),
    });
    expect(await check(said("hi"))).toEqual({ action: "pass" });
    expect(await other(said("hi"))).toBe("seen");
    const columns = z
      .array(z.object({ name: z.string(), pk: z.number() }))
      .parse(db.prepare("PRAGMA table_info(verdicts)").all());
    expect(columns.map(({ name, pk }) => [name, pk])).toEqual([
      ["msgid", 1],
      ["room", 0],
      ["account", 0],
      ["action", 0],
      ["reason", 0],
      ["flags", 0],
      ["scores", 0],
      ["thresholds", 0],
      ["at", 0],
    ]);
  });

  it("records a provider that throws as unchecked, and resolves", async () => {
    const { check, rows } = setup(() => Promise.reject(new Error("boom")));
    expect(await check(said("hi"))).toEqual({ action: "unchecked" });
    expect(rows().map(({ action }) => action)).toEqual(["unchecked"]);
  });

  it("checks an unchecked message again when it comes back, a checked one never", async () => {
    const answers: (Answer | "unchecked")[] = ["unchecked", answer({ violence: true }, { violence: 0.9 })];
    const { check, asked } = setup(() => Promise.resolve(answers.shift() ?? answer()));
    expect(await check(said("hit"))).toEqual({ action: "unchecked" });
    expect(await check(said("hit"))).toEqual({ action: "hide", reason: "violence" });
    expect(await check(said("hit"))).toBe("seen");
    expect(asked).toEqual(["hit", "hit"]);
  });

  it("gives a new account fewer links, 24 hours from its first login, not a minute more", async () => {
    const { db, clock, check } = setup(() => Promise.resolve(answer()));
    const fresh = toAddress(new Uint8Array(20).fill(7));
    db.prepare("INSERT INTO accounts (address, first_seen) VALUES (?, ?)").run(fresh, T0);
    const three = "https://a.test https://b.test https://c.test";
    clock.now = T0 + 24 * HOUR - 1;
    expect(await check(said(three, "m1", fresh))).toEqual({ action: "hide", reason: "new_account_links" });
    clock.now = T0 + 24 * HOUR;
    expect(await check(said(three, "m2", fresh))).toEqual({ action: "pass" });
  });

  it("sends nothing from a room no world of the file names: unchecked, no provider call", async () => {
    const { check, asked, rows } = setup(() => Promise.resolve(answer()));
    expect(await check({ room: "#elsewhere", account: OLD, msgid: "m1", text: "hello" })).toEqual({
      action: "unchecked",
    });
    expect(asked).toEqual([]);
    expect(rows().map(({ action, reason }) => [action, reason])).toEqual([["unchecked", "unknown_room"]]);
  });

  it.each([
    ["too many links", "https://a.test https://b.test https://c.test https://d.test", "links"],
    ["too many mentions", "@a @b @c @d @e @f", "mentions"],
  ])("hides %s by the rules, with no provider call", async (_, text, reason) => {
    const { check, asked } = setup(() => Promise.resolve(answer()));
    expect(await check(said(text))).toEqual({ action: "hide", reason });
    expect(asked).toEqual([]);
  });

  it("counts an account it does not know as new: fewer links, failing closed", async () => {
    const { check } = setup(() => Promise.resolve(answer()));
    const stranger = toAddress(new Uint8Array(20).fill(9));
    expect(await check(said("https://a.test https://b.test https://c.test", "m1", stranger))).toEqual({
      action: "hide",
      reason: "new_account_links",
    });
  });

  it("stops asking a provider that failed five times running, for 30 seconds, and says so with the alert", async () => {
    const { clock, check, asked, lines } = setup(() => Promise.resolve("unchecked"));
    for (let n = 0; n < 5; n += 1) await check(said("x", `a${String(n)}`));
    expect(asked).toHaveLength(5);
    clock.now += 29_999;
    expect(await check(said("x", "b1"))).toEqual({ action: "unchecked" });
    expect(await check(said("buy spam", "b2"))).toEqual({ action: "hide", reason: "banned_word" });
    expect(asked).toHaveLength(5);
    expect(
      lines.filter((line) => line.includes('"event":"alert"') && line.includes('"moderation_breaker"')),
    ).toHaveLength(1);
    clock.now += 1;
    await check(said("x", "b3"));
    expect(asked).toHaveLength(6);
    // A probe that fails after the pause pauses it again at once.
    await check(said("x", "b4"));
    expect(asked).toHaveLength(6);
  });

  it("counts failures running: a success between them starts the count again", async () => {
    const answers: (Answer | "unchecked")[] = ["u", "u", "u", "u", "a", "u", "u", "u", "u"].map((kind) =>
      kind === "u" ? "unchecked" : answer(),
    );
    const { check, asked } = setup(() => Promise.resolve(answers.shift() ?? "unchecked"));
    for (let n = 0; n < 10; n += 1) await check(said("x", `m${String(n)}`));
    expect(asked).toHaveLength(10);
  });
});
