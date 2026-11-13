import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { openDatabase } from "@gnoworld/service/db";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Said } from "../irc/link.ts";
import { accountKey } from "../moderation/check.ts";
import { CATEGORIES, type Answer, type Category, type ModerationInput } from "../moderation/provider.ts";
import { makeQueue } from "../moderation/queue.ts";
import { moderate } from "../moderation/way.ts";
import type { Progress } from "../moderation/catchup.ts";
import type { Typed } from "../rooms/types.ts";
import { makeStream } from "../stream/stream.ts";
import { makeCardFlow, type CardFlowOptions } from "./flow.ts";
import { CARD_TABLES } from "./store.ts";

// L3 (docs/plans/link-previews.md §3, §4's server rows, §7's L3 list; D13906, D13919): a line that passed moderation, its first https link
// read by the link reader, the card checked by OpenAI in one call, told on the stream; what hides, expires and is removed.
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const T0 = Date.parse("2026-11-11T12:00:00.000Z");
const ALICE = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
const BOB = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
const GUEST = "anon/brave-otter-abcd";
const PEPPER = "a-pepper-of-forty-characters-0123456789";
const RULES = { bannedWords: [], linksPerMessage: 3, mentionsPerMessage: 5, linksForNewAccount: 2 };
const ROLES: Typed = {
  worlds: new Map([
    [
      "bubble",
      {
        rules: RULES,
        groups: new Map([["crew", new Set([ALICE])]]),
        rooms: new Map([
          ["#bubble/news", { type: "announcement" as const, hidden: false }],
          ["#bubble/club", { type: "accounts" as const, hidden: false }],
          ["#bubble/crew", { type: "members" as const, readers: "crew", hidden: false }],
          ["#bubble/secret", { type: "open" as const, hidden: true }],
        ]),
      },
    ],
  ]),
};
// A JPEG's first bytes with a frame header of the size given (the flow reads the real size), padded to `bytes` in all.
const jpeg = (width: number, height: number, bytes = 21): Buffer =>
  Buffer.concat([
    Buffer.from([
      0xff,
      0xd8,
      0xff,
      0xc0,
      0,
      17,
      8,
      height >> 8,
      height & 255,
      width >> 8,
      width & 255,
      3,
      1,
      0x22,
      0,
      2,
      0x11,
      1,
      3,
      0x11,
      1,
    ]),
    Buffer.alloc(bytes - 21),
  ]);
const JPEG = jpeg(160, 90).toString("base64");
const sha = (text: string): string => createHash("sha256").update(text).digest("hex");
const KEY = sha("https://example.com/a");

const card = (over: Record<string, unknown> = {}) => ({
  title: "A title",
  description: "A description",
  site: "Example",
  picture: { width: 160, height: 90, jpeg: JPEG },
  ...over,
});
const answer = (scores: Partial<Record<Category, number>> = {}, flagged: readonly Category[] = []): Answer => ({
  flagged: Object.fromEntries(CATEGORIES.map((c) => [c, flagged.includes(c)])) as Record<Category, boolean>,
  scores: Object.fromEntries(CATEGORIES.map((c) => [c, scores[c] ?? 0])) as Record<Category, number>,
});
const said = (msgid: string, text = "look https://example.com/a", over: Partial<Said> = {}): Said => ({
  room: "#bubble",
  account: ALICE,
  msgid,
  text,
  time: new Date(T0).toISOString(),
  ...over,
});

const opened: DatabaseSync[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) if (db.isOpen) db.close();
});

function setup(
  over: Partial<CardFlowOptions> & {
    read?: (url: string) => unknown;
    verdict?: (input: ModerationInput) => Answer | "unchecked" | Promise<Answer | "unchecked">;
  } = {},
) {
  const db = openDatabase(":memory:", [CARD_TABLES]);
  opened.push(db);
  const clock = { now: T0 };
  const events: { msgid: string; room: string; key: string | null }[] = [];
  const logs: { event: string; fields: unknown }[] = [];
  const reader = vi.fn(async (url: string) => {
    const got = over.read === undefined ? card({ title: `Page ${url}` }) : await over.read(url);
    if (got instanceof Error) throw got;
    return got;
  });
  const check = vi.fn(async (input: ModerationInput) => (await over.verdict?.(input)) ?? answer());
  const flow = makeCardFlow({
    db,
    roles: ROLES,
    pepper: PEPPER,
    reader,
    check,
    thresholds: { sexual: 0.3 },
    publish: (event) => events.push(event),
    log: (event, fields) => logs.push({ event, fields }),
    now: () => clock.now,
    ...over,
  });
  return { flow, reader, check, events, logs, clock, db };
}

describe("a card only after a pass, for a line that may have one", () => {
  it("reads the first https link of a passed line, checks the card's text and picture in one call, then tells the card", async () => {
    const { flow, reader, check, events } = setup();
    flow.heard(said("m1"));
    await flow.idle();
    expect(reader).toHaveBeenCalledExactlyOnceWith("https://example.com/a");
    expect(check).toHaveBeenCalledOnce();
    expect(check).toHaveBeenCalledWith({
      text: "Page https://example.com/a\nA description\nExample",
      image: `data:image/jpeg;base64,${JPEG}`,
    });
    expect(events).toEqual([{ msgid: "m1", room: "#bubble", key: KEY }]);
    expect(flow.content(KEY)).toEqual({
      host: "example.com",
      site: "Example",
      title: "Page https://example.com/a",
      description: "A description",
      picture: { width: 160, height: 90 },
    });
    expect(flow.picture(KEY)).toEqual(new Uint8Array(Buffer.from(JPEG, "base64")));
    expect(flow.lines("#bubble", ["m1", "m0"])).toEqual([{ msgid: "m1", key: KEY }]);
  });

  it("keys the cache by the normalised URL: one card for the spellings of a page", async () => {
    const { flow, reader, events } = setup();
    flow.heard(said("m1", "https://EXAMPLE.com:443/a#top"));
    flow.heard(said("m2", "[x](https://example.com/a)"));
    await flow.idle();
    expect(reader).toHaveBeenCalledExactlyOnceWith("https://example.com/a");
    expect(events.map(({ key }) => key)).toEqual([KEY, KEY]);
  });

  it("tells nothing before the check has answered: an unchecked card never shows, not even for a moment", async () => {
    let release: (answer: Answer) => void = () => undefined;
    const { flow, events, check } = setup({ verdict: () => new Promise<Answer>((resolve) => (release = resolve)) });
    flow.heard(said("m1"));
    await vi.waitFor(() => {
      expect(check).toHaveBeenCalled();
    });
    expect(events).toEqual([]);
    expect(flow.content(KEY)).toBeUndefined();
    expect(flow.picture(KEY)).toBeUndefined();
    expect(flow.lines("#bubble", ["m1"])).toEqual([]);
    release(answer());
    await flow.idle();
    expect(events).toHaveLength(1);
  });

  it.each([
    ["an accounts room", "#bubble/club"],
    ["a members room", "#bubble/crew"],
    ["a hidden room", "#bubble/secret"],
  ])("makes no reader call for %s", async (_name, room) => {
    const { flow, reader, check, events } = setup();
    flow.heard(said("m1", "https://example.com/a", { room }));
    await flow.idle();
    expect(reader).not.toHaveBeenCalled();
    expect(check).not.toHaveBeenCalled();
    expect(events).toEqual([]);
  });

  it.each([
    ["an announcement room", "#bubble/news"],
    ["an open room of a world the roles file does not list, as a generated world's rooms are", "#elsewhere"],
  ])("serves %s, which a guest reads", async (_name, room) => {
    const { flow, events } = setup();
    flow.heard(said("m1", "https://example.com/a", { room }));
    await flow.idle();
    expect(events).toEqual([{ msgid: "m1", room, key: KEY }]);
  });

  it("makes no reader call for a guest's line, whose account is an anon nick", async () => {
    const { flow, reader, events } = setup();
    flow.heard(said("m1", "https://example.com/a", { account: GUEST }));
    await flow.idle();
    expect(reader).not.toHaveBeenCalled();
    expect(events).toEqual([]);
  });

  it.each([
    ["no link", "just words"],
    ["an http link", "http://example.com/a"],
    ["a link past the first, the first being refused", "https://10.0.0.1/ https://example.com/a"],
    ["an address in a code span", "`https://example.com/a`"],
    ["a port 8443", "https://example.com:8443/a"],
  ])("makes no reader call for a line with %s", async (_name, text) => {
    const { flow, reader, events } = setup();
    flow.heard(said("m1", text));
    await flow.idle();
    expect(reader).not.toHaveBeenCalled();
    expect(events).toEqual([]);
  });

  it("makes no reader call for a line moderation hid or left unchecked: only `passed` reaches the cards", async () => {
    const { flow, reader, events } = setup();
    const settled = vi.fn();
    const progress: Progress = {
      last: () => undefined,
      heard: () => undefined,
      settled,
      hold: () => undefined,
      size: () => ({ rooms: 0, lines: 0 }),
    };
    const db = openDatabase(":memory:", [CARD_TABLES]);
    opened.push(db);
    for (const verdict of [{ action: "hide", reason: "hate" }, { action: "unchecked" }] as const) {
      const run = moderate({
        db,
        check: () => Promise.resolve(verdict),
        send: () => true,
        stream: makeStream(),
        progress,
        strike: () => undefined,
        passed: flow.heard,
      });
      await run(said("m1"));
    }
    await flow.idle();
    expect(settled).toHaveBeenCalledTimes(2);
    expect(reader).not.toHaveBeenCalled();
    expect(events).toEqual([]);
  });

  it("makes a card for a line moderation passed, through the same way the chat runs lines", async () => {
    const { flow, events } = setup();
    const db = openDatabase(":memory:", [CARD_TABLES]);
    opened.push(db);
    const progress: Progress = {
      last: () => undefined,
      heard: () => undefined,
      settled: () => undefined,
      hold: () => undefined,
      size: () => ({ rooms: 0, lines: 0 }),
    };
    const run = moderate({
      db,
      check: () => Promise.resolve({ action: "pass" }),
      send: () => true,
      stream: makeStream(),
      progress,
      strike: () => undefined,
      passed: flow.heard,
    });
    await run(said("m1"));
    await flow.idle();
    expect(events).toEqual([{ msgid: "m1", room: "#bubble", key: KEY }]);
  });
});

describe("one fetch per URL per TTL, whoever posts it", () => {
  it("makes one reader call and one check for two lines with one URL, and tells both lines", async () => {
    const { flow, reader, check, events } = setup();
    flow.heard(said("m1"));
    flow.heard(said("m2", "me too https://example.com/a", { account: BOB }));
    await flow.idle();
    expect(reader).toHaveBeenCalledTimes(1);
    expect(check).toHaveBeenCalledTimes(1);
    expect(events).toEqual([
      { msgid: "m1", room: "#bubble", key: KEY },
      { msgid: "m2", room: "#bubble", key: KEY },
    ]);
  });

  it("ties a line that arrives once the card is fresh at once, with no new call", async () => {
    const { flow, reader, check, events } = setup();
    flow.heard(said("m1"));
    await flow.idle();
    flow.heard(said("m2", "again https://example.com/a", { account: BOB }));
    expect(events.at(-1)).toEqual({ msgid: "m2", room: "#bubble", key: KEY });
    await flow.idle();
    expect(reader).toHaveBeenCalledTimes(1);
    expect(check).toHaveBeenCalledTimes(1);
  });

  it("takes a fresh entry as it is for 24 hours, then fetches again once for the lines waiting on it", async () => {
    const { flow, reader, clock, events } = setup();
    flow.heard(said("m1"));
    await flow.idle();
    clock.now = T0 + 23 * HOUR;
    flow.heard(said("m2"));
    await flow.idle();
    expect(reader).toHaveBeenCalledTimes(1);
    clock.now = T0 + 25 * HOUR;
    flow.heard(said("m3"));
    flow.heard(said("m4", "https://example.com/a", { account: BOB }));
    await flow.idle();
    expect(reader).toHaveBeenCalledTimes(2);
    expect(events.map(({ msgid }) => msgid)).toEqual(["m1", "m2", "m3", "m4"]);
  });

  it("tells a line nothing when the refetch of a stale card is down: a stale card is never served as fresh", async () => {
    let down = false;
    const { flow, clock, events } = setup({ read: () => (down ? new Error("down") : card()) });
    flow.heard(said("m1"));
    await flow.idle();
    down = true;
    clock.now = T0 + 25 * HOUR;
    flow.heard(said("m2"));
    await flow.idle();
    expect(events.map(({ msgid }) => msgid)).toEqual(["m1"]);
    expect(flow.lines("#bubble", ["m2"])).toEqual([]);
  });

  it("does not call the reader for a GET: serving a card never fetches", async () => {
    const { flow, reader } = setup();
    flow.heard(said("m1"));
    await flow.idle();
    flow.lines("#bubble", ["m1", "m2"]);
    flow.content(KEY);
    flow.content(sha("https://unknown.example/"));
    flow.picture(KEY);
    flow.known("#bubble", "m1");
    await flow.idle();
    expect(reader).toHaveBeenCalledTimes(1);
  });
});

describe("the reader down, a card refused, the check unable", () => {
  it("makes no card when the reader is down, and waits 1 hour before it asks again", async () => {
    const { flow, reader, clock, events } = setup({ read: () => new Error("ECONNREFUSED") });
    flow.heard(said("m1"));
    await flow.idle();
    expect(events).toEqual([]);
    expect(flow.content(KEY)).toBeUndefined();
    clock.now = T0 + 59 * MINUTE;
    flow.heard(said("m2"));
    await flow.idle();
    expect(reader).toHaveBeenCalledTimes(1);
    clock.now = T0 + 61 * MINUTE;
    flow.heard(said("m3"));
    await flow.idle();
    expect(reader).toHaveBeenCalledTimes(2);
  });

  it("counts a reader answer of the wrong shape, an oversized picture or a picture that is no JPEG as unchecked, and alerts", async () => {
    const wrong: unknown[] = [
      { title: "t" },
      "text",
      null,
      card({ picture: { width: 160, height: 90, jpeg: Buffer.from("<svg onload=alert(1)>").toString("base64") } }),
      card({
        picture: {
          width: 160,
          height: 90,
          jpeg: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(20_000)]).toString("base64"),
        },
      }),
      card({ title: "x".repeat(201) }),
      card({ site: "a\u202eb" }),
    ];
    for (const body of wrong) {
      const { flow, events, check, logs } = setup({ read: () => body });
      flow.heard(said("m1"));
      await flow.idle();
      expect(events, JSON.stringify(body).slice(0, 40)).toEqual([]);
      expect(check).not.toHaveBeenCalled();
      expect(flow.content(KEY)).toBeUndefined();
      expect(logs.some(({ event }) => event === "alert")).toBe(true);
    }
  });

  it("makes no card when the check cannot answer (the breaker open, OpenAI down), and asks again after 5 minutes, not before", async () => {
    let answers: Answer | "unchecked" = "unchecked";
    const { flow, reader, check, clock, events } = setup({ verdict: () => answers });
    flow.heard(said("m1"));
    await flow.idle();
    expect(events).toEqual([]);
    expect(flow.content(KEY)).toBeUndefined();
    expect(flow.picture(KEY)).toBeUndefined();
    clock.now = T0 + 4 * MINUTE;
    flow.heard(said("m2"));
    await flow.idle();
    expect(check).toHaveBeenCalledTimes(1);
    answers = answer();
    clock.now = T0 + 6 * MINUTE;
    flow.heard(said("m3"));
    await flow.idle();
    expect(check).toHaveBeenCalledTimes(2);
    expect(reader.mock.calls.length).toBeLessThanOrEqual(2);
    expect(events.map(({ msgid }) => msgid)).toEqual(["m3"]);
  });

  it("drops a card OpenAI flags, with no event, no content and nothing at the picture; the failure is remembered for 24 hours", async () => {
    const { flow, reader, events, clock } = setup({ verdict: () => answer({}, ["violence"]) });
    flow.heard(said("m1"));
    await flow.idle();
    expect(events).toEqual([]);
    expect(flow.content(KEY)).toBeUndefined();
    expect(flow.picture(KEY)).toBeUndefined();
    expect(flow.lines("#bubble", ["m1"])).toEqual([]);
    clock.now = T0 + 23 * HOUR;
    flow.heard(said("m2"));
    await flow.idle();
    expect(reader).toHaveBeenCalledTimes(1);
  });

  it("holds the card to a stricter `sexual` threshold than a line: a score the line's rule lets through hides the card", async () => {
    const { flow, events } = setup({ verdict: () => answer({ sexual: 0.35 }) });
    flow.heard(said("m1"));
    await flow.idle();
    expect(events).toEqual([]);
    expect(flow.content(KEY)).toBeUndefined();
  });

  it("holds anything involving minors, whatever the thresholds", async () => {
    const { flow, events } = setup({ verdict: () => answer({}, ["sexual/minors"]) });
    flow.heard(said("m1"));
    await flow.idle();
    expect(events).toEqual([]);
  });

  it("keeps the failure kind in the log and never the URL or the page's words", async () => {
    const { flow, logs } = setup({ read: () => new Error("connect ECONNREFUSED https://example.com/a") });
    flow.heard(said("m1"));
    await flow.idle();
    expect(JSON.stringify(logs)).not.toContain("example.com");
  });
});

describe("limits: per account, per host, in total, one fetch at a time", () => {
  it("lets an account start 10 new URLs in 10 minutes and no more, tying the line to nothing", async () => {
    const { flow, reader, clock } = setup();
    for (let n = 0; n < 12; n += 1) flow.heard(said(`m${String(n)}`, `https://site${String(n)}.example/`));
    await flow.idle();
    expect(reader).toHaveBeenCalledTimes(10);
    clock.now = T0 + 11 * MINUTE;
    flow.heard(said("late", "https://site11.example/"));
    await flow.idle();
    expect(reader).toHaveBeenCalledTimes(11);
  });

  it("never counts a URL already cached against an account: the cache answers, whoever asks", async () => {
    const { flow, reader, events } = setup();
    for (let n = 0; n < 15; n += 1) flow.heard(said(`m${String(n)}`, "https://example.com/a"));
    await flow.idle();
    expect(reader).toHaveBeenCalledTimes(1);
    expect(events).toHaveLength(15);
  });

  it("lets a host be fetched 20 times a minute and no more, whoever asks", async () => {
    const { flow, reader, clock } = setup();
    for (let n = 0; n < 25; n += 1)
      flow.heard(said(`m${String(n)}`, `https://one.example/p${String(n)}`, { account: `g1acc${String(n)}` }));
    await flow.idle();
    expect(reader).toHaveBeenCalledTimes(20);
    clock.now = T0 + 61_000;
    flow.heard(said("later", "https://one.example/later", { account: "g1accx" }));
    await flow.idle();
    expect(reader).toHaveBeenCalledTimes(21);
  });

  it("lets 60 fetches a minute through in total", async () => {
    const { flow, reader } = setup();
    for (let n = 0; n < 70; n += 1)
      flow.heard(said(`m${String(n)}`, `https://h${String(n)}.example/`, { account: `g1acc${String(n)}` }));
    await flow.idle();
    expect(reader).toHaveBeenCalledTimes(60);
  });

  it("fetches one page at a time", async () => {
    let running = 0;
    let most = 0;
    const { flow, reader } = setup({
      read: async () => {
        running += 1;
        most = Math.max(most, running);
        await new Promise((resolve) => setTimeout(resolve, 2));
        running -= 1;
        return card();
      },
    });
    for (let n = 0; n < 6; n += 1)
      flow.heard(said(`m${String(n)}`, `https://h${String(n)}.example/`, { account: `g1acc${String(n)}` }));
    await flow.idle();
    expect(reader).toHaveBeenCalledTimes(6);
    expect(most).toBe(1);
  });

  it("never delays a line's check: 50 cards waiting on a reader that does not answer, and every line settles", async () => {
    const { flow, reader } = setup({ read: () => new Promise(() => undefined) });
    const settled: string[] = [];
    const progress: Progress = {
      last: () => undefined,
      heard: () => undefined,
      settled: ({ msgid }) => settled.push(msgid),
      hold: () => undefined,
      size: () => ({ rooms: 0, lines: 0 }),
    };
    const db = openDatabase(":memory:", [CARD_TABLES]);
    opened.push(db);
    const run = moderate({
      db,
      check: () => Promise.resolve({ action: "pass" }),
      send: () => true,
      stream: makeStream(),
      progress,
      strike: () => undefined,
      passed: flow.heard,
    });
    const queue = makeQueue<Said>({ run, log: () => undefined });
    for (let n = 0; n < 50; n += 1)
      queue.push(said(`m${String(n)}`, `https://h${String(n)}.example/`, { account: `g1acc${String(n)}` }));
    await queue.idle();
    queue.stop();
    expect(settled).toHaveLength(50);
    expect(reader.mock.calls.length).toBeLessThanOrEqual(1);
    flow.stop();
  });
});

describe("lifecycle: an edit, a REDACT, a removal", () => {
  it("drops the card of a line its author edited: the replaced line's card goes and the stream says so", async () => {
    const { flow, events } = setup();
    flow.heard(said("m1"));
    await flow.idle();
    flow.edited(said("m2", "no link now", { edits: "m1" }));
    expect(flow.lines("#bubble", ["m1"])).toEqual([]);
    expect(events.at(-1)).toEqual({ msgid: "m1", room: "#bubble", key: null });
  });

  it("gives the edited text its own card when it passes with another link", async () => {
    const { flow, events } = setup();
    flow.heard(said("m1"));
    await flow.idle();
    flow.edited(said("m2", "https://other.example/b", { edits: "m1" }));
    flow.heard(said("m2", "https://other.example/b", { edits: "m1" }));
    await flow.idle();
    expect(events.at(-1)).toEqual({ msgid: "m2", room: "#bubble", key: sha("https://other.example/b") });
    expect(flow.lines("#bubble", ["m1", "m2"]).map(({ msgid }) => msgid)).toEqual(["m2"]);
  });

  it("drops a line's card when the link REDACTs it, and the others sharing the URL keep theirs", async () => {
    const { flow, events } = setup();
    flow.heard(said("m1"));
    flow.heard(said("m2", "https://example.com/a", { account: BOB }));
    await flow.idle();
    flow.redacted("#bubble", "m1");
    expect(events.at(-1)).toEqual({ msgid: "m1", room: "#bubble", key: null });
    expect(flow.lines("#bubble", ["m1", "m2"])).toEqual([{ msgid: "m2", key: KEY }]);
    expect(flow.content(KEY)).toBeDefined();
  });

  it("tells and drops nothing for a REDACT of a line with no card", () => {
    const { flow, events } = setup();
    flow.redacted("#bubble", "nothing");
    expect(events).toEqual([]);
  });

  it("stops serving a card whose every line is gone: no content, no picture", async () => {
    const { flow } = setup();
    flow.heard(said("m1"));
    await flow.idle();
    flow.redacted("#bubble", "m1");
    expect(flow.content(KEY)).toBeUndefined();
    expect(flow.picture(KEY)).toBeUndefined();
  });

  it("removes a line's card once and for all: another line with the URL keeps its card, and the same line is never tied again", async () => {
    const { flow, events, clock } = setup();
    flow.heard(said("m1"));
    flow.heard(said("m2", "https://example.com/a", { account: BOB }));
    await flow.idle();
    expect(flow.known("#bubble", "m1")).toBe(true);
    expect(flow.remove("#bubble", "m1")).toBe(true);
    expect(flow.remove("#bubble", "m1")).toBe(false);
    expect(flow.remove("#bubble", "nothing")).toBe(false);
    expect(flow.lines("#bubble", ["m1", "m2"])).toEqual([{ msgid: "m2", key: KEY }]);
    clock.now = T0 + 25 * HOUR;
    flow.heard(said("m1"));
    await flow.idle();
    expect(flow.lines("#bubble", ["m1"])).toEqual([]);
    expect(events.filter(({ msgid, key }) => msgid === "m1" && key !== null)).toHaveLength(1);
  });

  it("tells who wrote a line by the HMAC under the pepper, never the address", async () => {
    const { flow, db } = setup();
    flow.heard(said("m1"));
    await flow.idle();
    expect(flow.isAuthor("#bubble", "m1", ALICE)).toBe(true);
    expect(flow.isAuthor("#bubble", "m1", BOB)).toBe(false);
    expect(flow.isAuthor("#bubble", "nothing", ALICE)).toBe(false);
    const dump = JSON.stringify(db.prepare("SELECT * FROM line_cards").all());
    expect(dump).not.toContain(ALICE);
    expect(dump).toContain(accountKey(PEPPER, ALICE));
  });

  it("keeps nothing of the line's text, only its id, its room and its key", async () => {
    const { flow, db } = setup();
    flow.heard(said("m1", "secret words https://example.com/a more secret words"));
    await flow.idle();
    const dump = JSON.stringify([
      db.prepare("SELECT * FROM line_cards").all(),
      db.prepare("SELECT * FROM link_cards").all(),
    ]);
    expect(dump).not.toContain("secret words");
  });
});

describe("retention: 30 days, 2,000 rows, 32 MiB of pictures, oldest first", () => {
  it("expires a card older than 30 days with its picture, and keeps a younger one", async () => {
    const { flow, clock } = setup();
    flow.heard(said("old", "https://old.example/"));
    await flow.idle();
    clock.now = T0 + 20 * DAY;
    flow.heard(said("young", "https://young.example/"));
    await flow.idle();
    clock.now = T0 + 31 * DAY;
    expect(flow.expire(100)).toBeGreaterThan(0);
    expect(flow.content(sha("https://old.example/"))).toBeUndefined();
    expect(flow.picture(sha("https://old.example/"))).toBeUndefined();
    expect(flow.content(sha("https://young.example/"))).toBeDefined();
  });

  it("drops the oldest cards past the row cap", async () => {
    const { flow, clock } = setup({ maxRows: 3 });
    for (let n = 0; n < 5; n += 1) {
      clock.now = T0 + n * MINUTE * 2;
      flow.heard(said(`m${String(n)}`, `https://h${String(n)}.example/`, { account: `g1acc${String(n)}` }));
      await flow.idle();
    }
    expect(flow.expire(100)).toBe(2);
    expect(flow.content(sha("https://h0.example/"))).toBeUndefined();
    expect(flow.content(sha("https://h1.example/"))).toBeUndefined();
    expect(flow.content(sha("https://h4.example/"))).toBeDefined();
  });

  it("drops the oldest cards past the byte cap of pictures", async () => {
    const picture = jpeg(100, 100, 1000);
    const { flow, clock } = setup({
      maxBytes: 2500,
      read: () => card({ picture: { width: 100, height: 100, jpeg: picture.toString("base64") } }),
    });
    for (let n = 0; n < 4; n += 1) {
      clock.now = T0 + n * MINUTE * 2;
      flow.heard(said(`m${String(n)}`, `https://h${String(n)}.example/`, { account: `g1acc${String(n)}` }));
      await flow.idle();
    }
    expect(flow.expire(100)).toBe(2);
    expect(flow.picture(sha("https://h0.example/"))).toBeUndefined();
    expect(flow.picture(sha("https://h3.example/"))).toBeDefined();
  });

  it("takes at most `limit` rows a tick, so a backlog never holds the event loop", async () => {
    const { flow, clock } = setup();
    for (let n = 0; n < 5; n += 1) {
      flow.heard(said(`m${String(n)}`, `https://h${String(n)}.example/`, { account: `g1acc${String(n)}` }));
      await flow.idle();
    }
    clock.now = T0 + 40 * DAY;
    expect(flow.expire(2)).toBe(2);
    expect(flow.expire(100)).toBe(3);
    expect(flow.expire(100)).toBe(0);
  });
});

describe("what the check holds a card to", () => {
  it("sends a card with no picture as its text alone, with no image", async () => {
    const { flow, check, events } = setup({ read: () => card({ picture: null }) });
    flow.heard(said("m1"));
    await flow.idle();
    expect(check).toHaveBeenCalledWith({ text: "A title\nA description\nExample" });
    expect(events).toHaveLength(1);
  });

  it("sends the description and the site too, so a card is checked on every word it shows", async () => {
    const { flow, check } = setup({
      read: () => card({ title: "t", description: "the description", site: "the site" }),
    });
    flow.heard(said("m1"));
    await flow.idle();
    expect(check.mock.calls[0]?.[0]).toEqual({
      text: "t\nthe description\nthe site",
      image: `data:image/jpeg;base64,${JPEG}`,
    });
  });

  it("refuses a card OpenAI flags even when a threshold is set for that category", async () => {
    const { flow, events } = setup({ thresholds: { sexual: 0.9 }, verdict: () => answer({ sexual: 0.1 }, ["sexual"]) });
    flow.heard(said("m1"));
    await flow.idle();
    expect(events).toEqual([]);
  });

  it("refuses a score that reaches the threshold exactly, and passes one just under", async () => {
    for (const [score, shows] of [
      [0.3, false],
      [0.29, true],
    ] as const) {
      const { flow, events } = setup({ thresholds: { sexual: 0.3 }, verdict: () => answer({ sexual: score }) });
      flow.heard(said("m1"));
      await flow.idle();
      expect(events.length > 0, String(score)).toBe(shows);
    }
  });

  it("refuses what involves minors even when a threshold is set, and a category with no threshold passes on its score", async () => {
    const minors = setup({ thresholds: { "sexual/minors": 0.9 }, verdict: () => answer({}, ["sexual/minors"]) });
    minors.flow.heard(said("m1"));
    await minors.flow.idle();
    expect(minors.events).toEqual([]);
    const high = setup({ thresholds: { sexual: 0.3 }, verdict: () => answer({ hate: 0.99 }) });
    high.flow.heard(said("m1"));
    await high.flow.idle();
    expect(high.events).toHaveLength(1);
  });

  it("ends unchecked, with no unhandled rejection, when the check itself rejects", async () => {
    const { flow, events, check } = setup({
      verdict: () => {
        throw new Error("boom");
      },
    });
    flow.heard(said("m1"));
    await flow.idle();
    expect(check).toHaveBeenCalledOnce();
    expect(events).toEqual([]);
  });

  it("reuses the stored reader answer when an unchecked card is checked again: no new read", async () => {
    let answers: Answer | "unchecked" = "unchecked";
    const { flow, reader, check, clock, events } = setup({ verdict: () => answers });
    flow.heard(said("m1"));
    await flow.idle();
    answers = answer();
    clock.now = T0 + 6 * MINUTE;
    flow.heard(said("m2"));
    await flow.idle();
    expect(reader).toHaveBeenCalledTimes(1);
    expect(check).toHaveBeenCalledTimes(2);
    expect(events.map(({ msgid }) => msgid)).toEqual(["m2"]);
  });

  it("asks again after 24 hours for a card that was refused", async () => {
    const { flow, reader, clock } = setup({ verdict: () => answer({}, ["violence"]) });
    flow.heard(said("m1"));
    await flow.idle();
    clock.now = T0 + 25 * HOUR;
    flow.heard(said("m2"));
    await flow.idle();
    expect(reader).toHaveBeenCalledTimes(2);
  });

  it("counts EXAMPLE.com and example.com as one host for the limit", async () => {
    const { flow, reader } = setup();
    for (let n = 0; n < 22; n += 1) {
      const host = n % 2 === 0 ? "EXAMPLE.com" : "example.com";
      flow.heard(said(`m${String(n)}`, `https://${host}/p${String(n)}`, { account: `g1acc${String(n)}` }));
    }
    await flow.idle();
    expect(reader).toHaveBeenCalledTimes(20);
  });
});

describe("a removal outlives the instance, and an edit of a removed line", () => {
  it("is read from the database: a second flow on it never ties the removed line again", async () => {
    const first = setup();
    first.flow.heard(said("m1"));
    await first.flow.idle();
    first.flow.remove("#bubble", "m1");
    const again = makeCardFlow({
      db: first.db,
      roles: ROLES,
      pepper: PEPPER,
      reader: first.reader,
      check: first.check,
      thresholds: {},
      publish: (event) => first.events.push(event),
      log: () => undefined,
      now: () => T0 + 25 * HOUR,
    });
    again.heard(said("m1"));
    await again.idle();
    expect(again.lines("#bubble", ["m1"])).toEqual([]);
    again.stop();
  });

  it("passes to the edit: the edited line, link kept, gets no card", async () => {
    const { flow, events } = setup();
    flow.heard(said("m1"));
    await flow.idle();
    flow.remove("#bubble", "m1");
    flow.edited(said("m2", "still https://example.com/a", { edits: "m1" }));
    flow.heard(said("m2", "still https://example.com/a", { edits: "m1" }));
    await flow.idle();
    expect(flow.lines("#bubble", ["m2"])).toEqual([]);
    expect(events.filter(({ msgid, key }) => msgid === "m2" && key !== null)).toEqual([]);
    flow.edited(said("m3", "again https://example.com/a", { edits: "m1" }));
    flow.heard(said("m3", "again https://example.com/a", { edits: "m1" }));
    await flow.idle();
    expect(flow.lines("#bubble", ["m3"])).toEqual([]);
  });
});

describe("a card in flight, a reader that hangs", () => {
  it("fails the page after the reader's timeout and fetches the next: a hung reader never blocks the one-at-a-time fetch for good", async () => {
    vi.useFakeTimers();
    try {
      // A hung reader gives up at its client's own deadline (reader.ts), as the real one does.
      const { flow, reader, events } = setup({
        read: (url) =>
          url.includes("hang")
            ? new Promise((_resolve, reject) => {
                setTimeout(() => {
                  reject(new Error("timeout"));
                }, 8000);
              })
            : card(),
      });
      flow.heard(said("m1", "https://hang.example/a"));
      flow.heard(said("m2", "https://ok.example/a", { account: BOB }));
      await vi.advanceTimersByTimeAsync(11_000);
      await flow.idle();
      expect(reader).toHaveBeenCalledTimes(2);
      expect(events.map(({ msgid }) => msgid)).toEqual(["m2"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("drops a line REDACTed while its card is in flight: no card, no event for it, the others served", async () => {
    let release: (value: unknown) => void = () => undefined;
    const { flow, events, check } = setup({ read: () => new Promise((resolve) => (release = resolve)) });
    flow.heard(said("m1"));
    flow.heard(said("m2", "https://example.com/a", { account: BOB }));
    await vi.waitFor(() => {
      expect(release).not.toBe(undefined);
    });
    flow.redacted("#bubble", "m1");
    release(card());
    await flow.idle();
    expect(check).toHaveBeenCalledOnce();
    expect(events.map(({ msgid }) => msgid)).toEqual(["m2"]);
  });

  it("tells a line once when it is heard twice, as a catch-up replays it", async () => {
    const { flow, events } = setup();
    flow.heard(said("m1"));
    flow.heard(said("m1"));
    await flow.idle();
    flow.heard(said("m1"));
    await flow.idle();
    expect(events).toHaveLength(1);
  });

  it("holds at most 1,000 lines waiting on one URL", () => {
    const { flow } = setup({ read: () => new Promise(() => undefined) });
    for (let n = 0; n < 1500; n += 1) flow.heard(said(`m${String(n)}`, "https://example.com/a", { account: BOB }));
    expect(flow.waiting()).toBe(1000);
    flow.stop();
  });

  it("starts no read after stop, and idle resolves", async () => {
    const { flow, reader } = setup();
    flow.stop();
    flow.heard(said("m1"));
    await flow.idle();
    expect(reader).not.toHaveBeenCalled();
  });
});

describe("retention also takes the lines' rows and the refused pages", () => {
  it("takes the lines of an expired page, and a refused page past 30 days", async () => {
    const { flow, clock, db } = setup({ verdict: () => answer({}, ["violence"]) });
    flow.heard(said("m1"));
    await flow.idle();
    clock.now = T0 + 31 * DAY;
    expect(flow.expire(100)).toBe(1);
    expect(db.prepare("SELECT count(*) AS n FROM link_cards").get()).toEqual({ n: 0 });
    const live = setup();
    live.flow.heard(said("m1"));
    await live.flow.idle();
    live.clock.now = T0 + 31 * DAY;
    live.flow.expire(100);
    expect(live.db.prepare("SELECT count(*) AS n FROM line_cards").get()).toEqual({ n: 0 });
  });
});

describe("the default row cap", () => {
  it("is 2,000 pages: the 2,001st page pushes the oldest out", async () => {
    const { flow, clock } = setup({ read: () => card({ picture: null }) });
    for (let n = 0; n < 2001; n += 1) {
      clock.now = T0 + n * 2000;
      flow.heard(said(`m${String(n)}`, `https://h${String(n)}.example/`, { account: `g1acc${String(n)}` }));
      await flow.idle();
    }
    expect(flow.expire(5000)).toBe(1);
    expect(flow.content(sha("https://h0.example/"))).toBeUndefined();
    expect(flow.content(sha("https://h1.example/"))).toBeDefined();
  });
});

describe("security: forged tags, few lines, races, a failing step", () => {
  it("keeps a card when another account's line carries an edit tag naming it, or when the tag comes from another room", async () => {
    const { flow, events } = setup();
    flow.heard(said("m1"));
    await flow.idle();
    flow.edited(said("m2", "no link", { edits: "m1", account: BOB }));
    flow.edited(said("m3", "no link", { edits: "m1", room: "#bubble/news" }));
    expect(flow.lines("#bubble", ["m1"])).toEqual([{ msgid: "m1", key: KEY }]);
    expect(events).toEqual([{ msgid: "m1", room: "#bubble", key: KEY }]);
  });

  it("keeps a waiting line when a forged edit tag names it", async () => {
    let release: (value: unknown) => void = () => undefined;
    const { flow, events } = setup({ read: () => new Promise((resolve) => (release = resolve)) });
    flow.heard(said("m1"));
    flow.edited(said("m2", "no link", { edits: "m1", account: BOB }));
    release(card());
    await flow.idle();
    expect(events).toEqual([{ msgid: "m1", room: "#bubble", key: KEY }]);
  });

  it("makes no reader call and no event for a line to operators or voices alone", async () => {
    const { flow, reader, events } = setup();
    flow.heard(said("m1", "https://example.com/a", { few: true }));
    await flow.idle();
    expect(reader).not.toHaveBeenCalled();
    expect(events).toEqual([]);
  });

  it("gives no card to a line REDACTed or edited by its author while the card is being checked", async () => {
    let release: (answer: Answer) => void = () => undefined;
    const { flow, events, check } = setup({ verdict: () => new Promise<Answer>((resolve) => (release = resolve)) });
    flow.heard(said("m1"));
    flow.heard(said("m2", "https://example.com/a"));
    flow.heard(said("m3", "https://example.com/a", { account: BOB }));
    await vi.waitFor(() => {
      expect(check).toHaveBeenCalled();
    });
    flow.redacted("#bubble", "m1");
    flow.edited(said("m4", "no link", { edits: "m2" }));
    release(answer());
    await flow.idle();
    expect(events.map(({ msgid }) => msgid)).toEqual(["m3"]);
    expect(flow.lines("#bubble", ["m1", "m2", "m3"])).toEqual([{ msgid: "m3", key: KEY }]);
  });

  it("gives no card to a line REDACTed while the reader is read", async () => {
    let release: (value: unknown) => void = () => undefined;
    const { flow, events } = setup({ read: () => new Promise((resolve) => (release = resolve)) });
    flow.heard(said("m1"));
    flow.redacted("#bubble", "m1");
    release(card());
    await flow.idle();
    expect(events).toEqual([]);
  });

  it("frees a page whose settling throws: nothing waits on it forever, and the queue's alerts are the cards' own", async () => {
    let fail = true;
    const { flow, events, logs } = setup({
      publish: (event) => {
        if (fail) throw new Error("boom");
        events.push(event);
      },
    });
    flow.heard(said("m1"));
    await flow.idle();
    fail = false;
    expect(flow.waiting()).toBe(0);
    flow.heard(said("m2", "https://example.com/a", { account: BOB }));
    await flow.idle();
    expect(events.map(({ msgid }) => msgid)).toEqual(["m2"]);
    expect(logs.map(({ event }) => event).filter((event) => event.startsWith("moderation"))).toEqual([]);
    expect(logs.some(({ event }) => event === "card_failed")).toBe(true);
  });
});

// The surviving mutants of the day (slice 13): each test is named after the fault it guards.
const pageOf = (db: DatabaseSync, key = KEY) =>
  db.prepare("SELECT state, title, picture FROM link_cards WHERE key = ?").get(key);

describe("what a reader's failure leaves behind", () => {
  it("alerts for an answer of the wrong shape and keeps it unchecked, but neither alerts for a reader that is down nor keeps it unchecked", async () => {
    const wrong = setup({ read: () => "text" });
    wrong.flow.heard(said("m1"));
    await wrong.flow.idle();
    expect(wrong.logs).toContainEqual({ event: "alert", fields: { error: "card_shape" } });
    expect(pageOf(wrong.db)).toMatchObject({ state: "unchecked" });
    const down = setup({ read: () => new Error("ECONNREFUSED") });
    down.flow.heard(said("m1"));
    await down.flow.idle();
    expect(down.logs.filter(({ event }) => event === "alert")).toEqual([]);
    expect(pageOf(down.db)).toMatchObject({ state: "down" });
  });

  it("keeps the texts and the picture of a card that passed, and nothing of one that failed", async () => {
    const passed = setup();
    passed.flow.heard(said("m1"));
    await passed.flow.idle();
    expect(pageOf(passed.db)).toMatchObject({ state: "passed", title: "Page https://example.com/a" });
    const failed = setup({ verdict: () => answer({}, ["violence"]) });
    failed.flow.heard(said("m1"));
    await failed.flow.idle();
    expect(pageOf(failed.db)).toEqual({ state: "failed", title: null, picture: null });
  });

  it("charges an account for asking again a page whose answer had no title, as for a new page", async () => {
    const { flow, reader, clock } = setup({ read: () => "text" });
    for (let n = 0; n < 10; n += 1) flow.heard(said(`m${String(n)}`, `https://site${String(n)}.example/`));
    await flow.idle();
    expect(reader).toHaveBeenCalledTimes(10);
    clock.now = T0 + 6 * MINUTE;
    flow.heard(said("again", "https://site0.example/"));
    await flow.idle();
    expect(reader).toHaveBeenCalledTimes(10);
  });
});

describe("the account's window and a page's age", () => {
  it("keeps an account to 10 new URLs through the whole 10 minutes", async () => {
    const { flow, reader, clock } = setup();
    for (let n = 0; n < 10; n += 1) flow.heard(said(`m${String(n)}`, `https://site${String(n)}.example/`));
    await flow.idle();
    clock.now = T0 + 9 * MINUTE;
    flow.heard(said("mid", "https://site10.example/"));
    await flow.idle();
    expect(reader).toHaveBeenCalledTimes(10);
  });

  it("reads a page again at exactly 24 hours, not a millisecond before", async () => {
    const { flow, reader, clock } = setup();
    flow.heard(said("m1"));
    await flow.idle();
    clock.now = T0 + DAY - 1;
    flow.heard(said("m2"));
    await flow.idle();
    expect(reader).toHaveBeenCalledTimes(1);
    clock.now = T0 + DAY;
    flow.heard(said("m3"));
    await flow.idle();
    expect(reader).toHaveBeenCalledTimes(2);
  });
});

describe("a removal", () => {
  it("tells the stream once, and tells nothing for a line it cannot remove", async () => {
    const { flow, events } = setup();
    flow.heard(said("m1"));
    await flow.idle();
    expect(flow.remove("#bubble", "m1")).toBe(true);
    expect(events.slice(1)).toEqual([{ msgid: "m1", room: "#bubble", key: null }]);
    expect(flow.remove("#bubble", "m1")).toBe(false);
    expect(flow.remove("#bubble", "nothing")).toBe(false);
    expect(events).toHaveLength(2);
  });

  it("is not read again for a removed line heard once more: no reader call, even for a stale page", async () => {
    const { flow, reader, clock } = setup();
    flow.heard(said("m1"));
    await flow.idle();
    flow.remove("#bubble", "m1");
    clock.now = T0 + 25 * HOUR;
    flow.heard(said("m1"));
    flow.heard(said("m1", "https://other.example/b"));
    await flow.idle();
    expect(reader).toHaveBeenCalledTimes(1);
  });
});

describe("the queue's alerts are the cards'", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("alerts card_backlog when a line has waited 2 minutes behind a check that does not answer", async () => {
    vi.useFakeTimers();
    const { flow, logs } = setup({ verdict: () => new Promise<Answer>(() => undefined) });
    flow.heard(said("m1", "https://one.example/"));
    flow.heard(said("m2", "https://two.example/"));
    await vi.advanceTimersByTimeAsync(150_000);
    expect(logs).toContainEqual({ event: "alert", fields: { error: "card_backlog" } });
    flow.stop();
  });

  it("alerts card_queue_full when the queue holds 10,000 pages and one more comes", () => {
    const { flow, logs, clock } = setup({ verdict: () => new Promise<Answer>(() => undefined) });
    for (let n = 0; n < 10_002; n += 1) {
      clock.now = T0 + Math.floor(n / 50) * MINUTE;
      flow.heard(said(`m${String(n)}`, `https://h${String(n)}.example/`, { account: `g1acc${String(n)}` }));
    }
    expect(logs).toContainEqual({ event: "alert", fields: { error: "card_queue_full" } });
    flow.stop();
  });
});
