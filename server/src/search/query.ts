// What a reader's search asks of the index (slice 13, B2): the words as quoted FTS5 terms, never the typed text as syntax (B1
// security, for B2: 2); the rooms and the match bound, never concatenated; `line_edits` never read; pages by (time, row), a bounded
// count. The work is bounded by the asked rooms' lines: the rooms come first, the match is asked of those rows alone (F13756).
import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import { z } from "zod";
import { worldOf } from "../rooms/rooms.ts";

export interface Query {
  rooms: readonly string[];
  /** Empty with a `from`: that account's lines, newest first, with no words. */
  q: string;
  from?: string | undefined;
  link?: boolean | undefined;
  since?: number | undefined;
  until?: number | undefined;
  /** The last row of the page before: pages go by arrival (the full-text row), newest first. */
  before?: { rowid: number } | undefined;
  limit: number;
}
export interface Found {
  rows: { rowid: number; room: string; msgid: string; account: string; at: number; link: boolean; text: string }[];
  /** The whole match set's size, 1,000 at most: `capped` says there are more. */
  total: number;
  capped: boolean;
  /** The match set held more than MATCHES_MOST lines: only the newest were searched, the filters and the count ran over them. */
  partial: boolean;
}

/** The most words a query holds, and the most lines it counts. */
const WORDS_MOST = 8;
const TOTAL_MOST = 1000;
/** The newest matches the filters and the order run over (F13770). */
const MATCHES_MOST = 5000;
/** A word of fewer characters is exact: a prefix of one letter would walk the whole index (F13770). */
const PREFIX_FROM = 3;
export const prefixed = (word: string): boolean => Array.from(word).length >= PREFIX_FROM;

/** The words of a query: what the index tokenizes as letters or digits is a word, a typed `*` or quote is dropped, 8 at most. */
export const wordsOf = (q: string): string[] =>
  q
    .replaceAll(/["*]/g, "")
    .split(/\s/)
    .filter((word) => /[\p{L}\p{N}]/u.test(word))
    .slice(0, WORDS_MOST);

const Row = z.object({
  rowid: z.number(),
  room: z.string(),
  msgid: z.string(),
  account: z.string(),
  at: z.number(),
  link: z.number(),
  text: z.string(),
});
const Count = z.object({ n: z.number() });

// With no words, the sender's newest lines come from `lines_by_account` (account, at); the rooms and filters are asked of them as of a match.
const NEWEST_OF = `SELECT rowid FROM lines WHERE account = ? AND world = ? ORDER BY at DESC, rowid DESC LIMIT ${String(MATCHES_MOST + 1)}`;

// The world's lines come first (a column of the full-text table): one pass gives the newest matches, the rooms and filters are asked of them.
// ponytail: only the newest MATCHES_MOST matches are searched, so a filter nothing passes costs 5,000 rows; an old line of a common word is
// missed with a narrow filter (`partial` says so). Upgrade: a partial index on `link`.
const NEWEST = `SELECT rowid FROM lines_fts WHERE lines_fts MATCH ? ORDER BY rowid DESC LIMIT ${String(MATCHES_MOST + 1)}`;
const FROM = `FROM json_each(?) j CROSS JOIN lines l ON l.rowid = j.value
  WHERE l.room IN (SELECT value FROM json_each(?))
  AND (? IS NULL OR l.account = ?) AND (? IS NULL OR l.link = 1) AND (? IS NULL OR l.at >= ?) AND (? IS NULL OR l.at <= ?)`;
const Rowids = z.array(z.object({ rowid: z.number() }));

export function makeQuery(db: DatabaseSync) {
  const newest = db.prepare(NEWEST);
  const newestOf = db.prepare(NEWEST_OF);
  const rows = db.prepare(
    `SELECT l.rowid AS rowid, l.room, l.msgid, l.account, l.at, l.link, l.text ${FROM} AND (? IS NULL OR l.rowid < ?) ORDER BY l.rowid DESC LIMIT ?`,
  );
  const counted = db.prepare(`SELECT count(*) AS n FROM (SELECT 1 ${FROM} LIMIT ${String(TOTAL_MOST + 1)})`);
  const optional = (value: SQLInputValue | undefined, times: number): SQLInputValue[] =>
    Array.from({ length: times }, () => value ?? null);
  return ({ rooms, q, from, link, since, until, before, limit }: Query): Found => {
    const words = wordsOf(q);
    // A slug's characters only, so the quoted term holds nothing else; the rooms asked are one world's (the route's), the first names it.
    const world = worldOf(rooms[0] ?? "").replaceAll(/[^a-z0-9-]/g, "");
    const byWords = words.length > 0;
    // A `q` typed with no word in it ("!!") matches nothing; only an empty one lists a sender's lines.
    if ((!byWords && (from === undefined || q.trim() !== "")) || world === "")
      return { rows: [], total: 0, capped: false, partial: false };
    const match = `world : "${world}" AND text : (${words.map((word) => (prefixed(word) ? `"${word}"*` : `"${word}"`)).join(" AND ")})`;
    const matches = Rowids.parse(byWords ? newest.all(match) : newestOf.all(from ?? "", world)).map((row) => row.rowid);
    const filters = [
      JSON.stringify(matches.slice(0, MATCHES_MOST)),
      JSON.stringify(rooms),
      ...optional(from, 2),
      ...(link === true ? [1] : [null]),
      ...optional(since, 2),
      ...optional(until, 2),
    ];
    const found = rows
      .all(...filters, ...(before === undefined ? optional(undefined, 2) : [before.rowid, before.rowid]), limit)
      .map((row) => Row.parse(row));
    const n = Count.parse(counted.get(...filters)).n;
    return {
      rows: found.map((row) => ({ ...row, link: row.link === 1 })),
      total: Math.min(n, TOTAL_MOST),
      capped: n > TOTAL_MOST,
      partial: matches.length > MATCHES_MOST,
    };
  };
}
