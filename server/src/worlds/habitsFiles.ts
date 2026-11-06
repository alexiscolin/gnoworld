import { dirname, join } from "node:path";

/** The trends' two files beside the database (7t3), counts alone; none for a database in memory. */
export const habitsBeside = (database: string) =>
  database === ":memory:"
    ? {}
    : {
        habits: {
          transactions: join(dirname(database), "trends-transactions.json"),
          addresses: join(dirname(database), "trends-addresses.json"),
        },
      };
