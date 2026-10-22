import { createHmac } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { toAddress } from "@gnoworld/schemas";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { openDatabase } from "../db.ts";
import { logger } from "../log.ts";
import { LOGIN_TABLES } from "../login/login.ts";
import type { Rules } from "../roles/roles.ts";
import { accountKey, checkAgain, makeChecker, VERDICT_TABLES } from "./check.ts";
import { answer } from "../testing/answers.ts";
import type { Answer } from "./provider.ts";

const T0 = Date.parse("2026-10-22T12:00:00.000Z");
const HOUR = 60 * 60_000;
const PEPPER = "a-pepper-of-forty-characters-0123456789";
const OLD = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
const RULES: Rules = { bannedWords: ["spam"], linksPerMessage: 3, mentionsPerMessage: 5, linksForNewAccount: 2 };
const said = (text: string, msgid = "m1", account = OLD) => ({ room: "#bubble", account, msgid, text });
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

  it("checks again a message a stopped process left pending, as the next start finds it", async () => {
    const { db, check, asked, rows } = setup(() => new Promise<Answer>(() => undefined));
    const stuck = check(said("hi"));
    await expect.poll(() => rows().map(({ action }) => action)).toEqual(["pending"]);
    expect(asked).toEqual(["hi"]);
    const restarted = makeChecker({
      db,
      rulesOf: () => RULES,
      provider: (text) => {
        asked.push(text);
        return Promise.resolve(answer());
      },
      thresholds: {},
      pepper: PEPPER,
      log: logger(PEPPER, () => true),
    });
    expect(await restarted(said("hi"))).toEqual({ action: "pass" });
    expect(asked).toEqual(["hi", "hi"]);
    expect(await Promise.race([stuck, Promise.resolve("waiting")])).toBe("waiting");
  });

  it("checks again only the message whose hide could not be done, none beside it", async () => {
    const { db, check, rows } = setup(() => Promise.resolve(answer()));
    await check(said("buy spam", "m1"));
    await check(said("buy spam", "m2"));
    checkAgain(db, "m1");
    expect(rows().map(({ msgid, action }) => [msgid, action])).toEqual([
      ["m1", "unchecked"],
      ["m2", "hide"],
    ]);
  });

  it("checks again a hidden message whose hide could not be done, when it comes back", async () => {
    const { db, check, rows } = setup(() => Promise.resolve(answer()));
    expect(await check(said("buy spam"))).toEqual({ action: "hide", reason: "banned_word" });
    checkAgain(db, "m1");
    expect(rows().map(({ action }) => action)).toEqual(["unchecked"]);
    expect(await check(said("buy spam"))).toEqual({ action: "hide", reason: "banned_word" });
    expect(await check(said("buy spam"))).toBe("seen");
  });

  // A line as Ergo stamps it: its server-time, which the rate reads, not the moment it reaches the check.
  const stamped = (n: number, ms: number, account = OLD) => ({
    ...said("hi", `m${String(n)}`, account),
    time: new Date(T0 + ms).toISOString(),
  });

  it("hides an account's 21st line within a minute of Ergo's time as too fast, asking no provider (3k)", async () => {
    const { check, asked } = setup(() => Promise.resolve(answer()));
    for (let n = 0; n < 20; n += 1) expect(await check(stamped(n, n * 1000))).toEqual({ action: "pass" });
    expect(await check(stamped(20, 59_999))).toEqual({ action: "hide", reason: "too_fast" });
    expect(asked).toHaveLength(20);
  });

  it("counts a minute back from the line, the line a minute before it out, a seen line once (3k)", async () => {
    const { check } = setup(() => Promise.resolve(answer()));
    for (let n = 0; n < 20; n += 1) await check(stamped(n, n * 1000));
    expect(await check(stamped(0, 0))).toBe("seen");
    expect(await check(stamped(20, 60_000))).toEqual({ action: "pass" });
  });

  it("never finds a backlog spread over ten minutes too fast, however fast it arrives (3k)", async () => {
    const { check } = setup(() => Promise.resolve(answer()));
    const verdicts = await Promise.all(Array.from({ length: 25 }, (_, n) => check(stamped(n, n * 24_000))));
    expect(verdicts.filter((verdict) => verdict !== "seen" && verdict.action === "hide")).toEqual([]);
  });

  it("counts each account's rate apart (3k)", async () => {
    const OTHER = toAddress(new Uint8Array(20).fill(9));
    const { check } = setup(() => Promise.resolve(answer()));
    for (let n = 0; n < 20; n += 1) await check(stamped(n, n));
    expect(await check(stamped(20, 20, OTHER))).toEqual({ action: "pass" });
  });

  it("hides an edit of another's line, and checks an edit of one's own as any line (3k)", async () => {
    const OTHER = toAddress(new Uint8Array(20).fill(7));
    const { db, check, asked } = setup(() => Promise.resolve(answer()));
    db.prepare("INSERT INTO accounts (address, first_seen) VALUES (?, ?)").run(OTHER, T0 - 30 * 24 * HOUR);
    expect(await check(said("hello", "m1"))).toEqual({ action: "pass" });
    expect(await check({ ...said("hello, fixed", "m2", OTHER), edits: "m1" })).toEqual({
      action: "hide",
      reason: "not_their_edit",
    });
    expect(await check({ ...said("hello, fixed", "m3"), edits: "m1" })).toEqual({ action: "pass" });
    expect(await check({ ...said("an edit of nothing", "m4"), edits: "m9" })).toEqual({
      action: "hide",
      reason: "not_their_edit",
    });
    expect(asked).toEqual(["hello", "hello, fixed"]);
  });

  it("checks an own edit by the rules and the provider like any line: an edit evades nothing (3k)", async () => {
    const { check } = setup((text) => Promise.resolve(text.includes("hit") ? answer({ violence: true }) : answer()));
    await check(said("hello", "m1"));
    expect(await check({ ...said("buy spam", "m2"), edits: "m1" })).toEqual({ action: "hide", reason: "banned_word" });
    expect(await check({ ...said("I hit you", "m3"), edits: "m1" })).toEqual({ action: "hide", reason: "violence" });
  });

  it("keys an account with the pepper, never in clear (3k)", () => {
    expect(accountKey(PEPPER, OLD)).toBe(createHmac("sha256", PEPPER).update(OLD).digest("hex"));
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

  it("raises the alert once when the probes after a pause fail together, four at once", async () => {
    const { clock, check, asked, lines } = setup(() => Promise.resolve("unchecked"));
    for (let n = 0; n < 5; n += 1) await check(said("x", `a${String(n)}`));
    clock.now += 30_000;
    await Promise.all([1, 2, 3, 4].map((n) => check(said("x", `b${String(n)}`))));
    expect(asked).toHaveLength(9);
    expect(
      lines.filter((line) => line.includes('"event":"alert"') && line.includes('"moderation_breaker"')),
    ).toHaveLength(2);
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
