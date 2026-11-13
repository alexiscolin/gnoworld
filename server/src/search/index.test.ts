import { mkdtempSync, existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { openDatabase } from "@gnoworld/service/db";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { Fetched, Said } from "../irc/link.ts";
import { migrations } from "../migrations.ts";
import type { Room } from "../roles/roles.ts";
import type { Typed } from "../rooms/types.ts";
import { makeSearch, MAX_EDITS, MAX_ROWS, ROOM_CAP, SEARCH_TABLES } from "./index.ts";
import { indexing } from "./wire.ts";

// Slice 13, B1 (D13917, D13924): the lines of the rooms a reader may open, for 90 days and 2,048 a room.
const DAY = 24 * 60 * 60_000;
const T0 = Date.parse("2026-11-11T12:00:00.000Z");
const ALICE = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
const BOB = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
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

const opened: DatabaseSync[] = [];
const folders: string[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) if (db.isOpen) db.close();
  for (const dir of folders.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const iso = (at: number): string => new Date(at).toISOString();
const said = (msgid: string, over: Partial<Said> = {}): Said => ({
  room: "#bubble",
  account: ALICE,
  msgid,
  text: `text of ${msgid}`,
  time: iso(T0),
  ...over,
});

// A line with no time, as a relayed guest's is.
const without = (msgid: string, over: Partial<Said> = {}): Said => {
  const line: Said = { ...said(msgid, over) };
  delete line.time;
  return line;
};

const setup = ({ maxRows, file }: { maxRows?: number; file?: string } = {}) => {
  const db = openDatabase(file ?? ":memory:", [SEARCH_TABLES]);
  opened.push(db);
  const clock = { now: T0 };
  const search = makeSearch(db, { roles: ROLES, now: () => clock.now, ...(maxRows === undefined ? {} : { maxRows }) });
  const Ids = z.array(z.object({ msgid: z.string() }));
  // What the index finds for a word, as the route will: through the full-text table, by line.
  const found = (word: string): string[] =>
    Ids.parse(
      db
        .prepare(
          "SELECT l.msgid FROM lines_fts JOIN lines l ON l.rowid = lines_fts.rowid WHERE lines_fts MATCH ? ORDER BY l.msgid",
        )
        .all(`"${word}"`),
    ).map(({ msgid }) => msgid);
  const Rows = z.array(
    z.object({ room: z.string(), msgid: z.string(), account: z.string(), at: z.number(), text: z.string() }),
  );
  const rows = () => Rows.parse(db.prepare("SELECT room, msgid, account, at, text FROM lines ORDER BY msgid").all());
  const check = (): void => {
    // External-content FTS5: throws when its index and the lines table differ.
    db.exec("INSERT INTO lines_fts(lines_fts) VALUES('integrity-check')");
  };
  return { db, clock, search, found, rows, check };
};

describe("what enters the index (passedLines is the single entry)", () => {
  it("holds a line of an open room with its room, id, account, time and text, findable by a word", () => {
    const { search, rows, found } = setup();
    search.add(said("m1", { text: "the quorum is met" }));
    expect(rows()).toEqual([{ room: "#bubble", msgid: "m1", account: ALICE, at: T0, text: "the quorum is met" }]);
    expect([found("quorum"), found("QUORUM")]).toEqual([["m1"], ["m1"]]);
  });

  it("finds a word with its accent removed, and the accent when it is typed (unicode61, remove_diacritics 2, Q3)", () => {
    const { search, found } = setup();
    search.add(said("m1", { text: "un café, merci" }));
    expect([found("cafe"), found("café")]).toEqual([["m1"], ["m1"]]);
  });

  it("holds an announcement room's and an accounts room's lines, which a guest or an account may read", () => {
    const { search, rows } = setup();
    search.add(said("m1", { room: "#bubble/news" }));
    search.add(said("m2", { room: "#bubble/club" }));
    expect(rows().map(({ msgid }) => msgid)).toEqual(["m1", "m2"]);
  });

  it("holds no line of a members room, nor of a hidden room (D13924: only what a reader can open)", () => {
    const { search } = setup();
    search.add(said("m1", { room: "#bubble/crew" }));
    search.add(said("m2", { room: "#bubble/secret" }));
    expect(search.size()).toBe(0);
  });

  it("holds no line said to a room's operators alone (few), which the room is never shown", () => {
    const { search } = setup();
    search.add(said("m1", { few: true }));
    expect(search.size()).toBe(0);
  });

  it("holds no direct message: a Said whose room is no #room (Ergo keeps no DM history, the index must still refuse)", () => {
    const { search } = setup();
    for (const room of ["alice", "gnoworld", "", "bubble"]) search.add(said(`m${room}`, { room }));
    expect(search.size()).toBe(0);
  });

  it("holds an edit as no new line: only edited() takes it", () => {
    const { search } = setup();
    search.add(said("m1"));
    search.add(said("m2", { edits: "m1", text: "replaced" }));
    expect(search.size()).toBe(1);
  });

  it("holds a line once when the catch-up hands it again, the first text standing", () => {
    const { search, rows } = setup();
    search.add(said("m1", { text: "first" }));
    search.add(said("m1", { text: "second" }));
    expect(rows().map(({ text }) => text)).toEqual(["first"]);
  });

  it("takes the line's time when it has one, the clock's when it has none", () => {
    const { search, rows, clock } = setup();
    clock.now = T0 + 5_000;
    search.add(said("m1", { time: iso(T0 - DAY) }));
    search.add(without("m2"));
    expect(rows().map(({ at }) => at)).toEqual([T0 - DAY, T0 + 5_000]);
  });

  it("holds the bot's relayed guest line as the stream shows it: the room, the anon nick as the account, the text", () => {
    const { search, rows } = setup();
    search.add(without("m1", { account: "anon/blue-fox-ab2c", text: "hello from outside" }));
    expect(rows()).toEqual([
      { room: "#bubble", msgid: "m1", account: "anon/blue-fox-ab2c", at: T0, text: "hello from outside" },
    ]);
  });
});

describe("erasure: a line that leaves its room leaves the index and its full-text table", () => {
  it("finds a removed line (REDACT: its author's delete or a hide) no more, by its words or its id", () => {
    const { search, found, rows, check } = setup();
    search.add(said("m1", { text: "regrettable words" }));
    search.add(said("m2", { text: "kept words" }));
    search.remove("#bubble", "m1");
    expect([found("regrettable"), found("words"), rows().map(({ msgid }) => msgid)]).toEqual([[], ["m2"], ["m2"]]);
    check();
  });

  it("removes a line of its own room alone: the same id asked for in another room takes nothing", () => {
    const { search } = setup();
    search.add(said("m1"));
    search.remove("#bubble/news", "m1");
    expect(search.size()).toBe(1);
  });

  it("removes a line it does not hold without an error", () => {
    const { search } = setup();
    expect(() => {
      search.remove("#bubble", "nothing");
    }).not.toThrow();
  });

  it("replaces the text of a line its own author edits: one row, the old words no more findable", () => {
    const { search, found, rows, check } = setup();
    search.add(said("m1", { text: "a typo here: teh" }));
    search.edited(said("m2", { edits: "m1", text: "a fix here: the" }));
    expect([rows().map(({ text }) => text), found("teh"), found("fix")]).toEqual([["a fix here: the"], [], ["m1"]]);
    check();
  });

  it("keeps the line's own time and account when its author edits it", () => {
    const { search, rows, clock } = setup();
    search.add(said("m1"));
    clock.now = T0 + DAY;
    search.edited(said("m2", { edits: "m1", text: "new", time: iso(T0 + DAY) }));
    expect(rows().map(({ account, at }) => [account, at])).toEqual([[ALICE, T0]]);
  });

  it("changes nothing for another account's edit: the old text stays, the new is not found, no row is added", () => {
    const { search, rows, found } = setup();
    search.add(said("m1", { text: "mine" }));
    search.edited(said("m2", { edits: "m1", account: BOB, text: "forged" }));
    expect([rows().map(({ text }) => text), found("forged")]).toEqual([["mine"], []]);
  });

  it("adds no row for an edit of a line it does not hold", () => {
    const { search } = setup();
    search.edited(said("m2", { edits: "unknown", text: "orphan" }));
    expect(search.size()).toBe(0);
  });

  it("holds no edit into a room the index does not hold: a members room's line is not made findable by an edit", () => {
    const { search } = setup();
    search.edited(said("m2", { room: "#bubble/crew", edits: "m1", text: "private" }));
    expect(search.size()).toBe(0);
  });
});

describe("the tables: the full-text table never differs from the lines", () => {
  it("keeps both equal after an insert, an update and a delete of a line", () => {
    const db = openDatabase(":memory:", [SEARCH_TABLES]);
    opened.push(db);
    const check = (): void => {
      db.exec("INSERT INTO lines_fts(lines_fts) VALUES('integrity-check')");
    };
    const count = (table: string): number =>
      z.object({ n: z.number() }).parse(db.prepare(`SELECT count(*) AS n FROM ${table}`).get()).n;
    db.exec(
      "INSERT INTO lines (room, world, msgid, account, at, link, text) VALUES ('#bubble', 'bubble', 'm1', 'a', 1, 0, 'alpha one')",
    );
    check();
    expect([count("lines"), count("lines_fts_docsize")]).toEqual([1, 1]);
    db.exec("UPDATE lines SET text = 'beta two' WHERE msgid = 'm1'");
    check();
    const hits = (word: string): number =>
      z
        .object({ n: z.number() })
        .parse(db.prepare("SELECT count(*) AS n FROM lines_fts WHERE lines_fts MATCH ?").get(word)).n;
    expect([hits("alpha"), hits("beta"), count("lines_fts_docsize")]).toEqual([0, 1, 1]);
    db.exec("DELETE FROM lines WHERE msgid = 'm1'");
    check();
    expect([hits("beta"), count("lines"), count("lines_fts_docsize")]).toEqual([0, 0, 0]);
  });

  it("is made by a migration appended after the existing ones, once", () => {
    expect(migrations.filter((each) => each === SEARCH_TABLES)).toHaveLength(1);
    expect(migrations.indexOf(SEARCH_TABLES)).toBeGreaterThan(21);
  });

  it("migrates a database at the version before it, keeping what it held", () => {
    const at = migrations.indexOf(SEARCH_TABLES);
    expect(at).toBeGreaterThan(21);
    const dir = mkdtempSync(join(tmpdir(), "gnoworld-search-"));
    folders.push(dir);
    const file = join(dir, "server.db");
    const before = openDatabase(file, migrations.slice(0, at));
    before.exec(
      "INSERT INTO pins (room, msgid, time, account, text, pinned_by, pinned_at) VALUES ('#a', 'm', 't', 'a', 'x', 'm', 1)",
    );
    before.close();
    const after = openDatabase(file, migrations);
    opened.push(after);
    const n = (sql: string): unknown => after.prepare(sql).get();
    expect([
      n("SELECT count(*) AS n FROM pins"),
      n("SELECT count(*) AS n FROM lines"),
      n("PRAGMA user_version"),
    ]).toEqual([{ n: 1 }, { n: 0 }, { user_version: migrations.length }]);
  });
});

describe("the bounds", () => {
  it("keeps a room's 2,048 newest lines, the oldest going first, and no other room's", () => {
    const { search, rows, check } = setup();
    search.add(said("n0", { room: "#bubble/news", time: iso(T0 - DAY) }));
    for (let i = 0; i < 2050; i += 1) search.add(said(`m${String(i).padStart(4, "0")}`, { time: iso(T0 + i) }));
    const room = rows()
      .filter(({ room }) => room === "#bubble")
      .map(({ msgid }) => msgid);
    expect([
      room.length,
      room.includes("m0000"),
      room.includes("m0001"),
      room.includes("m0002"),
      room.includes("m2049"),
    ]).toEqual([2048, false, false, true, true]);
    expect(rows().some(({ msgid }) => msgid === "n0")).toBe(true);
    check();
  });

  it("keeps a full room's newest when an older line comes in late: the late line is the one dropped", () => {
    const { search, rows } = setup();
    for (let i = 0; i < 2048; i += 1) search.add(said(`m${String(i).padStart(4, "0")}`, { time: iso(T0 + i) }));
    search.add(said("late", { time: iso(T0 - DAY) }));
    expect([
      search.size(),
      rows().some(({ msgid }) => msgid === "late"),
      rows().some(({ msgid }) => msgid === "m0000"),
    ]).toEqual([2048, false, true]);
  });

  it("drops at the tick the lines older than 90 days, and keeps one exactly 90 days old", () => {
    const { search, rows, clock } = setup();
    search.add(said("old", { time: iso(T0 - 90 * DAY - 1) }));
    search.add(said("edge", { time: iso(T0 - 90 * DAY) }));
    search.add(said("new"));
    expect(search.expire(500)).toBe(1);
    expect(rows().map(({ msgid }) => msgid)).toEqual(["edge", "new"]);
    clock.now = T0 + 1;
    expect(search.expire(500)).toBe(1);
    expect(rows().map(({ msgid }) => msgid)).toEqual(["new"]);
  });

  it("drops the oldest lines past the row cap, whatever their room, and none within it", () => {
    const { search, rows, check } = setup({ maxRows: 5 });
    for (let i = 0; i < 8; i += 1)
      search.add(said(`m${String(i)}`, { room: i % 2 === 0 ? "#bubble" : "#bubble/news", time: iso(T0 + i) }));
    expect(search.expire(500)).toBe(3);
    expect(rows().map(({ msgid }) => msgid)).toEqual(["m3", "m4", "m5", "m6", "m7"]);
    expect(search.expire(500)).toBe(0);
    check();
  });

  it("never removes more than the batch asked, the rest left for the next tick", () => {
    const { search, check } = setup();
    for (let i = 0; i < 12; i += 1) search.add(said(`m${String(i)}`, { time: iso(T0 - 91 * DAY + i) }));
    expect([
      search.expire(0),
      search.expire(5),
      search.size(),
      search.expire(5),
      search.size(),
      search.expire(5),
      search.size(),
    ]).toEqual([0, 5, 7, 5, 2, 2, 0]);
    check();
  });
});

describe("no trace of a removed text on disk (secure_delete, T2)", () => {
  const MARK = "zxqvmarker";
  // The file as a reader of the disk would see it once the write-ahead log is folded in and the database closed.
  const onDisk = (db: DatabaseSync, file: string): boolean => {
    db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    db.close();
    return [file, `${file}-wal`].some(
      (path) => existsSync(path) && readFileSync(path).toString("latin1").includes(MARK),
    );
  };
  const disk = (maxRows?: number) => {
    const dir = mkdtempSync(join(tmpdir(), "gnoworld-search-"));
    folders.push(dir);
    const file = join(dir, "server.db");
    const made = setup({ file, ...(maxRows === undefined ? {} : { maxRows }) });
    // Many lines, so the removed one sits in an older full-text segment, as in a real room.
    for (let i = 0; i < 600; i += 1)
      made.search.add(said(`f${String(i)}`, { text: `filler number ${String(i)} lorem ipsum` }));
    made.search.add(said("secret", { text: `${MARK} unique words` }));
    made.db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    return { ...made, file };
  };

  it("leaves none of a removed line's text in the database file", () => {
    const { db, file, search } = disk();
    search.remove("#bubble", "secret");
    expect(onDisk(db, file)).toBe(false);
  });

  it("leaves none of the old text of an edited line in the file", () => {
    const { db, file, search } = disk();
    search.edited(said("m9", { edits: "secret", text: "corrected" }));
    expect(onDisk(db, file)).toBe(false);
  });

  it("leaves none of an expired line's text in the file", () => {
    const { db, file, search, clock } = disk();
    clock.now = T0 + 91 * DAY;
    search.expire(10_000);
    expect(onDisk(db, file)).toBe(false);
  });

  it("leaves none of a line's text after a second edit, a REDACT of its edit, or the reconcile dropping it", async () => {
    const { db, file, search } = disk();
    search.edited(said("m8", { edits: "secret", text: "kept words" }));
    search.edited(said("m9", { edits: "secret", text: "later words" }));
    search.remove("#bubble", "m8");
    await search.reconcile("#bubble", () => Promise.resolve("gone"));
    expect(onDisk(db, file)).toBe(false);
  });

  it("leaves none of the text a room's cap pushed out", () => {
    const { db, file, search } = disk();
    for (let i = 0; i < 2048; i += 1) search.add(said(`n${String(i)}`, { time: iso(T0 + 10 + i) }));
    expect(onDisk(db, file)).toBe(false);
  });

  it("leaves none of the text a row-cap eviction took", () => {
    const { db, file, search, clock } = disk(1);
    search.add(said("last", { time: iso(T0 + 10) }));
    clock.now = T0 + 1;
    search.expire(10_000);
    expect(onDisk(db, file)).toBe(false);
  });

  it("proves its own probe: the text of a line still held is in the file", () => {
    const { db, file } = disk();
    expect(onDisk(db, file)).toBe(true);
  });
});

describe("the reconcile at the link's JOIN (Q6): a line Ergo no longer lists is dropped", () => {
  const ask = (answers: Record<string, Fetched>) =>
    vi.fn((_room: string, msgid: string): Promise<Fetched> => Promise.resolve(answers[msgid] ?? "unanswered"));

  it("drops the lines Ergo says it holds none of, keeps those it holds and those it did not answer", async () => {
    const { search, rows, check } = setup();
    for (const id of ["gone", "held", "silent"]) search.add(said(id));
    await search.reconcile("#bubble", ask({ gone: "gone", held: said("held") }));
    expect(rows().map(({ msgid }) => msgid)).toEqual(["held", "silent"]);
    check();
  });

  it("asks of its own room alone", async () => {
    const { search } = setup();
    search.add(said("a"));
    search.add(said("b", { room: "#bubble/news" }));
    const fetch = ask({ a: "gone", b: "gone" });
    await search.reconcile("#bubble", fetch);
    expect(fetch.mock.calls.map(([room, msgid]) => `${room} ${msgid}`)).toEqual(["#bubble a"]);
    expect(search.size()).toBe(1);
  });

  it("asks a room's lines oldest first, one at a time", async () => {
    const { search } = setup();
    for (const [id, at] of [
      ["c", 3],
      ["a", 1],
      ["b", 2],
    ] as const)
      search.add(said(id, { time: iso(T0 + at) }));
    const asked: string[] = [];
    await search.reconcile("#bubble", (_room, msgid) => {
      asked.push(msgid);
      return Promise.resolve("unanswered");
    });
    expect(asked).toEqual(["a", "b", "c"]);
  });

  it("counts an answer for another room or another id as a line Ergo does not hold (pins.ts's rule)", async () => {
    const { search, rows } = setup();
    for (const id of ["a", "b", "c"]) search.add(said(id));
    const answers: Record<string, Fetched> = {
      a: said("other"),
      b: said("b", { room: "#bubble/news" }),
      c: said("c"),
    };
    await search.reconcile("#bubble", (_room, msgid) => Promise.resolve(answers[msgid] ?? "unanswered"));
    expect(rows().map(({ msgid }) => msgid)).toEqual(["c"]);
  });

  it("leaves the rest as it is when Ergo's answer fails, and tells the error", async () => {
    const { search } = setup();
    search.add(said("a"));
    search.add(said("b"));
    const fetch = vi.fn((_room: string, msgid: string): Promise<Fetched> =>
      msgid === "b" ? Promise.reject(new Error("link down")) : Promise.resolve("gone"),
    );
    await expect(search.reconcile("#bubble", fetch)).rejects.toThrow("link down");
    expect(search.size()).toBe(1);
  });
});

describe("a line taken or corrected before it came in never comes in (F5109, F5270: the bot's check is asynchronous)", () => {
  it("holds no line a REDACT took while it waited, and holds the same id of another room", () => {
    const { search, rows } = setup();
    search.remove("#bubble", "m1");
    search.add(said("m1"));
    expect(search.size()).toBe(0);
    search.add(said("m1", { room: "#bubble/news" }));
    expect(rows().map(({ room }) => room)).toEqual(["#bubble/news"]);
  });

  it("holds no line its author edited while it waited, and a line another account's edit named comes in", () => {
    const { search, rows } = setup();
    search.edited(said("m2", { edits: "m1", text: "corrected" }));
    search.add(said("m1"));
    search.edited(said("m4", { edits: "m3", account: BOB, text: "forged" }));
    search.add(said("m3"));
    expect(rows().map(({ msgid }) => msgid)).toEqual(["m3"]);
  });

  it("remembers a bounded number of them, the oldest forgotten first", () => {
    const { search } = setup();
    for (let i = 0; i < 2100; i += 1) search.remove("#bubble", `x${String(i)}`);
    search.add(said("x0"));
    search.add(said("x2099"));
    expect(search.size()).toBe(1);
  });
});

describe("an edit and a REDACT name the line as the chat folds them (foldEdits, F13705)", () => {
  it("shows the newest edit of the same author's, and no word of the original or of an earlier edit", () => {
    const { search, found, rows, check } = setup();
    search.add(said("m1", { text: "alpha original" }));
    search.edited(said("m2", { edits: "m1", text: "bravo second" }));
    search.edited(said("m3", { edits: "m1", text: "charlie third" }));
    expect([rows().map(({ text }) => text), found("alpha"), found("bravo"), found("charlie")]).toEqual([
      ["charlie third"],
      [],
      [],
      ["m1"],
    ]);
    check();
  });

  it("takes an edit that names an edit's id for no correction: the text stays", () => {
    const { search, rows, found } = setup();
    search.add(said("m1", { text: "alpha original" }));
    search.edited(said("m2", { edits: "m1", text: "bravo second" }));
    search.edited(said("m3", { edits: "m2", text: "charlie third" }));
    expect([rows().map(({ text }) => text), found("charlie")]).toEqual([["bravo second"], []]);
  });

  it("drops the row when the original is taken after an edit: no word of either text", () => {
    const { search, found, check } = setup();
    search.add(said("m1", { text: "alpha original" }));
    search.edited(said("m2", { edits: "m1", text: "bravo second" }));
    search.remove("#bubble", "m1");
    expect([search.size(), found("alpha"), found("bravo")]).toEqual([0, [], []]);
    check();
  });

  it("drops the row when any edit of it is taken, a moderator's hide or its author's own delete of it", () => {
    const { search, found, check } = setup();
    for (const [line, first, second] of [
      ["a1", "a2", "a3"],
      ["b1", "b2", "b3"],
    ] as const) {
      search.add(said(line, { text: `${line} original` }));
      search.edited(said(first, { edits: line, text: `${first} words` }));
      search.edited(said(second, { edits: line, text: `${second} words` }));
    }
    search.remove("#bubble", "a3");
    search.remove("#bubble", "b2");
    expect([search.size(), found("a1"), found("b1"), found("a3"), found("b3")]).toEqual([0, [], [], [], []]);
    check();
  });

  it("keeps the corrected line's id for a later REDACT of the edit only in its own room", () => {
    const { search } = setup();
    search.add(said("m1"));
    search.edited(said("m2", { edits: "m1", text: "next" }));
    search.remove("#bubble/news", "m2");
    expect(search.size()).toBe(1);
  });
});

describe("what an edit may change", () => {
  it("refuses an edit heard after a REDACT of that edit's own id: the line keeps its text", () => {
    const { search, rows, found } = setup();
    search.add(said("m1", { text: "alpha original" }));
    search.remove("#bubble", "m2");
    search.edited(said("m2", { edits: "m1", text: "bravo taken" }));
    expect([rows().map(({ text }) => text), found("bravo")]).toEqual([["alpha original"], []]);
  });

  it("changes nothing for an edit naming a line of another room, nor one said to the operators alone", () => {
    const { search, rows } = setup();
    search.add(said("m1", { text: "public words" }));
    search.edited(said("m2", { room: "#bubble/news", edits: "m1", text: "elsewhere" }));
    search.edited(said("m3", { edits: "m1", few: true, text: "whispered" }));
    expect(rows().map(({ text }) => text)).toEqual(["public words"]);
  });
});

describe("a malformed time and odd text", () => {
  it("falls back to the clock for a time that is no date", () => {
    const { search, rows } = setup();
    search.add(said("m1", { time: "" }));
    search.add(said("m2", { time: "garbage" }));
    expect(rows().map(({ at }) => at)).toEqual([T0, T0]);
  });

  it("holds a line with a quote, a double quote, a NUL or a CTCP ACTION as sent, and finds its words", () => {
    const { search, rows, found } = setup();
    const texts = ['it\'s "quoted" text', "nul\u0000inside words", "\u0001ACTION waves hello\u0001"];
    texts.forEach((text, i) => {
      search.add(said(`m${String(i)}`, { text }));
    });
    expect([rows().map(({ text }) => text), found("quoted"), found("hello")]).toEqual([texts, ["m0"], ["m2"]]);
  });
});

describe("the link flag", () => {
  it("is 1 for a text with an http or https address, and 0 otherwise, an edit included", () => {
    const { search, db } = setup();
    const flags = () =>
      z
        .array(z.object({ link: z.number() }))
        .parse(db.prepare("SELECT link FROM lines ORDER BY msgid").all())
        .map(({ link }) => link);
    search.add(said("m1", { text: "see https://gno.land now" }));
    search.add(said("m2", { text: "see gno.land and https:// alone" }));
    search.add(said("m3", { text: "plain" }));
    expect(flags()).toEqual([1, 0, 0]);
    search.edited(said("m4", { edits: "m3", text: "now http://x.io" }));
    expect(flags()).toEqual([1, 0, 1]);
  });
});

describe("the constants", () => {
  it("are a room's 2,048 lines, as Ergo's channel-length keeps, and 400,000 lines in all", () => {
    expect([ROOM_CAP, MAX_ROWS]).toEqual([2048, 400_000]);
  });

  it("break a room's cap's tie on the time by the order the lines came in", () => {
    const { search, rows } = setup();
    for (let i = 0; i < 2050; i += 1) search.add(said(`m${String(i).padStart(4, "0")}`));
    const ids = rows().map(({ msgid }) => msgid);
    expect([ids.length, ids.includes("m0000"), ids.includes("m0001"), ids.includes("m0002")]).toEqual([
      2048,
      false,
      false,
      true,
    ]);
  });
});

describe("expiry order under a limit", () => {
  it("takes the oldest lines over the cap first, a limit at a time", () => {
    const { search, rows } = setup({ maxRows: 5 });
    for (let i = 0; i < 8; i += 1) search.add(said(`m${String(i)}`, { time: iso(T0 + i) }));
    expect([search.expire(2), rows().map(({ msgid }) => msgid)]).toEqual([2, ["m2", "m3", "m4", "m5", "m6", "m7"]]);
    expect([search.expire(1), rows().map(({ msgid }) => msgid)]).toEqual([1, ["m3", "m4", "m5", "m6", "m7"]]);
  });

  it("takes the lines older than 90 days before the lines over the cap, in one limit", () => {
    const { search, rows } = setup({ maxRows: 3 });
    search.add(said("old", { time: iso(T0 - 91 * DAY) }));
    for (let i = 0; i < 4; i += 1) search.add(said(`m${String(i)}`, { time: iso(T0 + i) }));
    expect([search.expire(2), rows().map(({ msgid }) => msgid)]).toEqual([2, ["m1", "m2", "m3"]]);
  });
});

// H1 of the security review: a room that leaves the searchable set after its lines were indexed.
describe("a room that became hidden or members after its lines were indexed (F13700)", () => {
  const HIDDEN: Typed = {
    worlds: new Map([
      [
        "bubble",
        {
          rules: RULES,
          rooms: new Map([["#bubble/news", { type: "announcement" as const, hidden: true }]]),
        },
      ],
    ]),
  };
  const MEMBERS: Typed = {
    worlds: new Map([
      [
        "bubble",
        {
          rules: RULES,
          groups: new Map(),
          rooms: new Map([["#bubble/news", { type: "members" as const, readers: "crew", hidden: false }]]),
        },
      ],
    ]),
  };
  const indexed = (roles: Typed) => {
    const made = setup();
    made.search.add(said("m1", { room: "#bubble/news", text: "doxxed address words" }));
    made.search.add(said("m2", { room: "#bubble/news", text: "other words" }));
    const later = makeSearch(made.db, { roles, now: () => T0 });
    return { ...made, later };
  };

  it("drops the row and its words when a REDACT is heard in it", () => {
    for (const roles of [HIDDEN, MEMBERS]) {
      const { later, found, rows, check } = indexed(roles);
      later.remove("#bubble/news", "m1");
      expect([rows().map(({ msgid }) => msgid), found("doxxed")]).toEqual([["m2"], []]);
      check();
      opened.pop()?.close();
    }
  });

  it("replaces the text when the author edits it, so the old words are no more findable", () => {
    const { later, found, rows } = indexed(HIDDEN);
    later.edited(said("e1", { room: "#bubble/news", edits: "m1", text: "corrected" }));
    expect([rows().map(({ text }) => text), found("doxxed")]).toEqual([["corrected", "other words"], []]);
  });

  it("drops every line of the room at its reconcile, asking Ergo nothing", async () => {
    const { later, rows, found } = indexed(HIDDEN);
    const fetch = vi.fn((): Promise<Fetched> => Promise.resolve("unanswered"));
    await later.reconcile("#bubble/news", fetch);
    expect([rows(), found("words"), fetch.mock.calls.length]).toEqual([[], [], 0]);
  });
});

describe("the edits a line carries are bounded (F13701)", () => {
  it("drops the row at the 51st edit, and the edits' own rows with it", () => {
    const { search, db, found, check } = setup();
    search.add(said("m1", { text: "alpha original" }));
    for (let i = 0; i < MAX_EDITS; i += 1)
      search.edited(said(`e${String(i)}`, { edits: "m1", text: `edit ${String(i)}` }));
    expect(search.size()).toBe(1);
    search.edited(said("last", { edits: "m1", text: "one edit too many" }));
    const left = z.object({ n: z.number() }).parse(db.prepare("SELECT count(*) AS n FROM line_edits").get()).n;
    expect([search.size(), left, found("alpha"), found("many")]).toEqual([0, 0, [], []]);
    check();
  });
});

describe("a flood of edits naming no line never evicts a REDACT's mark (F13703)", () => {
  it("keeps a taken id out of the index after 2,100 edits of unknown lines", () => {
    const { search } = setup();
    search.remove("#bubble", "taken");
    for (let i = 0; i < 2100; i += 1) search.edited(said(`e${String(i)}`, { edits: `unknown${String(i)}`, text: "x" }));
    search.add(said("taken"));
    expect(search.size()).toBe(0);
  });
});

describe("the reconciles of the link's joins go one question at a time (F13702)", () => {
  it("asks Ergo for one line at a time though several rooms join together", async () => {
    const { search } = setup();
    for (const room of ["#bubble", "#bubble/news", "#bubble/club"])
      for (const id of ["a", "b"]) search.add(said(`${room}${id}`, { room }));
    let now = 0;
    let most = 0;
    const line = (): Promise<Fetched> => {
      now += 1;
      most = Math.max(most, now);
      return new Promise((resolve) => {
        setTimeout(() => {
          now -= 1;
          resolve("unanswered");
        }, 2);
      });
    };
    const recent = { passed: () => undefined, taken: () => undefined };
    const { kept } = indexing(search, () => undefined, { recent, link: () => ({ line }) as never });
    const joined = kept({ hooks: { onIn: vi.fn<(room: string) => void>() } });
    for (const room of ["#bubble", "#bubble/news", "#bubble/club"]) joined.hooks.onIn(room);
    await vi.waitFor(
      () => {
        expect(now).toBe(0);
        expect(most).toBe(1);
      },
      { timeout: 500 },
    );
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect([most, now]).toEqual([1, 0]);
  });
});

describe("the expiry's walk (F13706)", () => {
  it("goes by an index on the time, not a scan of every line and a sort", () => {
    const { db } = setup();
    const plan = z
      .array(z.object({ detail: z.string() }))
      .parse(
        db.prepare("EXPLAIN QUERY PLAN SELECT rowid FROM lines WHERE at < ? ORDER BY at, rowid LIMIT ?").all(0, 5),
      );
    expect(plan.map(({ detail }) => detail).join(" ")).toContain("lines_by_at");
  });
});

// The surviving mutants of the day (slice 13): each test is named after the fault it guards.
describe("what the index remembers of a room it does not hold", () => {
  const crewOnly = () => {
    const rooms = new Map<string, Room>([["#bubble/club", { type: "members", readers: "crew", hidden: false }]]);
    const roles: Typed = { worlds: new Map([["bubble", { rules: RULES, groups: new Map(), rooms }]]) };
    const db = openDatabase(":memory:", [SEARCH_TABLES]);
    opened.push(db);
    const search = makeSearch(db, { roles, now: () => T0 });
    const open = (): void => {
      rooms.set("#bubble/club", { type: "open", hidden: false });
    };
    return { search, open };
  };

  it("keeps no mark of a delete heard while the room is not held: the line, once the room is, is held", () => {
    const { search, open } = crewOnly();
    search.remove("#bubble/club", "m1");
    open();
    search.add(said("m1", { room: "#bubble/club" }));
    expect(search.size()).toBe(1);
  });

  it("keeps no mark of an edit heard while the room is not held: the line, once the room is, is held", () => {
    const { search, open } = crewOnly();
    search.edited(said("m2", { room: "#bubble/club", edits: "m1", text: "new words" }));
    open();
    search.add(said("m1", { room: "#bubble/club" }));
    expect(search.size()).toBe(1);
  });
});

describe("edited and expire, at their edges", () => {
  it("does nothing for a line that is no edit", () => {
    const { search } = setup();
    search.add(said("m1"));
    expect(() => {
      search.edited(said("m1", { text: "other words" }));
    }).not.toThrow();
    expect(search.size()).toBe(1);
  });

  it("takes at most `limit` rows in all: the rows past 90 days count against it before the rows over the cap", () => {
    const { search } = setup({ maxRows: 1 });
    search.add(said("old", { time: iso(T0 - 91 * DAY) }));
    for (const id of ["a", "b", "c", "d"]) search.add(said(id));
    expect(search.expire(3)).toBe(3);
    expect(search.size()).toBe(2);
  });
});
