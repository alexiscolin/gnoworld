import type { DatabaseSync, StatementSync } from "node:sqlite";
import { openDatabase } from "@gnoworld/service/db";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { Said } from "../irc/link.ts";
import type { Typed } from "../rooms/types.ts";
import { makeSearch, SEARCH_TABLES } from "./index.ts";
import type { Query } from "./query.ts";

// Slice 13, B2: `query` of the index (docs/plans/search.md §3 B; B1's security review, "For B2 (binding)" 2, 4 and 6): the words are
// quoted, the room list and the match bound, `line_edits` never read, no `count(*)` or `OFFSET` without a bound.
const T0 = Date.parse("2026-11-11T12:00:00.000Z");
const ALICE = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
const BOB = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
const RULES = { bannedWords: [], linksPerMessage: 3, mentionsPerMessage: 5, linksForNewAccount: 2 };
const ROLES: Typed = { worlds: new Map([["bubble", { rules: RULES }]]) };

const opened: DatabaseSync[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const db of opened.splice(0)) if (db.isOpen) db.close();
});

const said = (msgid: string, over: Partial<Said> = {}): Said => ({
  room: "#bubble",
  account: ALICE,
  msgid,
  text: `the quorum of ${msgid}`,
  time: new Date(T0).toISOString(),
  ...over,
});

// The statements' own methods, taken before any spy replaces them.
const originals = new Map<string, (this: StatementSync, ...args: unknown[]) => unknown>();
const real = (method: string) => {
  const found = originals.get(method);
  if (found === undefined) throw new Error(`no ${method}`);
  return found;
};

function setup() {
  const db = openDatabase(":memory:", [SEARCH_TABLES]);
  opened.push(db);
  const search = makeSearch(db, { roles: ROLES, now: () => T0 });
  const ask = (over: Partial<Query> = {}) => search.query({ rooms: ["#bubble"], q: "quorum", limit: 21, ...over });
  const ids = (over: Partial<Query> = {}) => ask(over).rows.map(({ msgid }) => msgid);
  // The SQL of every statement run from now on (`sourceSQL`, node:sqlite): what a query really sends.
  const proto = Object.getPrototypeOf(db.prepare("SELECT 1")) as Record<
    string,
    (this: StatementSync, ...args: unknown[]) => unknown
  >;
  const sent: string[] = [];
  for (const method of ["all", "get", "run", "iterate"]) {
    originals.set(method, proto[method] as (this: StatementSync, ...args: unknown[]) => unknown);
    vi.spyOn(proto, method).mockImplementation(function (this: StatementSync, ...args: unknown[]) {
      sent.push(this.sourceSQL);
      return Reflect.apply(real(method), this, args);
    });
  }
  return { db, search, ask, ids, sent };
}

describe("what the index finds", () => {
  it("finds the lines of the rooms asked that hold every word, newest first, ties by row, with their fields", () => {
    const { search, ask } = setup();
    search.add(said("m1", { time: new Date(T0 - 2).toISOString(), text: "quorum https://gno.land", account: BOB }));
    search.add(said("m2", { time: new Date(T0).toISOString() }));
    search.add(said("m3", { time: new Date(T0).toISOString() }));
    search.add(said("x1", { room: "#bubble/news" }));
    const { rows, total, capped } = ask();
    expect(rows.map(({ msgid }) => msgid)).toEqual(["m3", "m2", "m1"]);
    expect(rows[2]).toMatchObject({
      room: "#bubble",
      account: BOB,
      at: T0 - 2,
      link: true,
      text: "quorum https://gno.land",
    });
    expect(rows[0]?.link).toBe(false);
    expect(typeof rows[0]?.rowid).toBe("number");
    expect([total, capped]).toEqual([3, false]);
  });

  it("holds the rooms asked to the lines of those rooms, and none for an empty list", () => {
    const { search, ids } = setup();
    search.add(said("m1"));
    search.add(said("m2", { room: "#bubble/news" }));
    expect(ids({ rooms: ["#bubble/news"] })).toEqual(["m2"]);
    expect(ids({ rooms: ["#bubble", "#bubble/news"] })).toEqual(["m2", "m1"]);
    expect(ids({ rooms: [] })).toEqual([]);
  });

  it("takes a room name with a quote or an operator as a name: nothing found, nothing thrown", () => {
    const { search, ids } = setup();
    search.add(said("m1"));
    expect(ids({ rooms: ["#a'b", '#a"b', "#bubble') OR 1=1 --"] })).toEqual([]);
  });

  it("starts after the cursor, the row (arrival order) as the pages are cut, and returns `limit` rows at most", () => {
    const { search, ask } = setup();
    for (let i = 0; i < 6; i++)
      search.add(said(`m${String(i)}`, { time: new Date(T0 + Math.floor(i / 2)).toISOString() }));
    const [first, second] = [ask({ limit: 3 }).rows, ask({ limit: 3 }).rows];
    expect(first.map(({ msgid }) => msgid)).toEqual(["m5", "m4", "m3"]);
    const last = second[2];
    const after = ask({ limit: 3, ...(last === undefined ? {} : { before: { rowid: last.rowid } }) });
    expect(after.rows.map(({ msgid }) => msgid)).toEqual(["m2", "m1", "m0"]);
  });

  it("filters by account, by link, and by a time range, together", () => {
    const { search, ids } = setup();
    search.add(said("m1", { account: ALICE, text: "quorum https://a.b", time: new Date(T0 - 10).toISOString() }));
    search.add(said("m2", { account: BOB, text: "quorum https://a.b", time: new Date(T0).toISOString() }));
    search.add(said("m3", { account: BOB, text: "quorum", time: new Date(T0).toISOString() }));
    expect([ids({ from: BOB }), ids({ link: true }), ids({ since: T0 - 5 }), ids({ until: T0 - 5 })]).toEqual([
      ["m3", "m2"],
      ["m2", "m1"],
      ["m3", "m2"],
      ["m1"],
    ]);
    expect(ids({ from: BOB, link: true, since: T0 - 5 })).toEqual(["m2"]);
  });

  it("counts to 1,000 and says there are more", () => {
    const { search, ask } = setup();
    for (let i = 0; i < 1100; i++) search.add(said(`m${String(i)}`, { time: new Date(T0 + i).toISOString() }));
    const { rows, total, capped } = ask();
    expect([rows.length, total, capped]).toEqual([21, 1000, true]);
  });

  it("takes the words as words: operators and column names find nothing they are not, and never throw", () => {
    const { search, ids } = setup();
    search.add(said("m1", { text: "the quorum is met" }));
    for (const q of ['"', "*", "NEAR(", "a OR", "x:y", "(", "-quorum", "^quorum", "{a b}", "quorum NOT"]) {
      expect(() => ids({ q })).not.toThrow();
    }
    expect(ids({ q: "text:quorum" })).toEqual([]);
    expect(ids({ q: "-quorum" })).toEqual(["m1"]);
    expect(ids({ q: "quor*" })).toEqual(["m1"]);
    expect(ids({ q: "**" })).toEqual([]);
    expect(ids({ q: "" })).toEqual([]);
  });
});

describe("the work is bounded by the asked world's lines (F13756, plan T3)", () => {
  // The `all` calls of a query: each statement's SQL and its bound values.
  const calls = (db: DatabaseSync, run: () => void): [string, ...unknown[]][] => {
    const seen: [string, ...unknown[]][] = [];
    const proto = Object.getPrototypeOf(db.prepare("SELECT 1")) as Record<
      string,
      (this: StatementSync, ...a: unknown[]) => unknown
    >;
    const all = real("all");
    vi.spyOn(proto, "all").mockImplementation(function (this: StatementSync, ...a: unknown[]) {
      seen.push([this.sourceSQL, ...a]);
      return Reflect.apply(all, this, a);
    });
    run();
    return seen;
  };
  const plan = (db: DatabaseSync, [sql, ...args]: [string, ...unknown[]]): string[] =>
    z
      .array(z.object({ detail: z.string() }))
      .parse(db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...(args as string[])))
      .map(({ detail }) => detail);

  it("starts the match from the asked world, and asks `lines` for the matches' rowids alone, never a scan of it", () => {
    const { search, db } = setup();
    search.add(said("m1"));
    const seen = calls(db, () => search.query({ rooms: ["#bubble"], q: "quorum", limit: 21 }));
    const [fts, lines] = [
      seen.find(([sql]) => sql.includes("lines_fts")),
      seen.find(([sql]) => sql.includes("FROM json_each(?) j")),
    ];
    expect(fts?.[1]).toBe('world : "bubble" AND text : ("quorum"*)');
    const detail = plan(db, lines ?? ["SELECT 1"]);
    expect(detail.filter((line) => /SCAN l\b|SCAN lines\b/.test(line))).toEqual([]);
    expect(detail.some((line) => /SEARCH l .*rowid=\?/i.test(line))).toBe(true);
  });

  it("takes the newest matches by the full-text row, newest first, with the bound inside that statement: no temp B-tree in its plan (F13770)", () => {
    const { search, db } = setup();
    search.add(said("m1"));
    const seen = calls(db, () => search.query({ rooms: ["#bubble"], q: "quorum", limit: 21, before: { rowid: 50 } }));
    const fts = seen.find(([sql]) => sql.includes("lines_fts"));
    expect(fts?.[0]).toContain("ORDER BY rowid DESC LIMIT 5001");
    expect(plan(db, fts ?? ["SELECT 1"]).filter((line) => /TEMP B-TREE/i.test(line))).toEqual([]);
  });

  it("holds `partial` for 5,001 matches and not for 5,000, and the filters then run over the newest 5,000 alone", () => {
    const { search, ask } = setup();
    const rooms = ["#bubble", "#bubble/a", "#bubble/b"];
    search.add(said("old", { account: BOB }));
    for (let i = 0; i < 4999; i++) search.add(said(`m${String(i)}`, { room: rooms[i % 3] ?? "" }));
    expect(ask({ rooms })).toMatchObject({ partial: false });
    expect(ask({ rooms, from: BOB }).rows.map(({ msgid }) => msgid)).toEqual(["old"]);
    search.add(said("m5000", { room: "#bubble" }));
    expect(ask({ rooms })).toMatchObject({ partial: true });
    expect(ask({ rooms, from: BOB })).toMatchObject({ rows: [], total: 0, partial: true });
  });

  it("takes a star only on a word of 3 characters or more: a shorter word is exact (F13770)", () => {
    const { search, db } = setup();
    search.add(said("m1", { text: "the quorum is met" }));
    const matches: unknown[] = [];
    const proto = Object.getPrototypeOf(db.prepare("SELECT 1")) as Record<
      string,
      (this: StatementSync, ...a: unknown[]) => unknown
    >;
    const all = real("all");
    vi.spyOn(proto, "all").mockImplementation(function (this: StatementSync, ...a: unknown[]) {
      if (this.sourceSQL.includes("lines_fts")) matches.push(a[0]);
      return Reflect.apply(all, this, a);
    });
    for (const q of ["qu quo quor", "a b c d e f g h", "go?"]) search.query({ rooms: ["#bubble"], q, limit: 21 });
    expect(matches).toEqual([
      'world : "bubble" AND text : ("qu" AND "quo"* AND "quor"*)',
      'world : "bubble" AND text : ("a" AND "b" AND "c" AND "d" AND "e" AND "f" AND "g" AND "h")',
      'world : "bubble" AND text : ("go?"*)',
    ]);
  });

  it("finds a 2-letter word whole and not as the start of a longer one", () => {
    const { search, ids } = setup();
    search.add(said("m1", { text: "the quorum is met" }));
    search.add(said("m2", { text: "qu is short" }));
    expect([ids({ q: "qu" }), ids({ q: "qu*" }), ids({ q: "quo" })]).toEqual([["m2"], ["m2"], ["m1"]]);
  });

  it("orders by arrival, newest arrival first, whatever the lines' own times: a late older line comes first", () => {
    const { search, ids } = setup();
    search.add(said("m1", { time: new Date(T0).toISOString() }));
    search.add(said("m2", { time: new Date(T0 - 5000).toISOString() }));
    expect(ids()).toEqual(["m2", "m1"]);
  });

  it("matches nothing of another world: the same word in 30 other worlds' lines is never a row of this one", () => {
    const { search, ids } = setup();
    for (let i = 0; i < 30; i++) search.add(said(`o${String(i)}`, { room: `#other${String(i)}` }));
    search.add(said("m1"));
    expect(ids({ rooms: ["#bubble"] })).toEqual(["m1"]);
  });

  it("returns each line once for a room named twice", () => {
    const { search, ids } = setup();
    search.add(said("m1"));
    expect(ids({ rooms: ["#bubble", "#bubble", "#bubble"] })).toEqual(["m1"]);
  });
});

describe("what the index sends to SQLite (B1 security, for B2: 2, 4 and 6)", () => {
  function sentBy(over: Partial<Query>) {
    const t = setup();
    t.search.add(said("m1", { text: "quorum zebra" }));
    t.search.add(said("m2", { text: "quorum" }));
    t.sent.length = 0;
    t.ask({ rooms: ["#bubble", "#bubble/zzroom"], q: 'zebra "x" NEAR(', limit: 21, ...over });
    return t.sent;
  }

  it("binds the match and the room list: neither the words nor a room name is in any SQL text", () => {
    const sent = sentBy({});
    expect(sent.length).toBeGreaterThan(0);
    for (const sql of sent) expect(sql).not.toMatch(/zebra|zzroom|#bubble|NEAR/);
  });

  it("never reads line_edits, whatever the filters", () => {
    const t = setup();
    t.search.add(said("m1", { text: "first words" }));
    t.search.edited(said("e1", { edits: "m1", text: "second words" }));
    t.sent.length = 0;
    t.ask({ q: "second", from: ALICE, link: false, since: 0, until: T0 + 1, before: { rowid: 99 } });
    t.ask({ q: "second" });
    expect(t.sent.length).toBeGreaterThan(0);
    expect(t.sent.filter((sql) => sql.includes("line_edits"))).toEqual([]);
  });

  it("pages by (time, row) and never by OFFSET, and bounds its count: no count(*) without a LIMIT", () => {
    const sent = sentBy({ before: { rowid: 99 } });
    expect(sent.filter((sql) => /offset/i.test(sql))).toEqual([]);
    const counting = sent.filter((sql) => /count\s*\(/i.test(sql));
    expect(counting.length).toBeGreaterThan(0);
    for (const sql of counting) expect(sql).toMatch(/limit/i);
  });
});

describe("a query with nothing to ask", () => {
  it.each([
    ["no word", { q: '** "' }],
    ["a room that names no world", { rooms: ["#"] }],
  ])("gives an empty page and sends no statement for %s", (_name, over) => {
    const { ask, sent } = setup();
    sent.length = 0;
    expect(ask(over)).toEqual({ rows: [], total: 0, capped: false, partial: false });
    expect(sent).toEqual([]);
  });
});
