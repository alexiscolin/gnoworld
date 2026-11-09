// The shelves, the filters and the sorts of Discover (D373), as rules over the store's rows. What changes while the palette is open (who is
// here, what this device visited) comes in as the `Ground`, so the rows are built once and a filter or a sort is one pass over them.
import type { StoreRow, Store } from "./rows.ts";
import { STYLES, type StyleId } from "./styles.ts";

export type ShelfId = "today" | "trending" | "new" | "live" | "gems" | "unseen" | "visited" | StyleId;
export type FilterId = "active" | "fresh" | "page" | "named" | "unseen" | "heads" | "hideLab";
export type SortId = "trend" | "callers" | "calls" | "newest" | "az";

/** What Discover starts with: the newest versions only, and no lab. */
export const defaultFilters = (): ReadonlySet<FilterId> => new Set<FilterId>(["heads", "hideLab"]);

/** What narrows a view of the store: the filters, and the ground they are read on. */
export interface View {
  filters: ReadonlySet<FilterId>;
  ground: Ground;
}

/** What the page knows of a realm that the file does not: the people in it, and whether this reader has been. */
export interface Ground {
  here: (row: StoreRow) => number;
  visited: (row: StoreRow) => boolean;
}

/** A realm with a few callers, a page and a style: worth finding. */
const GEM_CALLERS = 6;
const isGem = (row: StoreRow) =>
  row.callers > 0 && row.callers <= GEM_CALLERS && row.page && row.styles.some((s) => s !== "lab");

const SHELF_TESTS: Readonly<Record<Exclude<ShelfId, StyleId>, (row: StoreRow, ground: Ground) => boolean>> = {
  today: () => true,
  trending: (row) => (row.rise ?? 0) > 0 || row.recent,
  new: (row) => row.fresh,
  live: (row, ground) => ground.here(row) > 0,
  gems: isGem,
  unseen: (row, ground) => row.calls > 0 && !ground.visited(row),
  visited: (row, ground) => ground.visited(row),
};

const FILTER_TESTS: Readonly<Record<FilterId, (row: StoreRow, ground: Ground) => boolean>> = {
  active: (row) => row.active,
  fresh: (row) => row.fresh,
  page: (row) => row.page,
  named: (row) => row.known,
  unseen: (row, ground) => !ground.visited(row),
  heads: (row) => row.head,
  hideLab: (row) => !row.lab,
};

const isStyle = (shelf: ShelfId): shelf is StyleId => STYLES.some(({ id }) => id === shelf);

/** The rows of a shelf that pass the filters; the lab is let through on its own shelf. */
export function shelfRows(store: Store, shelf: ShelfId, { filters, ground }: View): StoreRow[] {
  const keep = [...filters].filter((id) => id !== "hideLab" || shelf !== "lab");
  const onShelf = isStyle(shelf)
    ? (row: StoreRow) => row.styles.includes(shelf)
    : (row: StoreRow) => SHELF_TESTS[shelf](row, ground);
  return store.rows.filter((row) => keep.every((id) => FILTER_TESTS[id](row, ground)) && onShelf(row));
}

const byPath = (a: StoreRow, b: StoreRow) => Number(a.path > b.path) - Number(a.path < b.path);
const SORTERS: Readonly<Record<SortId, (a: StoreRow, b: StoreRow) => number>> = {
  trend: (a, b) =>
    (b.rise ?? 0) - (a.rise ?? 0) ||
    (b.lastHeight ?? -1) - (a.lastHeight ?? -1) ||
    b.callers - a.callers ||
    b.calls - a.calls,
  callers: (a, b) => b.callers - a.callers || b.calls - a.calls,
  calls: (a, b) => b.calls - a.calls || b.callers - a.callers,
  newest: (a, b) => (b.firstHeight ?? -1) - (a.firstHeight ?? -1),
  az: (a, b) => a.name.localeCompare(b.name),
};

/** The rows in an order, the same one each time (a tie goes by path); the input is left as it was. */
export function sortRows(rows: readonly StoreRow[], sort: SortId): StoreRow[] {
  return rows.toSorted((a, b) => SORTERS[sort](a, b) || byPath(a, b));
}
