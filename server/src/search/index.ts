// The search index (slice 13, B1; D13917, D13924): the lines of the rooms a reader may open, newest 2,048 a room and 90 days, in
// SQLite beside the rest and with its own full-text table. A line enters once moderation let it through, and leaves with its
// REDACT, its expiry or the room's cap. Nothing here reads for a reader: B2's route does, by `mayRead`.
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { GONE } from "../door/lines.ts";
import type { Fetched, Said } from "../irc/link.ts";
import { remember } from "../remember.ts";
import { makeQuery, type Found, type Query } from "./query.ts";
import { ERGO_EXPIRE_MS } from "../retention/retention.ts";
import { worldOf } from "../rooms/rooms.ts";
import { searchable, type Typed } from "../rooms/types.ts";

// Ergo's channel-length: a line it no longer serves cannot be opened from a hit (Q4).
export const ROOM_CAP = 2048;
export const MAX_ROWS = 400_000;
// A line edited more often than this leaves the index: its edits are rows too, and the index errs toward less.
export const MAX_EDITS = 50;

// `world` is in the full-text table too, so a query's match starts from the asked world's lines (F13756).
// `line_edits` holds the id of every edit folded into a line (foldEdits, packages/core/src/chat/shown.ts), so a REDACT of any of them finds
// its row. FTS5's `secure-delete` zeroes a removed line's words in the index, which `PRAGMA secure_delete` does not reach (SQLite 3.53.4).
export const SEARCH_TABLES = `
CREATE TABLE lines (
  rowid INTEGER PRIMARY KEY,
  room TEXT NOT NULL,
  world TEXT NOT NULL,
  msgid TEXT NOT NULL UNIQUE,
  account TEXT NOT NULL,
  at INTEGER NOT NULL,
  link INTEGER NOT NULL,
  text TEXT NOT NULL
) STRICT;
CREATE INDEX lines_by_room ON lines (room, at);
CREATE INDEX lines_by_account ON lines (account, at);
CREATE INDEX lines_by_at ON lines (at);
CREATE TABLE line_edits (
  edit TEXT PRIMARY KEY,
  line INTEGER NOT NULL REFERENCES lines (rowid) ON DELETE CASCADE
) STRICT;
CREATE INDEX line_edits_by_line ON line_edits (line);
CREATE VIRTUAL TABLE lines_fts USING fts5(text, world, content = 'lines', content_rowid = 'rowid', tokenize = 'unicode61 remove_diacritics 2');
CREATE TRIGGER lines_after_insert AFTER INSERT ON lines BEGIN
  INSERT INTO lines_fts (rowid, text, world) VALUES (new.rowid, new.text, new.world);
END;
CREATE TRIGGER lines_after_delete AFTER DELETE ON lines BEGIN
  INSERT INTO lines_fts (lines_fts, rowid, text, world) VALUES ('delete', old.rowid, old.text, old.world);
END;
CREATE TRIGGER lines_after_update AFTER UPDATE ON lines BEGIN
  INSERT INTO lines_fts (lines_fts, rowid, text, world) VALUES ('delete', old.rowid, old.text, old.world);
  INSERT INTO lines_fts (rowid, text, world) VALUES (new.rowid, new.text, new.world);
END;
INSERT INTO lines_fts (lines_fts, rank) VALUES ('secure-delete', 1);
`;

const INSERT = "INSERT OR IGNORE INTO lines (room, world, msgid, account, at, link, text) VALUES (?, ?, ?, ?, ?, ?, ?)";

const linked = (text: string): number => (/https?:\/\/\S/i.test(text) ? 1 : 0);

export interface Search {
  /** A line moderation let through, of a room the index holds; never an edit, a line to the operators alone, a DM. */
  add: (said: Said) => void;
  /** A line taken from its room (REDACT): its row goes, whether the id names the line or one of its edits. */
  remove: (room: string, msgid: string) => void;
  /** An edit by the line's own author: the row shows its text. */
  edited: (said: Said) => void;
  /** Removes at most `limit` rows, those past 90 days first, then the oldest over the row cap; the number removed. */
  expire: (limit: number) => number;
  size: () => number;
  /** B2: the lines of `rooms` that hold every word of `q`, newest first, `limit` at most, from the cursor on. */
  query: (query: Query) => Found;
  /** Asks Ergo for each of a room's lines, the oldest first, and drops those it no longer holds. */
  reconcile: (room: string, fetch: (room: string, msgid: string) => Promise<Fetched>) => Promise<void>;
}

interface Options {
  roles: Typed;
  now: () => number;
  maxRows?: number;
}

const Row = z.object({ rowid: z.number(), account: z.string() });
const Count = z.object({ n: z.number() });
const Ids = z.array(z.object({ msgid: z.string() }));

export function makeSearch(db: DatabaseSync, { roles, now, maxRows = MAX_ROWS }: Options): Search {
  // The whole connection's: every freed page of every table is zeroed, which is what keeps a removed line off the disk.
  db.exec("PRAGMA secure_delete = ON");
  const sql = {
    insert: db.prepare(INSERT),
    trim: db.prepare(
      "DELETE FROM lines WHERE rowid IN (SELECT rowid FROM lines WHERE room = ? ORDER BY at DESC, rowid DESC LIMIT -1 OFFSET ?)",
    ),
    drop: db.prepare(
      "DELETE FROM lines WHERE room = ? AND (msgid = ? OR rowid IN (SELECT line FROM line_edits WHERE edit = ?))",
    ),
    forget: db.prepare("DELETE FROM lines WHERE room = ?"),
    folded: db.prepare("SELECT count(*) AS n FROM line_edits WHERE line = ?"),
    drop_row: db.prepare("DELETE FROM lines WHERE rowid = ?"),
    find: db.prepare("SELECT rowid, account FROM lines WHERE room = ? AND msgid = ?"),
    replace: db.prepare("UPDATE lines SET text = ?, link = ? WHERE rowid = ?"),
    fold: db.prepare("INSERT OR REPLACE INTO line_edits (edit, line) VALUES (?, ?)"),
    old: db.prepare(
      "DELETE FROM lines WHERE rowid IN (SELECT rowid FROM lines WHERE at < ? ORDER BY at, rowid LIMIT ?)",
    ),
    over: db.prepare("DELETE FROM lines WHERE rowid IN (SELECT rowid FROM lines ORDER BY at, rowid LIMIT ?)"),
    count: db.prepare("SELECT count(*) AS n FROM lines"),
    ids: db.prepare("SELECT msgid FROM lines WHERE room = ? ORDER BY at, rowid"),
  };
  // A line taken (`room id`) or edited (`room id account`) before it came in, as door/lines.ts keeps them (F5109, F5270): the
  // bot's check is asynchronous, so a REDACT or an edit can be heard before its line passes. Two maps, so a flood of edits
  // naming no line cannot push a REDACT's mark out.
  const taken = new Map<string, true>();
  const replaced = new Map<string, true>();
  const key = (...parts: string[]): string => parts.join(" ");
  const held = (room: string): boolean => room.startsWith("#") && searchable(roles, room);
  const size = (): number => Count.parse(sql.count.get()).n;
  const remove = (room: string, msgid: string): void => {
    // Whatever the room is now: a room made hidden after its lines were indexed still loses a deleted line (F13700).
    if (held(room)) remember(taken, [key(room, msgid), true], GONE);
    sql.drop.run(room, msgid, msgid);
  };
  return {
    add({ room, msgid, account, text, time, few, edits }) {
      if (few !== undefined || edits !== undefined || !held(room)) return;
      if (taken.has(key(room, msgid)) || replaced.has(key(room, msgid, account))) return;
      const at = Date.parse(time ?? "");
      const added = sql.insert.run(
        room,
        worldOf(room),
        msgid,
        account,
        Number.isNaN(at) ? now() : at,
        linked(text),
        text,
      );
      if (added.changes > 0) sql.trim.run(room, ROOM_CAP);
    },
    remove,
    edited({ room, msgid, account, text, few, edits }) {
      if (edits === undefined || few !== undefined || taken.has(key(room, msgid))) return;
      const found = sql.find.get(room, edits);
      if (found === undefined) {
        if (held(room)) remember(replaced, [key(room, edits, account), true], GONE);
        return;
      }
      const row = Row.parse(found);
      if (row.account !== account) return;
      sql.replace.run(text, linked(text), row.rowid);
      sql.fold.run(msgid, row.rowid);
      if (Count.parse(sql.folded.get(row.rowid)).n > MAX_EDITS) sql.drop_row.run(row.rowid);
    },
    expire(limit) {
      const old = Number(sql.old.run(now() - ERGO_EXPIRE_MS, limit).changes);
      return old + Number(sql.over.run(Math.min(Math.max(0, size() - maxRows), limit - old)).changes);
    },
    size,
    query: makeQuery(db),
    async reconcile(room, fetch) {
      if (!held(room)) {
        sql.forget.run(room);
        return;
      }
      for (const { msgid } of Ids.parse(sql.ids.all(room))) {
        const got = await fetch(room, msgid);
        if (got !== "unanswered" && (got === "gone" || got.room !== room || got.msgid !== msgid)) remove(room, msgid);
      }
    },
  };
}
