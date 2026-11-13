// The table of Jarvis's public answers (SAID_TABLES), by room and line id: kept as the cards are, 30 days, then the oldest past the caps.
import type { DatabaseSync } from "node:sqlite";
import { JarvisAnswer } from "@gnoworld/schemas";
import { KEEP_MS } from "../cards/expire.ts";

export const SAID_TABLES = `
CREATE TABLE jarvis_said (room TEXT NOT NULL, msgid TEXT NOT NULL, answer TEXT NOT NULL, asker TEXT NOT NULL, question TEXT NOT NULL, at INTEGER NOT NULL, bytes INTEGER NOT NULL, PRIMARY KEY (room, msgid)) STRICT;
CREATE INDEX jarvis_said_by_at ON jarvis_said (at);
`;

/** Rows and bytes held to, the oldest going first: as the kept answers' caps. */
export const SAID_MAX = { rows: 5000, bytes: 16 * 1024 * 1024 } as const;

export type Answered = Extract<JarvisAnswer, { status: "answered" }>;

/** One answer to keep: its line's room and id, who asked and what, and the page's answer. */
export interface Row {
  room: string;
  msgid: string;
  asker: string;
  question: string;
  answer: Answered;
}

export function saidStore(
  db: DatabaseSync,
  { now, maxRows, maxBytes }: { now: () => number; maxRows: number; maxBytes: number },
) {
  // The oldest rows past a running total from the newest (a row count or bytes), at most n.
  const past = (total: string) =>
    db.prepare(
      `DELETE FROM jarvis_said WHERE rowid IN (SELECT rowid FROM (SELECT rowid, at, ${total} AS run FROM jarvis_said) WHERE run > ? ORDER BY at, rowid LIMIT ?)`,
    );
  const sql = {
    get: db.prepare("SELECT answer, asker, at FROM jarvis_said WHERE room = ? AND msgid = ?"),
    set: db.prepare(
      "INSERT INTO jarvis_said (room, msgid, answer, asker, question, at, bytes) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ),
    drop: db.prepare("DELETE FROM jarvis_said WHERE room = ? AND msgid = ?"),
    asked: db.prepare(
      "DELETE FROM jarvis_said WHERE rowid = (SELECT rowid FROM jarvis_said WHERE room = ? AND asker = ? AND question <> '' AND instr(?, question) > 0 ORDER BY at DESC, rowid DESC LIMIT 1)",
    ),
    old: db.prepare(
      "DELETE FROM jarvis_said WHERE rowid IN (SELECT rowid FROM jarvis_said WHERE at <= ? ORDER BY at, rowid LIMIT ?)",
    ),
    rows: past("row_number() OVER (ORDER BY at DESC, rowid DESC)"),
    bytes: past("sum(bytes) OVER (ORDER BY at DESC, rowid DESC)"),
  };
  return {
    /** Keeps the answer of a line; false when the table cannot take it. */
    set({ room, msgid, asker, question, answer }: Row): boolean {
      const text = JSON.stringify(answer);
      try {
        sql.set.run(room, msgid, text, asker, question, now(), Buffer.byteLength(text));
        return true;
      } catch {
        return false;
      }
    },
    get(room: string, msgid: string): { answer: JarvisAnswer; asker: string } | undefined {
      const row = sql.get.get(room, msgid);
      if (
        row === undefined ||
        typeof row["answer"] !== "string" ||
        typeof row["asker"] !== "string" ||
        Number(row["at"]) <= now() - KEEP_MS
      )
        return undefined;
      try {
        const answer = JarvisAnswer.safeParse(JSON.parse(row["answer"]));
        return answer.success ? { answer: answer.data, asker: row["asker"] } : undefined;
      } catch {
        return undefined;
      }
    },
    drop(room: string, msgid: string): void {
      sql.drop.run(room, msgid);
    },
    /** The latest answer to a question the line `text` holds, asked by `account` in the room. */
    dropAsked(room: string, account: string, text: string): void {
      sql.asked.run(room, account, text);
    },
    expire(limit: number): number {
      let left = limit;
      const take = (run: (n: number) => { changes: number | bigint }): void => {
        left -= left > 0 ? Number(run(left).changes) : 0;
      };
      take((n) => sql.old.run(now() - KEEP_MS, n));
      take((n) => sql.rows.run(maxRows, n));
      take((n) => sql.bytes.run(maxBytes, n));
      return limit - left;
    },
  };
}
