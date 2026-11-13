import type { DatabaseSync } from "node:sqlite";
import { Address } from "@gnoworld/schemas";
import { openDatabase } from "@gnoworld/service/db";
import { afterEach, describe, expect, it } from "vitest";
import type { Said } from "../irc/link.ts";
import type { Room } from "../roles/roles.ts";
import { makeSearch, SEARCH_TABLES, type Search } from "../search/index.ts";
import type { Typed } from "../rooms/types.ts";
import { makeUnread, UNREAD_TABLES } from "./store.ts";

// Each world's unread pill: the server's copy of the places Ergo confirmed, counted against the search index's lines.
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const T0 = Date.parse("2026-11-13T12:00:00.000Z");
const ALICE = Address.parse("g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv");
const BOB = Address.parse("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5");
const CAROL = Address.parse("g1m68zzc430znqyxzv6jsfz45hgccacx3mk6qajw");
const RULES = { bannedWords: [], linksPerMessage: 3, mentionsPerMessage: 5, linksForNewAccount: 2 };

const opened: DatabaseSync[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) if (db.isOpen) db.close();
});

function setup() {
  const rooms = new Map<string, Room>([
    ["#bubble/club", { type: "accounts", hidden: false }],
    ["#bubble/crew", { type: "members", readers: "crew", hidden: false }],
  ]);
  const roles: Typed = {
    team: new Set(),
    worlds: new Map([["bubble", { rules: RULES, groups: new Map([["crew", new Set([ALICE])]]), rooms }]]),
  };
  const db = openDatabase(":memory:", [SEARCH_TABLES, UNREAD_TABLES]);
  opened.push(db);
  const clock = { now: T0 };
  const archived = new Set<string>();
  const missing = new Set<string>();
  const search: Search = makeSearch(db, { roles, now: () => clock.now });
  const unread = makeUnread(db, {
    roles,
    archived: (room) => archived.has(room),
    exists: (room) => !missing.has(room),
    now: () => clock.now,
  });
  let serial = 0;
  const line = (room: string, account: string, at: number): string => {
    serial += 1;
    const msgid = `m${String(serial)}`;
    const said: Said = { room, account, msgid, text: `word ${msgid}`, time: new Date(at).toISOString() };
    search.add(said);
    return msgid;
  };
  const rows = (account?: string): number =>
    Number(
      (account === undefined
        ? db.prepare("SELECT count(*) AS n FROM read_places")
        : db.prepare("SELECT count(*) AS n FROM read_places WHERE account = ?")
      ).get(...(account === undefined ? [] : [account]))?.["n"],
    );
  return { db, search, unread, clock, archived, missing, roles, rooms, line, rows };
}

describe("unread's store of places", () => {
  it("keeps the later of a place and a new one, and ignores an earlier one", () => {
    const t = setup();
    t.line("#bubble", BOB, T0 - 3 * MINUTE);
    t.line("#bubble", BOB, T0 - MINUTE);
    expect(t.unread.place(ALICE, "#bubble", T0 - 2 * MINUTE)).toBe(true);
    expect(t.unread.counts(ALICE)).toEqual({ bubble: 1 });
    expect(t.unread.place(ALICE, "#bubble", T0 - 10 * MINUTE)).toBe(true);
    expect(t.unread.counts(ALICE)).toEqual({ bubble: 1 });
    expect(t.unread.place(ALICE, "#bubble", T0)).toBe(true);
    expect(t.unread.counts(ALICE)).toEqual({});
  });

  it("refuses a place more than 5 minutes past now and takes one exactly 5 minutes past", () => {
    const t = setup();
    expect(t.unread.place(ALICE, "#bubble", T0 + 5 * MINUTE + 1)).toBe(false);
    expect(t.rows()).toBe(0);
    expect(t.unread.place(ALICE, "#bubble", T0 + 5 * MINUTE)).toBe(true);
    expect(t.rows()).toBe(1);
  });

  it("keeps 500 rows an account and drops the oldest read when a 501st comes", () => {
    const t = setup();
    for (let n = 0; n < 501; n += 1) {
      t.clock.now += 1_000;
      t.unread.place(ALICE, `#room${String(n)}`, T0 - DAY);
    }
    expect(t.rows(ALICE)).toBe(500);
    const first = t.db.prepare("SELECT count(*) AS n FROM read_places WHERE room = '#room0'").get();
    expect(first?.["n"]).toBe(0);
    const last = t.db.prepare("SELECT count(*) AS n FROM read_places WHERE room = '#room500'").get();
    expect(last?.["n"]).toBe(1);
  });

  it("never counts another account's rows against a cap", () => {
    const t = setup();
    for (let n = 0; n < 500; n += 1) t.unread.place(ALICE, `#room${String(n)}`, T0 - DAY);
    t.unread.place(BOB, "#bubble", T0 - DAY);
    expect(t.rows(ALICE)).toBe(500);
    expect(t.rows(BOB)).toBe(1);
  });

  it("forgets a row after 90 days: it counts nothing and the next write deletes it", () => {
    const t = setup();
    t.unread.place(ALICE, "#bubble", T0 - DAY);
    t.line("#bubble", BOB, T0 - MINUTE);
    expect(t.unread.counts(ALICE)).toEqual({ bubble: 1 });
    t.clock.now = T0 + 90 * DAY + MINUTE;
    t.line("#bubble", BOB, t.clock.now - MINUTE);
    expect(t.unread.counts(ALICE)).toEqual({});
    t.unread.place(BOB, "#bubble", t.clock.now);
    expect(t.rows(ALICE)).toBe(0);
  });
});

describe("unread's store, a write that fails", () => {
  it("writes none of a call's places when one fails, leaves the old rows, and throws", () => {
    const t = setup();
    t.unread.place(ALICE, "#bubble", T0 - DAY);
    t.clock.now = T0 + 90 * DAY + MINUTE;
    t.db.exec(
      "CREATE TRIGGER refused BEFORE INSERT ON read_places WHEN NEW.room = '#bubble/club' BEGIN SELECT RAISE(ABORT, 'refused'); END",
    );
    expect(() =>
      t.unread.places(BOB, [
        { room: "#bubble", time: t.clock.now },
        { room: "#bubble/club", time: t.clock.now },
      ]),
    ).toThrow("refused");
    expect(t.db.prepare("SELECT account, room FROM read_places").all()).toEqual([{ account: ALICE, room: "#bubble" }]);
    expect(t.db.isTransaction).toBe(false);
  });
});

describe("unread's retention", () => {
  it("expires the places past 90 days with no write, at most `limit` a call, and says how many went", () => {
    const t = setup();
    t.unread.place(ALICE, "#bubble", T0 - DAY);
    t.unread.place(ALICE, "#bubble/club", T0 - DAY);
    t.unread.place(BOB, "#bubble", T0 - DAY);
    expect(t.unread.expire(10)).toBe(0);
    t.clock.now = T0 + 90 * DAY + MINUTE;
    expect(t.unread.expire(2)).toBe(2);
    expect(t.rows()).toBe(1);
    expect(t.unread.expire(2)).toBe(1);
    expect(t.rows()).toBe(0);
  });
});

describe("unread's store, what a call may write", () => {
  it("a place in a room that does not exist is not kept", () => {
    const t = setup();
    t.missing.add("#ghost");
    expect(t.unread.place(ALICE, "#ghost", T0 - MINUTE)).toBe(false);
    expect(t.rows()).toBe(0);
  });

  it("a place in a room the account cannot read is not kept", () => {
    const t = setup();
    expect(t.unread.place(BOB, "#bubble/crew", T0 - MINUTE)).toBe(false);
    expect(t.unread.place(ALICE, "#bubble/crew", T0 - MINUTE)).toBe(false);
    t.archived.add("#bubble/club");
    expect(t.unread.place(BOB, "#bubble/club", T0 - MINUTE)).toBe(false);
    expect(t.rows()).toBe(0);
    expect(t.unread.place(BOB, "#bubble", T0 - MINUTE)).toBe(true);
    expect(t.rows()).toBe(1);
  });

  it("100 places are written in one transaction", () => {
    const t = setup();
    const sent: string[] = [];
    const exec = t.db.exec.bind(t.db);
    t.db.exec = (sql: string) => {
      sent.push(sql);
      exec(sql);
    };
    const places = Array.from({ length: 100 }, (_, n) => ({ room: `#room${String(n)}`, time: T0 - MINUTE }));
    expect(t.unread.places(ALICE, places)).toBe(100);
    expect(sent.filter((sql) => sql.startsWith("BEGIN"))).toHaveLength(1);
    expect(sent.filter((sql) => sql.startsWith("COMMIT"))).toHaveLength(1);
    expect(t.rows(ALICE)).toBe(100);
  });

  it("keeps the places that pass and drops the rest of a call, in one answer", () => {
    const t = setup();
    t.missing.add("#ghost");
    const places = [
      { room: "#bubble", time: T0 - MINUTE },
      { room: "#ghost", time: T0 - MINUTE },
      { room: "#garden", time: T0 + 10 * MINUTE },
    ];
    expect(t.unread.places(ALICE, places)).toBe(1);
    expect(t.rows()).toBe(1);
  });
});

describe("unread's count", () => {
  it("counts the lines past the place by others, never the account's own", () => {
    const t = setup();
    t.unread.place(ALICE, "#bubble", T0 - 10 * MINUTE);
    t.line("#bubble", BOB, T0 - 11 * MINUTE);
    t.line("#bubble", BOB, T0 - 5 * MINUTE);
    t.line("#bubble", CAROL, T0 - 4 * MINUTE);
    t.line("#bubble", ALICE, T0 - 3 * MINUTE);
    expect(t.unread.counts(ALICE)).toEqual({ bubble: 2 });
  });

  it("counts a line stamped exactly at the place as read", () => {
    const t = setup();
    t.line("#bubble", BOB, T0 - MINUTE);
    t.unread.place(ALICE, "#bubble", T0 - MINUTE);
    expect(t.unread.counts(ALICE)).toEqual({});
  });

  it("leaves out a line REDACTed from the index", () => {
    const t = setup();
    t.unread.place(ALICE, "#bubble", T0 - 10 * MINUTE);
    const gone = t.line("#bubble", BOB, T0 - 5 * MINUTE);
    t.line("#bubble", BOB, T0 - 4 * MINUTE);
    t.search.remove("#bubble", gone);
    expect(t.unread.counts(ALICE)).toEqual({ bubble: 1 });
  });

  it("stops at 100 lines a room and at 100 for a world", () => {
    const t = setup();
    t.unread.place(ALICE, "#bubble", T0 - DAY);
    t.unread.place(ALICE, "#bubble/club", T0 - DAY);
    for (let n = 0; n < 150; n += 1) t.line("#bubble", BOB, T0 - 10 * MINUTE + n);
    expect(t.unread.counts(ALICE)).toEqual({ bubble: 100 });
    for (let n = 0; n < 30; n += 1) t.line("#bubble/club", BOB, T0 - 5 * MINUTE + n);
    expect(t.unread.counts(ALICE)).toEqual({ bubble: 100 });
    const other = setup();
    other.unread.place(ALICE, "#bubble", T0 - DAY);
    other.unread.place(ALICE, "#bubble/club", T0 - DAY);
    for (let n = 0; n < 30; n += 1) other.line("#bubble", BOB, T0 - 10 * MINUTE + n);
    for (let n = 0; n < 30; n += 1) other.line("#bubble/club", BOB, T0 - 5 * MINUTE + n);
    expect(other.unread.counts(ALICE)).toEqual({ bubble: 60 });
  });

  it("sums the rooms of one world and keeps the worlds apart", () => {
    const t = setup();
    for (const room of ["#bubble", "#bubble/club", "#garden"]) {
      t.unread.place(ALICE, room, T0 - DAY);
      t.line(room, BOB, T0 - MINUTE);
    }
    expect(t.unread.counts(ALICE)).toEqual({ bubble: 2, garden: 1 });
  });

  it("gives nothing for a room with no place: a never-read room counts none", () => {
    const t = setup();
    t.line("#bubble", BOB, T0 - MINUTE);
    expect(t.unread.counts(ALICE)).toEqual({});
  });

  it("skips a room the account may not read, whatever it was when its place was kept", () => {
    const t = setup();
    t.unread.place(CAROL, "#bubble/club", T0 - DAY);
    t.line("#bubble/club", BOB, T0 - MINUTE);
    expect(t.unread.counts(CAROL)).toEqual({ bubble: 1 });
    t.rooms.set("#bubble/club", { type: "members", readers: "crew", hidden: false });
    expect(t.unread.counts(CAROL)).toEqual({});
    t.rooms.set("#bubble/club", { type: "open", hidden: true });
    expect(t.unread.counts(CAROL)).toEqual({});
    t.rooms.set("#bubble/club", { type: "accounts", hidden: false });
    t.archived.add("#bubble/club");
    expect(t.unread.counts(CAROL)).toEqual({});
  });

  it("never counts one account's places in another's answer", () => {
    const t = setup();
    t.unread.place(ALICE, "#bubble", T0 - DAY);
    t.line("#bubble", CAROL, T0 - MINUTE);
    expect(t.unread.counts(BOB)).toEqual({});
    expect(t.unread.counts(ALICE)).toEqual({ bubble: 1 });
  });
});
