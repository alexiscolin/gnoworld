// The stored translations (a line's, one row a room, line and language) and the server's own record of a line's text and author. A row
// never holds a line's text: a translation, or the mark that the line is already in that language.
import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import { JARVIS_LANGUAGES, type LineTranslations } from "@gnoworld/schemas";
import { z } from "zod";

export const TRANSLATION_TABLES = `
CREATE TABLE line_translations (
  room TEXT NOT NULL,
  msgid TEXT NOT NULL,
  language TEXT NOT NULL,
  original INTEGER NOT NULL,
  text TEXT,
  source TEXT,
  at INTEGER NOT NULL,
  PRIMARY KEY (room, msgid, language)
) STRICT;
CREATE INDEX line_translations_by_at ON line_translations (at);
`;

/** The retention cap: rows kept at most, and 30 days. */
const KEEP_MS = 30 * 24 * 60 * 60_000;
export const MAX_ROWS = 200_000;

export type Language = (typeof JARVIS_LANGUAGES)[number];
export type Stored = { status: "translated"; text: string; from?: Language | undefined } | { status: "original" };

const Row = z.object({
  msgid: z.string(),
  original: z.number(),
  text: z.string().nullable(),
  source: z.string().nullable(),
});
const Source = z.object({ account: z.string(), text: z.string() });
const Count = z.object({ n: z.number() });

export class TranslationStore {
  readonly #db: DatabaseSync;
  readonly #now: () => number;

  constructor(db: DatabaseSync, now: () => number) {
    this.#db = db;
    this.#now = now;
  }

  #run(sql: string, ...values: SQLInputValue[]): number {
    return Number(this.#db.prepare(sql).run(...values).changes);
  }

  /** Stores a translation, unless the line holds one in that language already; whether it did. */
  set({ room, msgid, language }: { room: string; msgid: string; language: Language }, value: Stored): boolean {
    const translated = value.status === "translated";
    return (
      this.#run(
        "INSERT OR IGNORE INTO line_translations (room, msgid, language, original, text, source, at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        room,
        msgid,
        language,
        translated ? 0 : 1,
        translated ? value.text : null,
        translated ? (value.from ?? null) : null,
        this.#now(),
      ) > 0
    );
  }

  /** The stored translations of these lines in a language, in the order asked. */
  many(room: string, ids: readonly string[], language: Language): LineTranslations["translations"] {
    if (ids.length === 0) return [];
    const marks = ids.map(() => "?").join(",");
    const rows = z
      .array(Row)
      .parse(
        this.#db
          .prepare(
            `SELECT msgid, original, text, source FROM line_translations WHERE room = ? AND language = ? AND msgid IN (${marks})`,
          )
          .all(room, language, ...ids),
      );
    const held = new Map(rows.map((row) => [row.msgid, row]));
    return ids.flatMap((msgid): LineTranslations["translations"] => {
      const row = held.get(msgid);
      if (row === undefined) return [];
      if (row.original === 1 || row.text === null) return [{ msgid, status: "original" }];
      const from = JARVIS_LANGUAGES.find((known) => known === row.source);
      return [{ msgid, status: "translated", text: row.text, ...(from === undefined ? {} : { from }) }];
    });
  }

  /** Drops every language of a line; the languages it had. */
  drop(room: string, msgid: string): Language[] {
    const held = z
      .array(z.object({ language: z.enum(JARVIS_LANGUAGES) }))
      .parse(this.#db.prepare("SELECT language FROM line_translations WHERE room = ? AND msgid = ?").all(room, msgid));
    this.#run("DELETE FROM line_translations WHERE room = ? AND msgid = ?", room, msgid);
    return held.map(({ language }) => language);
  }

  /** The id of the line an edit was folded into by the search index, if it still holds it. */
  lineOf(room: string, edit: string): string | undefined {
    const row = this.#db
      .prepare(
        "SELECT lines.msgid AS msgid FROM line_edits JOIN lines ON lines.rowid = line_edits.line WHERE line_edits.edit = ? AND lines.room = ?",
      )
      .get(edit, room);
    return row === undefined ? undefined : z.object({ msgid: z.string() }).parse(row).msgid;
  }

  count(): number {
    return Count.parse(this.#db.prepare("SELECT count(*) AS n FROM line_translations").get()).n;
  }

  /** Deletes at most `limit` rows, those past 30 days first, then the oldest over `maxRows`; how many went. */
  expire({ now, maxRows }: { now: number; maxRows: number }, limit: number): number {
    const old = this.#run(
      "DELETE FROM line_translations WHERE rowid IN (SELECT rowid FROM line_translations WHERE at < ? LIMIT ?)",
      now - KEEP_MS,
      limit,
    );
    const over = Math.min(Math.max(0, this.count() - maxRows), limit - old);
    if (over <= 0) return old;
    return (
      old +
      this.#run(
        "DELETE FROM line_translations WHERE rowid IN (SELECT rowid FROM line_translations ORDER BY at, rowid LIMIT ?)",
        over,
      )
    );
  }

  /** The search index's row of a line: its author and text, as the server heard them. */
  source(room: string, msgid: string): { account: string; text: string } | undefined {
    const row = this.#db.prepare("SELECT account, text FROM lines WHERE room = ? AND msgid = ?").get(room, msgid);
    return row === undefined ? undefined : Source.parse(row);
  }
}
