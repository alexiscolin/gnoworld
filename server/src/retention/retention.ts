// The server's retention (slice 3's plan, 3n; decision 154): the bot's verdict records kept 180 days and
// below a row cap, the oldest going first, one small batch a tick so a backlog never holds the
// event loop; the verdicts and the database's used pages measured after, with one alert a crossing of 80%,
// and Ergo's data folder too, read-only (3n-b). The other stores purge themselves (nonces, tokens, tickets,
// mutes) or hold one row a room or an account.
import { lstatSync, readdirSync, type Stats } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { Log } from "@gnoworld/service/log";

// Ergo's `expire-time` (deploy/ergo/ircd.yaml.tmpl): a line older than that is gone from Ergo, and so is its pin.
const ERGO_EXPIRE_MS = 90 * 24 * 60 * 60_000;

interface Options {
  log: Log;
  now?: () => number;
  // 150,000 verdicts of about 1.2 KB with their indexes (measured), 176 MB; 256 MB for the database.
  maxVerdicts?: number;
  maxBytes?: number;
  // Rows a batch and batches a tick: one batch of 500 a tick, a backlog drained over the next ticks (F710).
  batch?: number;
  batches?: number;
  // Ergo's data folder and its cap; none, no measure.
  ergoData?: { dir: string; maxBytes: number } | undefined;
}

export interface Retention {
  // Whether rows past their days or the cap were left for a later tick.
  tick: () => boolean;
}

export function makeRetention(db: DatabaseSync, options: Options): Retention {
  const { log, now = Date.now, maxVerdicts = 150_000, maxBytes = 256 * 1024 * 1024 } = options;
  const { batch = 500, batches = 1 } = options;
  const N = z.object({ n: z.number() });
  // By verdicts_by_time, the oldest first, ties by row; a verdict pending its check stays, its settle to
  // come (F598).
  const sql = {
    oldest: db.prepare(
      "DELETE FROM verdicts WHERE rowid IN (SELECT rowid FROM verdicts WHERE action <> 'pending' ORDER BY at, rowid LIMIT ?)",
    ),
    // A pin ends with Ergo's history: its line's time (Ergo's ISO time, which sorts as a string) past `expire-time`.
    pins: db.prepare("DELETE FROM pins WHERE time < ?"),
    count: db.prepare("SELECT count(*) AS n FROM verdicts"),
    // Counted up to the tick's budget, which is all a tick may take of them.
    old: db.prepare("SELECT count(*) AS n FROM (SELECT 1 FROM verdicts WHERE at < ? AND action <> 'pending' LIMIT ?)"),
    used: db.prepare(
      "SELECT (page_count - freelist_count) * page_size AS n FROM pragma_page_count, pragma_freelist_count, pragma_page_size",
    ),
  };
  const count = (): number => N.parse(sql.count.get()).n;
  // Whether an alert's condition holds now and did not at the last tick: one alert a crossing, armed again once
  // it no longer holds. Each alert is logged by its name written out, which scripts/check_docs.py reads.
  const raised = { verdicts: false, database: false, unreadable: false, ergo: false };
  const rises = (which: keyof typeof raised, holds: boolean): boolean => {
    const was = raised[which];
    raised[which] = holds;
    return holds && !was;
  };
  const near = (value: number, cap: number): boolean => value * 5 >= cap * 4;
  // Ergo's folder against its cap. One that cannot be read is an alert of its own and leaves the near-cap one
  // as it was.
  const measureErgo = (): void => {
    if (options.ergoData === undefined) return;
    const { dir, maxBytes: cap } = options.ergoData;
    let bytes: number | undefined;
    try {
      bytes = sizeOf(dir);
    } catch {
      // A folder that cannot be listed is unreadable, never empty.
    }
    if (rises("unreadable", bytes === undefined)) log("alert", { error: "ergo_volume_unreadable" });
    if (bytes !== undefined && rises("ergo", near(bytes, cap))) log("alert", { error: "ergo_volume_near_cap" });
  };
  return {
    tick() {
      let budget = batch * batches;
      // At most 10 a room: no batch.
      sql.pins.run(new Date(now() - ERGO_EXPIRE_MS).toISOString());
      // The verdicts past their days are the oldest ones: the same walk takes them and those past the cap.
      const old = N.parse(sql.old.get(now() - 180 * 24 * 60 * 60_000, budget)).n;
      for (let over = Math.max(old, count() - maxVerdicts), removed = 1; over > 0 && budget > 0 && removed > 0;) {
        removed = Number(sql.oldest.run(Math.min(batch, budget, over)).changes);
        [over, budget] = [over - removed, budget - removed];
      }
      if (rises("verdicts", near(count(), maxVerdicts))) log("alert", { error: "verdicts_near_cap" });
      if (rises("database", near(N.parse(sql.used.get()).n, maxBytes))) log("alert", { error: "database_near_cap" });
      // A backlog's ticks follow at once: Ergo's folder is walked on the timed ones alone (3NB-8).
      if (budget > 0) measureErgo();
      return budget <= 0;
    },
  };
}

/** The bytes of the files under `dir`, its sub-folders' included, a link as itself: Node's recursive readdir
 * would follow a link to a folder. A file gone between the listing and its measure, as a rewrite leaves, counts as
 * none; a folder that cannot be listed throws. */
export function sizeOf(dir: string, lstat: (path: string) => Stats = lstatSync): number {
  let bytes = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    try {
      bytes += entry.isDirectory() ? sizeOf(path, lstat) : lstat(path).size;
    } catch (error) {
      if (!z.object({ code: z.literal("ENOENT") }).safeParse(error).success) throw error;
    }
  }
  return bytes;
}

/** The retention at start, then every five minutes, until its stop; a tick that left a backlog is followed
 * at once by another, the event loop free between them, so the cap holds whatever comes in (F600). */
export function startRetention(db: DatabaseSync, options: Options & { everyMs?: number }): { stop: () => void } {
  const retention = makeRetention(db, options);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const run = (): void => {
    timer = setTimeout(run, retention.tick() ? 0 : (options.everyMs ?? 5 * 60_000));
  };
  run();
  return {
    stop: () => {
      clearTimeout(timer);
    },
  };
}
