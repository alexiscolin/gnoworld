// The server's retention (slice 3's plan, 3n; decision 154): the bot's verdict records kept 180 days and
// below a row cap, the oldest going first, a budget of small batches a tick so a backlog never holds the
// event loop; the verdicts and the database's used pages measured after, with one alert a crossing of 80%.
// The other stores purge themselves (nonces, tokens, tickets, mutes) or hold one row a room or an account.
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { Log } from "../log.ts";

interface Options {
  log: Log;
  now?: () => number;
  // 150,000 verdicts of about 1.2 KB with their indexes (measured), 176 MB; 256 MB for the database.
  maxVerdicts?: number;
  maxBytes?: number;
  // Rows a batch and batches a tick: 10,000 rows at most a tick.
  batch?: number;
  batches?: number;
}

export interface Retention {
  // Whether rows past their days or the cap were left for a later tick.
  tick: () => boolean;
}

export function makeRetention(db: DatabaseSync, options: Options): Retention {
  const { log, now = Date.now, maxVerdicts = 150_000, maxBytes = 256 * 1024 * 1024 } = options;
  const { batch = 500, batches = 20 } = options;
  const N = z.object({ n: z.number() });
  // By verdicts_by_time, the oldest first, ties by row; a verdict pending its check stays, its settle to
  // come (F598).
  const sql = {
    oldest: db.prepare(
      "DELETE FROM verdicts WHERE rowid IN (SELECT rowid FROM verdicts WHERE action <> 'pending' ORDER BY at, rowid LIMIT ?)",
    ),
    count: db.prepare("SELECT count(*) AS n FROM verdicts"),
    // Counted up to the tick's budget, which is all a tick may take of them.
    old: db.prepare("SELECT count(*) AS n FROM (SELECT 1 FROM verdicts WHERE at < ? AND action <> 'pending' LIMIT ?)"),
    used: db.prepare(
      "SELECT (page_count - freelist_count) * page_size AS n FROM pragma_page_count, pragma_freelist_count, pragma_page_size",
    ),
  };
  const count = (): number => N.parse(sql.count.get()).n;
  // Each measure's alert, raised at 80% of its cap and armed again below it.
  const raised = new Set<string>();
  const watch = (name: string, value: number, cap: number): void => {
    if (value * 5 < cap * 4) raised.delete(name);
    else if (!raised.has(name)) {
      raised.add(name);
      log("alert", { error: name });
    }
  };
  return {
    tick() {
      let budget = batch * batches;
      // The verdicts past their days are the oldest ones: the same walk takes them and those past the cap.
      const old = N.parse(sql.old.get(now() - 180 * 24 * 60 * 60_000, budget)).n;
      for (let over = Math.max(old, count() - maxVerdicts), removed = 1; over > 0 && budget > 0 && removed > 0;) {
        removed = Number(sql.oldest.run(Math.min(batch, budget, over)).changes);
        [over, budget] = [over - removed, budget - removed];
      }
      watch("verdicts_near_cap", count(), maxVerdicts);
      watch("database_near_cap", N.parse(sql.used.get()).n, maxBytes);
      return budget <= 0;
    },
  };
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
