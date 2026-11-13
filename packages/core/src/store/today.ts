// Discover's first page, Today (D373): a few rows of realms, each a rule over the shelves, and the three next stops of a realm.
import type { Store, StoreRow } from "./rows.ts";
import type { StyleId } from "./styles.ts";
import { shelfRows, sortRows, type Ground, type ShelfId, type SortId, type View } from "./shelves.ts";

export interface TodayRow {
  id: string;
  title: string;
  /** What the row is made of, in words that claim no more than the file gives. */
  why: string;
  /** The shelf its "See all" opens; none for a row that is only for this reader. */
  shelf?: ShelfId;
  rows: StoreRow[];
}

/** A row's realms: ten at most. */
export const ROW_SIZE = 10;

const GAMES_PAGE = (row: StoreRow) => row.styles.includes("games") && row.page;

export function todayOf(store: Store, view: View): TodayRow[] {
  const { ground } = view;
  const pool = shelfRows(store, "today", view);
  const of = (shelf: ShelfId, sort: SortId) => sortRows(shelfRows(store, shelf, view), sort);
  const seen = new Set(pool.filter((row) => ground.visited(row)).flatMap((row) => row.styles));
  const rows: TodayRow[] = [
    {
      id: "trending",
      title: "Recently active",
      why: "called lately, the busiest first",
      shelf: "trending",
      rows: of("trending", "trend"),
    },
    { id: "new", title: "New this week", why: "first seen in the last days", shelf: "new", rows: of("new", "newest") },
    {
      id: "games",
      title: "Play on-chain",
      why: "games with a page",
      shelf: "games",
      rows: sortRows(pool.filter(GAMES_PAGE), "callers"),
    },
    {
      id: "defi",
      title: "Make and trade tokens",
      why: "tokens and DeFi",
      shelf: "defi",
      rows: sortRows(
        pool.filter((row) => row.styles.includes("tokens") || row.styles.includes("defi")),
        "callers",
      ),
    },
    { id: "dao", title: "Govern together", why: "DAOs and votes", shelf: "dao", rows: of("dao", "callers") },
    {
      id: "gems",
      title: "Hidden gems",
      why: "a page, a few callers, a style",
      shelf: "gems",
      rows: of("gems", "calls"),
    },
    {
      id: "because",
      title: "Because you visited",
      why: "the same styles, elsewhere",
      rows: sortRows(
        pool.filter((row) => !ground.visited(row) && row.styles.some((style) => seen.has(style))),
        "callers",
      ),
    },
  ];
  return rows.filter((row) => row.rows.length > 0).map((row) => ({ ...row, rows: row.rows.slice(0, ROW_SIZE) }));
}

export interface Stop {
  row: StoreRow;
  why: "style" | "author";
}

/** Three stops after a realm: one of its author's, if any, and the busiest of its styles elsewhere (a lab counts for none); latest versions. */
export function nextStops(store: Store, of: StoreRow): Stop[] {
  const styles: readonly StyleId[] = of.styles.filter((style) => style !== "lab");
  const others = store.rows.filter((row) => row.head && row.id !== of.id);
  const mine = others.filter((row) => row.namespace === of.namespace).slice(0, 1);
  const alike = sortRows(
    others.filter((row) => !mine.includes(row) && row.styles.some((style) => styles.includes(style))),
    "callers",
  ).slice(0, 3 - mine.length);
  return [...alike.map((row): Stop => ({ row, why: "style" })), ...mine.map((row): Stop => ({ row, why: "author" }))];
}

/** One realm that was called and not visited, chosen by `at`, a number from 0 up to 1 (the page rolls it); none where there is none. */
export function surprise(rows: readonly StoreRow[], ground: Ground, at: number): StoreRow | undefined {
  const pool = rows.filter((row) => row.calls > 0 && !ground.visited(row));
  return pool[Math.floor(at * pool.length)];
}
