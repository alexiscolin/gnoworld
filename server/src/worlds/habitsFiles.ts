import type { DatabaseSync } from "node:sqlite";
import { dirname, join } from "node:path";

/** What the worlds job keeps: the trends' two files beside the database (7t3), counts alone, none for a database in memory; each realm's
 * rollup (13a), its state in the database and its files in a folder beside the worlds' file, which nginx serves. */
export const keptBy = (database: string, db: DatabaseSync, worlds: string) => ({
  rollup: { db, dir: join(dirname(worlds), "rollups") },
  ...(database === ":memory:"
    ? {}
    : {
        habits: {
          transactions: join(dirname(database), "trends-transactions.json"),
          addresses: join(dirname(database), "trends-addresses.json"),
        },
      }),
});
