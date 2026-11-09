import { describe, expect, it } from "vitest";
import { realm } from "./fixture.ts";
import { DAY_BLOCKS, storeOf, WEEK_BLOCKS } from "./rows.ts";

describe("storeOf", () => {
  it("derives each row's name, styles, family and what its fields say", () => {
    const { rows } = storeOf([
      realm("gno.land/r/me/connect4", { author: "me", lastHeight: 100 }),
      realm("gno.land/r/me/zzz", { functions: [] }),
    ]);
    expect(rows[0]).toMatchObject({ id: 0, name: "connect4", styles: ["games"], page: true, known: true, lab: false });
    expect(rows[1]).toMatchObject({ id: 1, styles: [], page: false, known: false });
  });

  it("measures the age from the newest last block, and calls a day's blocks active", () => {
    const store = storeOf([
      realm("gno.land/r/a/x", { lastHeight: 1_000_000 }),
      realm("gno.land/r/a/y", { lastHeight: 1_000_000 - DAY_BLOCKS + 1 }),
      realm("gno.land/r/a/z", { lastHeight: 1_000_000 - DAY_BLOCKS }),
      realm("gno.land/r/a/w", { lastHeight: 1_000_000 - WEEK_BLOCKS }),
      realm("gno.land/r/a/v"),
    ]);
    expect(store.newest).toBe(1_000_000);
    expect(store.rows.map((row) => [row.active, row.recent])).toEqual([
      [true, true],
      [true, true],
      [false, true],
      [false, false],
      [false, false],
    ]);
    expect(store.rows[4]?.age).toBeNull();
  });

  it("calls new a first block within a week, and says whether any realm has one", () => {
    const store = storeOf([
      realm("gno.land/r/a/x", { firstHeight: 1_000_000, lastHeight: 1_000_000 }),
      realm("gno.land/r/a/y", { firstHeight: 1_000_000 - WEEK_BLOCKS }),
    ]);
    expect(store.rows.map((row) => row.fresh)).toEqual([true, false]);
    expect(store.hasFirst).toBe(true);
    expect(storeOf([realm("gno.land/r/a/x")]).hasFirst).toBe(false);
  });

  it("lets the newest last block of a family stand for it", () => {
    const { rows } = storeOf([
      realm("gno.land/r/a/duel", { lastHeight: 10 }),
      realm("gno.land/r/a/duel_v2", { lastHeight: 30 }),
      realm("gno.land/r/a/duel_v3", { lastHeight: 20 }),
      realm("gno.land/r/a/solo"),
    ]);
    expect(rows.map((row) => row.head)).toEqual([false, true, false, true]);
  });

  it("keeps the first of a family whose versions have no block, and has no newest of an empty file", () => {
    expect(storeOf([realm("gno.land/r/a/x"), realm("gno.land/r/a/x_v2")]).rows.map((row) => row.head)).toEqual([
      true,
      false,
    ]);
    expect(storeOf([])).toMatchObject({ rows: [], newest: null, hasFirst: false });
  });
});
