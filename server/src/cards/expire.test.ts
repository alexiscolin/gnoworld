import { openDatabase } from "@gnoworld/service/db";
import { describe, expect, it, vi } from "vitest";
import { migrations } from "../migrations.ts";
import { makeRetention } from "../retention/retention.ts";

// L3 (docs/plans/link-previews.md §4 "Storage growth"): the retention tick takes the cards' expiry in what the verdicts leave of its budget,
// as it does the search index's, and a cards expiry that throws never stops the tick (the guard of search/guard.ts).
const T0 = Date.parse("2026-11-11T12:00:00.000Z");

describe("the retention tick and the cards", () => {
  it("asks the cards to expire, with the tick's budget, and reports a backlog left for a later tick", () => {
    const db = openDatabase(":memory:", migrations);
    const expire = vi.fn((limit: number) => limit);
    const retention = makeRetention(db, { log: () => undefined, now: () => T0, batch: 100, cards: { expire } });
    expect(retention.tick()).toBe(true);
    expect(expire).toHaveBeenCalledOnce();
    expect(expire.mock.calls[0]?.[0]).toBeGreaterThan(0);
    expect(expire.mock.calls[0]?.[0]).toBeLessThanOrEqual(100);
    db.close();
  });

  it("says nothing is left when the cards had less than the budget", () => {
    const db = openDatabase(":memory:", migrations);
    const expire = vi.fn(() => 0);
    const retention = makeRetention(db, { log: () => undefined, now: () => T0, cards: { expire } });
    expect(retention.tick()).toBe(false);
    expect(expire).toHaveBeenCalledOnce();
    db.close();
  });

  it("goes on when the cards' expiry throws, logging the failure and never its message", () => {
    const db = openDatabase(":memory:", migrations);
    const lines: { event: string; fields: unknown }[] = [];
    const retention = makeRetention(db, {
      log: (event, fields) => lines.push({ event, fields }),
      now: () => T0,
      cards: {
        expire: () => {
          throw new Error("secret detail");
        },
      },
    });
    expect(() => retention.tick()).not.toThrow();
    expect(JSON.stringify(lines)).not.toContain("secret detail");
    expect(lines.length).toBeGreaterThan(0);
    db.close();
  });
});
