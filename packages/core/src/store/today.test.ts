import { describe, expect, it } from "vitest";
import { crowd, realm } from "./fixture.ts";
import { storeOf } from "./rows.ts";
import { defaultFilters, type Ground } from "./shelves.ts";
import { nextStops, ROW_SIZE, surprise, todayOf } from "./today.ts";

const NONE: Ground = { here: () => 0, visited: () => false };

describe("todayOf", () => {
  it("makes a row of each shelf that holds a realm, and none of an empty one", () => {
    const store = storeOf([
      realm("gno.land/r/a/duel_v2", { callers: 5, calls: 90, lastHeight: 1000, rise: 12 }),
      realm("gno.land/r/b/swap", { callers: 1, calls: 2, functions: [] }),
      realm("gno.land/r/c/pool", { callers: 20, calls: 20, firstHeight: 995 }),
    ]);
    const rows = todayOf(store, { filters: defaultFilters(), ground: NONE });
    expect(rows.map(({ id, rows: held }) => [id, held.map((row) => row.name)])).toEqual([
      ["trending", ["duel_v2"]],
      ["new", ["pool"]],
      ["games", ["duel_v2"]],
      ["defi", ["pool", "swap"]],
      ["gems", ["duel_v2"]],
    ]);
  });

  it("adds what is like the visited, never the visited, and caps a row at ten", () => {
    const rows = todayOf(storeOf(crowd(400)), {
      filters: defaultFilters(),
      ground: { here: () => 0, visited: (row) => row.id === 0 },
    });
    const because = rows.find((row) => row.id === "because");
    expect(because?.rows.length).toBeGreaterThan(0);
    expect(because?.rows.some((row) => row.id === 0)).toBe(false);
    expect(Math.max(...rows.map((row) => row.rows.length))).toBe(ROW_SIZE);
  });
});

describe("nextStops", () => {
  const store = storeOf([
    realm("gno.land/r/a/duel", { callers: 1 }),
    realm("gno.land/r/b/chess", { callers: 5 }),
    realm("gno.land/r/c/arena", { callers: 9 }),
    realm("gno.land/r/a/zzz"),
    realm("gno.land/r/d/dice", { callers: 2 }),
    realm("gno.land/r/e/casino", { callers: 3 }),
  ]);
  it("gives one of the author's and the busiest of the style elsewhere, three at most, never the realm", () => {
    const [duel] = store.rows;
    expect(duel === undefined ? [] : nextStops(store, duel).map(({ row, why }) => [row.name, why])).toEqual([
      ["arena", "style"],
      ["chess", "style"],
      ["zzz", "author"],
    ]);
  });
  it("gives the style alone to an author with one realm, and none to a realm like no other", () => {
    const [, chess, , zzz] = store.rows;
    expect(chess === undefined ? [] : nextStops(store, chess).map(({ row }) => row.name)).toEqual([
      "arena",
      "casino",
      "dice",
    ]);
    expect(zzz === undefined ? [] : nextStops(store, zzz).map(({ row, why }) => [row.name, why])).toEqual([
      ["duel", "author"],
    ]);
  });
});

describe("surprise", () => {
  const rows = storeOf([
    realm("gno.land/r/a/x", { calls: 1 }),
    realm("gno.land/r/a/y", { calls: 1 }),
    realm("gno.land/r/a/z"),
  ]).rows;
  it("picks one realm that was called and not visited, by a number from 0 up to 1", () => {
    expect(surprise(rows, NONE, 0)?.name).toBe("x");
    expect(surprise(rows, NONE, 0.99)?.name).toBe("y");
  });
  it("picks none where nothing is left", () => {
    expect(surprise(rows, { ...NONE, visited: () => true }, 0.5)).toBeUndefined();
  });
});
