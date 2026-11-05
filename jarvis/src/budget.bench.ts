// The budget's hot path (docs/plans/slice-10.md §4): each model call reserves its worst cost before it starts and
// settles its real one after, on jarvis's own SQLite file (D45), here a real file in WAL mode with the eight holds
// of a busy question beside it. Measured by scripts/bench.py in the full gate.
import { mkdtempSync, rmSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bench, describe } from "vitest";
import { openDatabase } from "@gnoworld/service/db";
import { makeBudget, type Budget } from "./budget.ts";
import { jarvisMigrations } from "./migrations.ts";

// A file of its own for each of tinybench's phases, its warm-up and its run, removed after it: a bench has no afterAll.
let opened: { dir: string; db: DatabaseSync; budget: Budget } | undefined;
const open = (): void => {
  const dir = mkdtempSync(join(tmpdir(), "gnoworld-jarvis-bench-"));
  const db = openDatabase(join(dir, "jarvis.db"), jarvisMigrations);
  const caps = { ask: 45_000_000_000, translate: 5_000_000_000 };
  const budget = makeBudget(db, { caps, holdMs: 10 * 60_000, now: () => Date.now() });
  for (let turn = 0; turn < 8; turn += 1) budget.reserve("ask", 1_000_000);
  opened = { dir, db, budget };
};
const close = (): void => {
  opened?.db.close();
  if (opened !== undefined) rmSync(opened.dir, { recursive: true, force: true });
  opened = undefined;
};

// Each name a literal, so scripts/bench.py sees a bench switched off.
describe("the budget", () => {
  bench(
    "a reserve then its settle [0.2 ms]",
    () => {
      if (opened === undefined) throw new Error("the bench's file is not open");
      const held = opened.budget.reserve("ask", 1_000_000);
      if (!held.ok) throw new Error("the bench's budget refused a call");
      if (opened.budget.settle(held.hold, 1_000).status !== "settled") throw new Error("the bench's settle failed");
    },
    { setup: open, teardown: close },
  );
});
