// The link cards' retention (slice 13, L3; docs/plans/link-previews.md §4 "Storage growth"): pages past 30 days, then past the row cap, then past
// the picture bytes' cap, oldest first, at most `limit` a tick; the lines of a page that went follow, uncounted.
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";

export const KEEP_MS = 30 * 24 * 60 * 60_000;
/** The defaults: 2,000 pages and 32 MiB of pictures. */
export const MAX_ROWS = 2000;
export const MAX_BYTES = 32 * 1024 * 1024;
export interface Caps {
  maxRows: number;
  maxBytes: number;
}

const Keyed = z.array(z.object({ key: z.string(), bytes: z.number() }));
const One = z.object({ n: z.number() });

/** Deletes at most `limit` pages and the lines left without one; how many pages went. */
export function expireCards(db: DatabaseSync, { now, ...caps }: Caps & { now: number }, limit: number): number {
  const old = now - KEEP_MS;
  const oldest = (where: string, count: number, ...values: number[]) =>
    Keyed.parse(
      db.prepare(`SELECT key, bytes FROM link_cards WHERE ${where} ORDER BY at, key LIMIT ?`).all(...values, count),
    );
  const gone = new Map(oldest("at < ?", limit, old).map(({ key, bytes }) => [key, bytes]));
  const rows = One.parse(db.prepare("SELECT count(*) AS n FROM link_cards").get()).n - gone.size;
  for (const { key, bytes } of oldest("at >= ?", Math.max(0, Math.min(rows - caps.maxRows, limit - gone.size)), old))
    gone.set(key, bytes);
  let held =
    One.parse(db.prepare("SELECT coalesce(sum(bytes), 0) AS n FROM link_cards").get()).n -
    [...gone.values()].reduce((a, b) => a + b, 0);
  for (const { key, bytes } of oldest("bytes > ? AND at >= ?", limit, 0, old)) {
    if (held <= caps.maxBytes || gone.size >= limit) break;
    if (!gone.has(key)) {
      gone.set(key, bytes);
      held -= bytes;
    }
  }
  for (const key of gone.keys()) db.prepare("DELETE FROM link_cards WHERE key = ?").run(key);
  db.prepare(
    "DELETE FROM line_cards WHERE rowid IN (SELECT rowid FROM line_cards WHERE at < ? OR (key <> '' AND key NOT IN (SELECT key FROM link_cards)) LIMIT ?)",
  ).run(old, limit);
  return gone.size;
}
