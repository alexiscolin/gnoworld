// A jarvis file whose day is spent (row 10: "at 100% of the budget Jarvis stops"): its budgets of $1 each reserved and
// settled at $1 by jarvis's own budget, so the jarvis started on it answers spent to everything that day, as it would
// at the cap, and its route's own words, not ours, are what the case reads.
import { openDatabase } from "../packages/service/src/db.ts";
import { makeBudget } from "../jarvis/src/budget.ts";
import { jarvisMigrations } from "../jarvis/src/migrations.ts";
import { DOLLAR } from "../jarvis/src/prices.ts";

export function seedSpent(path: string): void {
  const db = openDatabase(path, jarvisMigrations);
  try {
    const budget = makeBudget(db, { caps: { ask: DOLLAR, translate: DOLLAR }, holdMs: 60_000, now: Date.now });
    for (const kind of ["ask", "translate"] as const) {
      const reserved = budget.reserve(kind, DOLLAR);
      if (!reserved.ok) throw new Error(`evals: the ${kind} budget refused its seed`);
      budget.settle(reserved.hold, DOLLAR);
    }
  } finally {
    db.close();
  }
}
