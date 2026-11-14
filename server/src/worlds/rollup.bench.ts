// The rollup's build (slice 13a, plan §4): a page's calls kept in the state, then a realm's file shed to its cap, at n, 4n and 16n calls,
// which should grow linearly. An in-memory database each run, opened in its setup. Measured by scripts/bench.py, run by hand.
import type { DatabaseSync } from "node:sqlite";
import { bench, describe } from "vitest";
import { openDatabase } from "@gnoworld/service/db";
import type { Row } from "./history.ts";
import { fitted } from "./rollup.ts";
import { PEOPLE_TABLES } from "./personTables.ts";
import { ROLLUP_TABLES, rollupStore } from "./rollupStore.ts";

const PATH = "gno.land/r/gnops/valopers";
const BECH32 = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const addressOf = (n: number): string =>
  `g1${Array.from({ length: 38 }, (_, i) => BECH32[Math.floor(n / 32 ** i) % 32] ?? "q").join("")}`;

// `calls` calls over 50 days from 1,000 callers and 50 functions, in pages of 2,000, then the realm's file.
function build(db: DatabaseSync, calls: number): void {
  const store = rollupStore(db, "onyx");
  for (let at = 0; at < calls; at += 2_000) {
    const rows: Row[] = [];
    const days = new Map<number, string>();
    for (let i = at; i < Math.min(calls, at + 2_000); i += 1) {
      rows.push({
        height: i + 1,
        success: true,
        skipped: 0,
        calls: [{ path: PATH, caller: addressOf(i % 1_000), func: `F${String(i % 50)}` }],
      });
      days.set(
        i + 1,
        new Date(Date.UTC(2026, 0, 1) + Math.floor((i * 50) / calls) * 86_400_000).toISOString().slice(0, 10),
      );
    }
    store.add(rows, { days, times: new Map() }, at + 2_000);
  }
  const whole = store.rollupOf(PATH, undefined, "2026-11-10T10:00:00.000Z");
  if (whole === undefined || fitted(whole) === undefined) throw new Error("the bench built no file");
}

let db: DatabaseSync | undefined;
const options = {
  iterations: 3,
  setup: () => {
    db = openDatabase(":memory:", [ROLLUP_TABLES, PEOPLE_TABLES]);
  },
  teardown: () => {
    db?.close();
  },
};
const run = (calls: number) => () => {
  if (db === undefined) throw new Error("the bench's database is not open");
  build(db, calls);
};

describe("the rollup's build", () => {
  bench("10,000 calls [60 ms]", run(10_000), options);
  bench("40,000 calls [300 ms]", run(40_000), options);
  bench("160,000 calls [1200 ms]", run(160_000), options);
});
