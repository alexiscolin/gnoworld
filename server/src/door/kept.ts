// Jarvis's kept answers, in the server's database so a restart keeps them (D13920): a function's explanation 7 days, shared
// across rooms, keyed by chain, realm and function (it read the code alone: no room lines, no live tool); a room's "here" 1 hour,
// its own, gone when a line of the room is taken. Only an `answered` is kept. A part of a key is validated before it exists.
import type { DatabaseSync } from "node:sqlite";
import { ChainId, EXPLAIN_VERSION, JarvisAnswer, RealmPath, type JarvisQuestion } from "@gnoworld/schemas";
import { remember } from "../remember.ts";
import { servedKey } from "./served.ts";

export const KEPT_TABLES = `
CREATE TABLE jarvis_kept (key TEXT PRIMARY KEY, answer TEXT NOT NULL, at INTEGER NOT NULL, until INTEGER NOT NULL, room TEXT, bytes INTEGER NOT NULL) STRICT;
CREATE INDEX jarvis_kept_by_until ON jarvis_kept (until);
CREATE INDEX jarvis_kept_by_at ON jarvis_kept (at);
CREATE INDEX jarvis_kept_by_room ON jarvis_kept (room);
`;
export const EXPLAIN_MS = 7 * 24 * 60 * 60_000;
export const HERE_MS = 60 * 60_000;
// Rows and bytes held to, the oldest going first at the retention's tick: 5,000 answers of 8,000 code points at most.
export const KEPT_MAX = { rows: 5000, bytes: 16 * 1024 * 1024 } as const;
const DROPS = 1000;
const TIME = { explain: EXPLAIN_MS, here: HERE_MS };

export interface Kept {
  // The answer kept for a key, none once its time is up, or for a row that is no answer.
  get: (key: string) => JarvisAnswer | undefined;
  // Only an `answered` is kept, its time its key's kind's from now. `from` is a room's and when its call began: an answer of a
  // call begun before the room's last drop is not kept.
  set: (key: string, answer: JarvisAnswer, from?: { room: string; started: number }) => void;
  // The room's kept answers go (a line of it was taken or edited).
  drop: (room: string) => void;
  // At most `limit` rows past their time, then over the row and byte caps, the oldest first; the count taken.
  expire: (limit: number) => number;
}

/** The key of an explanation: chain, realm path and function alone. None for a part that is no chain id, realm path or name. */
export function explainKey(chain: string, realm: string, name: string): string | undefined {
  const good =
    ChainId.safeParse(chain).success &&
    RealmPath.safeParse(realm).success &&
    realm.length <= 128 &&
    /^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(name);
  return good ? JSON.stringify(["explain", EXPLAIN_VERSION, chain, realm, name]) : undefined;
}

/** The key of a room's "here". */
export const hereKey = (room: string): string => JSON.stringify(["here", room]);

/** The key an ask is kept under, none for the asks never kept: a person's question, a catch-up, a function of an unknown chain. */
export function keptKey(ask: JarvisQuestion, chain: string | undefined): string | undefined {
  if (!("ask" in ask)) return undefined;
  if (ask.ask === "here") return hereKey(ask.room);
  return ask.ask === "function" && chain !== undefined ? explainKey(chain, ask.realm, ask.function) : undefined;
}

/** The key an ask is in flight and served under, and the one it is kept under. An explanation is the same in every room: it is
 * both under its kept key, which holds none (D13920). */
export function keysOf(
  ask: JarvisQuestion,
  at: { last: string | undefined; account: string; chain: string | undefined },
) {
  const kept = keptKey(ask, at.chain);
  return {
    key: kept ?? servedKey(ask, at.last, at.account),
    keptKey: kept,
  };
}

export function makeKept(
  db: DatabaseSync,
  {
    now,
    maxRows = KEPT_MAX.rows,
    maxBytes = KEPT_MAX.bytes,
  }: { now: () => number; maxRows?: number; maxBytes?: number },
): Kept {
  const sql = {
    get: db.prepare("SELECT answer, until FROM jarvis_kept WHERE key = ?"),
    set: db.prepare(
      "INSERT OR REPLACE INTO jarvis_kept (key, answer, at, until, room, bytes) VALUES (?, ?, ?, ?, ?, ?)",
    ),
    drop: db.prepare("DELETE FROM jarvis_kept WHERE room = ?"),
    past: db.prepare(
      "DELETE FROM jarvis_kept WHERE rowid IN (SELECT rowid FROM jarvis_kept WHERE until <= ? ORDER BY until LIMIT ?)",
    ),
    oldest: db.prepare(
      "DELETE FROM jarvis_kept WHERE rowid IN (SELECT rowid FROM jarvis_kept ORDER BY at, rowid LIMIT ?)",
    ),
    total: db.prepare("SELECT count(*) AS rows, coalesce(sum(bytes), 0) AS bytes FROM jarvis_kept"),
    sizes: db.prepare("SELECT bytes FROM jarvis_kept ORDER BY at, rowid LIMIT ?"),
  };
  const dropped = new Map<string, number>();
  return {
    get(key) {
      const row = sql.get.get(key);
      if (row === undefined || typeof row["answer"] !== "string" || Number(row["until"]) <= now()) return undefined;
      try {
        const answer = JarvisAnswer.safeParse(JSON.parse(row["answer"]));
        return answer.success && answer.data.status === "answered" ? answer.data : undefined;
      } catch {
        return undefined;
      }
    },
    set(key, answer, from) {
      const kind = kindOf(key);
      if (answer.status !== "answered" || kind === undefined) return;
      if (from !== undefined && from.started <= (dropped.get(from.room) ?? -Infinity)) return;
      const text = JSON.stringify(answer);
      sql.set.run(key, text, now(), now() + TIME[kind], from?.room ?? null, Buffer.byteLength(text));
    },
    drop(room) {
      remember(dropped, [room, now()], DROPS);
      sql.drop.run(room);
    },
    expire(limit) {
      let left = limit;
      const take = (n: number, run: (n: number) => { changes: number | bigint }): void => {
        left -= n > 0 ? Number(run(Math.min(n, left)).changes) : 0;
      };
      const total = () => ({ rows: Number(sql.total.get()?.["rows"]), bytes: Number(sql.total.get()?.["bytes"]) });
      take(left, (n) => sql.past.run(now(), n));
      take(total().rows - maxRows, (n) => sql.oldest.run(n));
      let heavy = total().bytes - maxBytes;
      let count = 0;
      for (const row of left > 0 && heavy > 0 ? sql.sizes.all(left) : []) {
        if (heavy <= 0) break;
        heavy -= Number(row["bytes"]);
        count += 1;
      }
      take(count, (n) => sql.oldest.run(n));
      return limit - left;
    },
  };
}

// A key's kind, none for a key of neither.
function kindOf(key: string): keyof typeof TIME | undefined {
  const kind = /^\["(explain|here)"/.exec(key)?.[1];
  return kind === "explain" || kind === "here" ? kind : undefined;
}
