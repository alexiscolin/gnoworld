import { createHmac } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { toAddress } from "@gnoworld/schemas";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { openDatabase } from "@gnoworld/service/db";
import { logger } from "@gnoworld/service/log";
import { LOGIN_TABLES } from "../login/login.ts";
import type { Rules } from "../roles/roles.ts";
import { accountKey, checkAgain, makeChecker, VERDICT_TABLES } from "./check.ts";
import { answer } from "../testing/answers.ts";
import { makeQueue } from "./queue.ts";
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
  vi.useRealTimers();
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

  it("hides a message of several lines the link could not read whole, whatever its text, asking no provider (G5)", async () => {
    const { check, asked, rows } = setup(() => Promise.resolve(answer()));
    expect(await check({ ...said("(not read)", "m1"), unreadable: true })).toEqual({
      action: "hide",
      reason: "unreadable",
    });
    expect(asked).toEqual([]);
    expect(rows()).toEqual([expect.objectContaining({ msgid: "m1", action: "hide", reason: "unreadable" })]);
  });

  it("leaves a message of several lines it could not read in a room no world names unchecked, as any line (G5)", async () => {
    const { check, rows } = setup(() => Promise.resolve(answer()));
    expect(await check({ ...said("(not read)", "m1"), room: "#nowhere", unreadable: true })).toEqual({
      action: "unchecked",
    });
    expect(rows()).toEqual([expect.objectContaining({ action: "unchecked", reason: "unknown_room" })]);
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
    // The second arrives while the first is checked: busy, the first settles it.
    expect(await Promise.all([first, second])).toEqual([{ action: "pass" }, "busy"]);
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
    expect(verdicts.filter((verdict) => typeof verdict !== "string" && verdict.action === "hide")).toEqual([]);
  });

  it("counts each account's rate apart (3k)", async () => {
    const OTHER = toAddress(new Uint8Array(20).fill(9));
    const { check } = setup(() => Promise.resolve(answer()));
    for (let n = 0; n < 20; n += 1) await check(stamped(n, n));
    expect(await check(stamped(20, 20, OTHER))).toEqual({ action: "pass" });
  });

  // A second rate rule (docs/decisions.md f0c19ce, F1123): 100 lines a minute an account, a message of several lines
  // counting each of its lines, beside the 20 messages; counted in memory, so a restart forgets it.
  const lines = (count: number, { n, ms }: { n: number; ms: number }, account = OLD) => {
    const text = Array.from({ length: count }, (_, at) => `line ${String(at)}`).join("\n");
    return { ...said(text, `m${String(n)}`, account), time: new Date(T0 + ms).toISOString() };
  };

  it("hides a message that takes an account past 100 lines in a minute as too fast, each line of it counted (G4)", async () => {
    const { check, asked } = setup(() => Promise.resolve(answer()));
    expect(await check(lines(40, { n: 0, ms: 0 }))).toEqual({ action: "pass" });
    expect(await check(lines(40, { n: 1, ms: 1000 }))).toEqual({ action: "pass" });
    expect(await check(lines(40, { n: 2, ms: 2000 }))).toEqual({ action: "hide", reason: "too_fast" });
    expect(asked).toHaveLength(2);
  });

  it("lets an account send exactly 100 lines in a minute, and hides the next line", async () => {
    const { check } = setup(() => Promise.resolve(answer()));
    for (const [n, count] of [40, 40, 20].entries())
      expect(await check(lines(count, { n, ms: n }))).toEqual({ action: "pass" });
    expect(await check(stamped(9, 3))).toEqual({ action: "hide", reason: "too_fast" });
  });

  it("counts a blank line of a message as a line, and a line it hid still counts", async () => {
    const { check } = setup(() => Promise.resolve(answer()));
    const blanks = (n: number, ms: number) => ({
      ...said(`a${"\n".repeat(39)}`, `b${String(n)}`),
      time: new Date(T0 + ms).toISOString(),
    });
    expect(await check(blanks(0, 0))).toEqual({ action: "pass" });
    expect(await check(blanks(1, 1))).toEqual({ action: "pass" });
    expect(await check(blanks(2, 2))).toEqual({ action: "hide", reason: "too_fast" });
    // The hidden message's 40 lines stay in the minute: 120 of them, and one line more is too many.
    expect(await check(stamped(9, 3))).toEqual({ action: "hide", reason: "too_fast" });
  });

  it("counts the lines of the minute before a message, not the minute before it out, apart for each account", async () => {
    const OTHER = toAddress(new Uint8Array(20).fill(9));
    const { db, check } = setup(() => Promise.resolve(answer()));
    db.prepare("INSERT INTO accounts (address, first_seen) VALUES (?, ?)").run(OTHER, T0 - 30 * 24 * HOUR);
    await check(lines(40, { n: 0, ms: 0 }));
    await check(lines(40, { n: 1, ms: 0 }));
    expect(await check(lines(40, { n: 2, ms: 1 }, OTHER))).toEqual({ action: "pass" });
    expect(await check(lines(21, { n: 3, ms: 59_999 }))).toEqual({ action: "hide", reason: "too_fast" });
    expect(await check(lines(40, { n: 4, ms: 60_000 }))).toEqual({ action: "pass" });
  });

  it("counts an account's lines whatever the server's clock did between them, Ergo's stamps alone counting (R1)", async () => {
    // S1 as reported forgot an account 60 s after the server last heard of it; both clocks jump 61 s before each line.
    vi.useFakeTimers();
    const { check, clock } = setup(() => Promise.resolve(answer()));
    const verdicts = [];
    for (const [n, ms] of [0, 1000, 2000].entries()) {
      clock.now += 61_000;
      vi.advanceTimersByTime(61_000);
      verdicts.push(await check(lines(40, { n, ms }, OLD)));
    }
    expect(verdicts).toEqual([{ action: "pass" }, { action: "pass" }, { action: "hide", reason: "too_fast" }]);
  });

  it("counts a message once when it is checked again (an unchecked one comes back)", async () => {
    const { check, db } = setup(() => Promise.resolve("unchecked"));
    expect(await check(lines(40, { n: 0, ms: 0 }))).toEqual({ action: "unchecked" });
    db.prepare("UPDATE verdicts SET action = 'unchecked'").run();
    expect(await check(lines(40, { n: 0, ms: 0 }))).toEqual({ action: "unchecked" });
    expect(await check(lines(40, { n: 1, ms: 1 }))).toEqual({ action: "unchecked" });
    expect(await check(lines(21, { n: 2, ms: 2 }))).toEqual({ action: "hide", reason: "too_fast" });
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
    // A line it never checked: no owner to tell, hidden as an edit it cannot place (F549).
    expect(await check({ ...said("an edit of nothing", "m4"), edits: "m9" })).toEqual({
      action: "hide",
      reason: "unknown_edit",
    });
    expect(asked).toEqual(["hello", "hello, fixed"]);
  });

  // The red pass (slice-4-room-edit): an edit sent right after its line, the line's check still waiting on the provider,
  // is placed all the same: the queue starts an account's lines in the order they came, and a check claims its line's
  // row before it waits on anything.
  it("places an edit sent right after its line, the line's check still waiting on the provider, through the queue", async () => {
    const release: (() => void)[] = [];
    const { check, rows } = setup(
      () =>
        new Promise<Answer | "unchecked">((resolve) => {
          release.push(() => {
            resolve(answer());
          });
        }),
    );
    const done: unknown[] = [];
    const queue = makeQueue<ReturnType<typeof said> & { edits?: string }>({
      run: async (line) => {
        done.push(await check(line));
      },
      log: logger(PEPPER, () => undefined),
    });
    queue.push(said("hello", "m1"));
    queue.push({ ...said("hello, fixed", "m2"), edits: "m1" });
    await new Promise((resolve) => setImmediate(resolve));
    expect(rows().map(({ msgid, action }) => [msgid, action])).toEqual([
      ["m1", "pending"],
      ["m2", "pending"],
    ]);
    for (const go of release.splice(0)) go();
    await queue.idle();
    queue.stop();
    expect(done).toEqual([{ action: "pass" }, { action: "pass" }]);
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

  it("sends no line of a room that is not public to the provider: its rules still hide, else it passes (3m)", async () => {
    const db = openDatabase(":memory:", [LOGIN_TABLES, VERDICT_TABLES]);
    opened.push(db);
    db.prepare("INSERT INTO accounts (address, first_seen) VALUES (?, ?)").run(OLD, T0 - 30 * 24 * HOUR);
    const asked: string[] = [];
    const check = makeChecker({
      db,
      rulesOf: () => RULES,
      provider: (text) => {
        asked.push(text);
        return Promise.resolve(answer({ violence: true }, { violence: 0.9 }));
      },
      publicRoom: (room) => room !== "#bubble/crew",
      thresholds: {},
      pepper: PEPPER,
      log: logger(PEPPER, () => true),
      now: () => T0,
    });
    const inCrew = (text: string, msgid: string) => ({ ...said(text, msgid), room: "#bubble/crew" });
    expect(await check(inCrew("I hit you", "m1"))).toEqual({ action: "pass" });
    expect(await check(inCrew("buy spam", "m2"))).toEqual({ action: "hide", reason: "banned_word" });
    expect(await check(said("I hit you", "m3"))).toEqual({ action: "hide", reason: "violence" });
    expect(asked).toEqual(["I hit you"]);
  });

  it("records why a members room's line passed unasked: members_room, with no answer (F574)", async () => {
    const db = openDatabase(":memory:", [LOGIN_TABLES, VERDICT_TABLES]);
    opened.push(db);
    db.prepare("INSERT INTO accounts (address, first_seen) VALUES (?, ?)").run(OLD, T0 - 30 * 24 * HOUR);
    const check = makeChecker({
      db,
      rulesOf: () => RULES,
      provider: () => Promise.resolve(answer()),
      publicRoom: () => false,
      thresholds: {},
      pepper: PEPPER,
      log: logger(PEPPER, () => true),
      now: () => T0,
    });
    await check({ ...said("between us", "m1"), room: "#bubble/crew" });
    expect(db.prepare("SELECT action, reason, flags, scores FROM verdicts").all()).toEqual([
      { action: "pass", reason: "members_room", flags: null, scores: null },
    ]);
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
