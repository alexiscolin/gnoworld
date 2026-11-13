import { describe, expect, it } from "vitest";
import { realm } from "./fixture.ts";
import { storeOf, WEEK_BLOCKS } from "./rows.ts";
import { defaultFilters, shelfRows, sortRows, type FilterId, type Ground, type ShelfId } from "./shelves.ts";

const NONE: Ground = { here: () => 0, visited: () => false };
const names = (rows: readonly { name: string }[]) => rows.map((row) => row.name);
const filters = (...ids: FilterId[]) => new Set(ids);
const NO_FILTERS = filters();

const store = storeOf([
  realm("gno.land/r/a/duel", { callers: 3, calls: 40, lastHeight: 900 }),
  realm("gno.land/r/a/duel_v2", { callers: 5, calls: 90, lastHeight: 1000, author: "ann", rise: 12 }),
  realm("gno.land/r/b/counter", { callers: 9, calls: 9, lastHeight: 990 }),
  realm("gno.land/r/b/swap", { callers: 1, calls: 2, functions: [] }),
  realm("gno.land/r/c/pool", { callers: 20, calls: 20, firstHeight: 995 }),
  realm("gno.land/r/c/zzz", { callers: 2, calls: 1 }),
  realm("gno.land/r/c/old", { callers: 2, calls: 5, lastHeight: 1000 - WEEK_BLOCKS - 1 }),
]);
const shelf = (id: ShelfId, on = defaultFilters(), ground = NONE) =>
  names(shelfRows(store, id, { filters: on, ground }));

describe("shelfRows", () => {
  it("holds every latest version but the lab by default, on Today", () => {
    expect(shelf("today")).toEqual(["duel_v2", "swap", "pool", "zzz", "old"]);
    expect(shelf("today", NO_FILTERS)).toHaveLength(7);
  });

  it("shows the lab on its own shelf, past the filter that hides it", () => {
    expect(shelf("lab")).toEqual(["counter"]);
    expect(shelf("games", NO_FILTERS)).toEqual(["duel", "duel_v2"]);
  });

  it("keeps what each filter keeps", () => {
    expect(shelf("today", filters("active"))).toEqual(["duel", "duel_v2", "counter"]);
    expect(shelf("today", filters("fresh"))).toEqual(["pool"]);
    expect(shelf("today", filters("page"))).not.toContain("swap");
    expect(shelf("today", filters("named"))).toEqual(["duel_v2"]);
    expect(shelf("today", filters("heads"))).not.toContain("duel");
    expect(shelf("today", filters("unseen"), { ...NONE, visited: (row) => row.name === "pool" })).not.toContain("pool");
  });

  it("reads the shelves from the file", () => {
    expect(shelf("trending")).toEqual(["duel_v2"]);
    expect(shelf("new")).toEqual(["pool"]);
    expect(shelf("gems")).toEqual(["duel_v2"]);
    expect(shelf("unseen")).toEqual(["duel_v2", "swap", "pool", "zzz", "old"]);
    expect(shelf("unseen", defaultFilters(), { ...NONE, visited: (row) => row.name === "swap" })).not.toContain("swap");
  });

  it("puts the live and the visited on their shelves", () => {
    const ground: Ground = { here: (row) => (row.name === "zzz" ? 4 : 0), visited: (row) => row.name === "old" };
    expect(shelf("live", defaultFilters(), ground)).toEqual(["zzz"]);
    expect(shelf("visited", defaultFilters(), ground)).toEqual(["old"]);
  });
});

describe("sortRows", () => {
  const all = shelfRows(store, "today", { filters: NO_FILTERS, ground: NONE });
  it("orders by what rises, then the latest block, then the callers", () => {
    expect(names(sortRows(all, "trend")).slice(0, 3)).toEqual(["duel_v2", "counter", "duel"]);
  });
  it("orders by callers, calls and name", () => {
    expect(names(sortRows(all, "callers"))[0]).toBe("pool");
    expect(names(sortRows(all, "calls"))[0]).toBe("duel_v2");
    expect(names(sortRows(all, "az"))[0]).toBe("counter");
  });
  it("orders by the first block, the unknown last, and leaves its input alone", () => {
    const order = names(sortRows(all, "newest"));
    expect(order[0]).toBe("pool");
    expect(names(all)[0]).toBe("duel");
    expect(order).toHaveLength(7);
  });
  it("breaks every tie by path, so an order never wavers", () => {
    const tied = storeOf([realm("gno.land/r/a/b"), realm("gno.land/r/a/a")]).rows;
    for (const sort of ["trend", "callers", "calls", "newest"] as const)
      expect(names(sortRows(tied, sort))).toEqual(["a", "b"]);
  });
});
