// What jarvis's two caches share (10k; ADR-0002 §4 and §5: one translation and one digest serve every reader): their
// tables in its file, each row counting its bytes, a table held under its bound by dropping its oldest rows made, never
// the one just written (D191); and one making for the readers who ask for the same thing at once, which stops once none
// of them waits (D192).
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";

export const CACHE_TABLES = `
CREATE TABLE translations (
  hash TEXT NOT NULL CHECK (length(hash) = 64),
  language TEXT NOT NULL,
  made INTEGER NOT NULL,
  text TEXT,
  bytes INTEGER NOT NULL CHECK (bytes > 0),
  PRIMARY KEY (hash, language)
) STRICT;
CREATE INDEX translations_by_made ON translations (made);
CREATE TABLE digests (
  universe TEXT NOT NULL,
  realm TEXT NOT NULL,
  made INTEGER NOT NULL,
  height INTEGER NOT NULL CHECK (height > 0),
  source TEXT NOT NULL CHECK (length(source) = 64),
  card TEXT,
  bytes INTEGER NOT NULL CHECK (bytes > 0),
  PRIMARY KEY (universe, realm)
) STRICT;
CREATE INDEX digests_by_made ON digests (made);
`;

/** The bytes a cache keeps by default: 64 MiB each. */
export const CACHE_BYTES = 64 * 1024 * 1024;

/** What a row written takes: its rowid, its bytes, and those of the row it replaced, if any. */
interface Written {
  readonly rowid: number;
  readonly bytes: number;
  readonly replaced: number;
}

/** The bound of a cache's table: after each write, its oldest rows made are dropped until its bytes fit `maxBytes`. */
export function boundOf(db: DatabaseSync, table: "translations" | "digests", maxBytes: number) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new RangeError("a cache's bound is a count of bytes");
  const Bytes = z.object({ bytes: z.number() });
  const sql = {
    sum: db.prepare(`SELECT COALESCE(SUM(bytes), 0) AS bytes FROM ${table}`),
    oldest: db.prepare(
      `DELETE FROM ${table} WHERE rowid = (SELECT rowid FROM ${table} WHERE rowid <> ? ORDER BY made, rowid LIMIT 1) RETURNING bytes`,
    ),
  };
  // The table's bytes, read once, then kept by each write and drop: jarvis alone writes its file (D45).
  let total = Bytes.parse(sql.sum.get()).bytes;
  return (written: Written): void => {
    total += written.bytes - written.replaced;
    // ponytail: one indexed delete a row dropped, as many as one write's bytes push out.
    while (total > maxBytes) {
      const dropped = sql.oldest.get(written.rowid);
      if (dropped === undefined) return;
      total -= Bytes.parse(dropped).bytes;
    }
  };
}

interface Making<T> {
  readonly result: Promise<T>;
  readonly stop: AbortController;
  waiting: number;
}

/** One making a key for every reader who asks for it while it runs, each answered `gone` once its own signal fires;
 * the making's signal fires once none of its readers waits. */
export function together<T>() {
  // ponytail: one entry a making in flight, as many as the requests jarvis serves at once.
  const running = new Map<string, Making<T>>();
  const start = (key: string, work: (signal: AbortSignal) => Promise<T>): Making<T> => {
    const stop = new AbortController();
    const making: Making<T> = {
      result: work(stop.signal).finally(() => {
        if (running.get(key) === making) running.delete(key);
      }),
      stop,
      waiting: 0,
    };
    running.set(key, making);
    return making;
  };
  return (key: string, work: (signal: AbortSignal) => Promise<T>, signal: AbortSignal): Promise<T | "gone"> => {
    if (signal.aborted) return Promise.resolve("gone");
    const making = running.get(key) ?? start(key, work);
    making.waiting += 1;
    return new Promise<T | "gone">((resolve, reject) => {
      const leave = (): void => {
        making.waiting -= 1;
        // A reader asking next starts a making of its own, never one stopped.
        if (making.waiting === 0) {
          if (running.get(key) === making) running.delete(key);
          making.stop.abort();
        }
        resolve("gone");
      };
      signal.addEventListener("abort", leave, { once: true });
      making.result.then(
        (value) => {
          signal.removeEventListener("abort", leave);
          resolve(value);
        },
        (error: unknown) => {
          signal.removeEventListener("abort", leave);
          reject(error instanceof Error ? error : new Error(String(error)));
        },
      );
    });
  };
}
