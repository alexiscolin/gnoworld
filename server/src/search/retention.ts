import type { DatabaseSync } from "node:sqlite";
import type { Log } from "@gnoworld/service/log";
import { guarded } from "./guard.ts";

// The index's lines taken in a tick: deleting a line costs its full-text entries too, about 0.1 ms each at 400,000 lines.
const SEARCH_BATCH = 250;

/** One batch of the index a tick, a small one (about 25 ms at its cap): the budget left after it, none when it came back full so the
 * next tick follows at once. A removed line's text leaves the write-ahead log, which a checkpoint empties: at most one tick after a REDACT. */
export function expireIndex(
  {
    db,
    log,
    search,
    batch,
  }: { db: DatabaseSync; log: Log; search: { expire: (limit: number) => number } | undefined; batch: number },
  budget: number,
): number {
  if (search === undefined || budget <= 0) return budget;
  const guard = guarded(log);
  const asked = Math.min(SEARCH_BATCH, batch, budget);
  const taken = guard("expire", () => search.expire(asked), 0);
  guard(
    "checkpoint",
    () => {
      db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    },
    undefined,
  );
  return taken === asked ? 0 : budget - taken;
}
