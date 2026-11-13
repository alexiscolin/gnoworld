import { useState, type ReactNode } from "react";
import { Button } from "../Button/Button.tsx";
import { Cluster, Stack } from "../compositions/index.ts";
import { Field } from "../Field/Field.tsx";
import { Tabs } from "../Tabs/Tabs.tsx";
import { EmptyState } from "../EmptyState/EmptyState.tsx";
import styles from "./PagedList.module.css";

/** The button under a list that shows more of it: "Show N more" ("Show more" with no count), outlined, with its chevron, never bare words. */
export function ShowMore({ count, onMore, busy = false }: { count?: number; onMore: () => void; busy?: boolean }) {
  return (
    <Button size="s" icon="chevron" busy={busy} onClick={onMore}>
      {count === undefined ? "Show more" : `Show ${String(count)} more`}
    </Button>
  );
}

/** The most rows it ever shows: past it, "more" leaves for the explorer. */
const LIST_MAX = 100;
/** The longest filter. */
const FILTER_MAX = 64;
const PAGE = 12;
const NO_SORTS: readonly never[] = [];
// What a list that is not told otherwise does.
const DEFAULTS = {
  sorts: NO_SORTS,
  empty: "Nothing matches.",
  expanded: false,
  page: PAGE,
  bare: false,
  counted: true,
};

export interface PagedSort<T> {
  id: string;
  label: string;
  compare: (a: T, b: T) => number;
}

export interface PagedListProps<T> {
  /** Names the list and its filter. */
  label: string;
  items: readonly T[];
  /** A row's key, and the words the filter reads in it. */
  keyOf: (item: T) => string;
  textOf: (item: T) => string;
  render: (item: T) => ReactNode;
  /** A closed list of orders, the first the one it opens with; none shows no tabs. */
  sorts?: readonly PagedSort<T>[];
  /** Where the rest is when there are more than 100 rows. */
  explorer?: { href: string; label: string };
  /** What it says when no row is left. */
  empty?: string;
  /** Opened in place by its card's Expand: the hundred at once. */
  expanded?: boolean;
  /** A word after the count at its foot ("the last 60 of 771 calls"). */
  note?: string;
  /** How many rows it opens with and adds: 12 unless the card is small (the plate's calls: 3). */
  page?: number;
  /** No filter and no sorts till its card is open: the card shows only its few rows (`expanded` opens them). */
  bare?: boolean;
  /** The foot that counts the rows: always, unless a short list says it with no foot. */
  counted?: boolean;
}

// The filter and the sorts, on one row.
function Controls<T>({
  label,
  sorts,
  sortId,
  onSort,
  filter,
  onFilter,
}: {
  label: string;
  sorts: readonly PagedSort<T>[];
  sortId: string | null;
  onSort: (id: string) => void;
  filter: string;
  onFilter: (value: string) => void;
}) {
  return (
    <Cluster space="xs">
      <div className={styles["filter"]}>
        <Field
          label={`Filter ${label}`}
          hideLabel
          shape="pill"
          placeholder="Filter by name or path"
          value={filter}
          onChange={onFilter}
        />
      </div>
      {sorts.length === 0 ? null : (
        <Tabs
          label={`Sort ${label}`}
          size="xs"
          tabs={sorts.map(({ id, label: name }) => ({ id, label: name }))}
          selected={sortId}
          onSelect={onSort}
        />
      )}
    </Cluster>
  );
}

// The foot: how many rows of how many, and the button that adds a page, or leaves for the explorer past the hundred.
function Foot({
  drawn,
  total,
  all,
  note,
  page,
  onMore,
  explorer,
}: {
  drawn: number;
  total: number;
  all: { matching: number; items: number };
  note: string | undefined;
  page: number;
  onMore: () => void;
  explorer: { href: string; label: string } | undefined;
}) {
  const more = total - drawn;
  return (
    <Cluster justify="between" space="xs">
      <span className="meta">
        {drawn} of {total}
        {all.matching < all.items ? ` matching, ${String(all.items)} in all` : ""}
        {note === undefined ? "" : ` \u00b7 ${note}`}
      </span>
      {more > 0 ? (
        <ShowMore count={Math.min(page, more)} onMore={onMore} />
      ) : all.matching > LIST_MAX && explorer !== undefined ? (
        <Button size="s" href={explorer.href} icon="arrow-up-right">
          {explorer.label}
        </Button>
      ) : null}
    </Cluster>
  );
}

/** A list of 12 rows with its filter (64 characters, a plain search of the row's words) and its sorts, shown once there are more than 12
 * rows, and a foot that counts them and adds 12 up to 100; what is past 100 is the explorer's. Rows are told apart by a hairline. */
export function PagedList<T>(props: PagedListProps<T>) {
  const { label, items, keyOf, textOf, render, sorts, explorer, empty, expanded, note, page, bare, counted } = {
    ...DEFAULTS,
    ...props,
  };
  const [filter, setFilter] = useState("");
  const [sortId, setSortId] = useState(sorts.at(0)?.id ?? null);
  const [shown, setShown] = useState(page);
  const needle = filter.toLowerCase();
  const sort = sorts.find((s) => s.id === sortId);
  const matching = items.filter((item) => textOf(item).toLowerCase().includes(needle));
  const rows = (sort === undefined ? matching : matching.toSorted(sort.compare)).slice(0, LIST_MAX);
  const shownNow = expanded ? LIST_MAX : shown;
  const drawn = rows.slice(0, shownNow);
  return (
    <Stack space="s">
      {items.length <= PAGE || (bare && !expanded) ? null : (
        <Controls
          label={label}
          sorts={sorts}
          sortId={sortId}
          onSort={setSortId}
          filter={filter}
          onFilter={(value) => {
            setFilter(value.slice(0, FILTER_MAX));
            setShown(page);
          }}
        />
      )}
      {rows.length === 0 ? (
        <EmptyState look="inline" line={empty} />
      ) : (
        <ul className={styles["rows"]}>
          {drawn.map((item) => (
            <li key={keyOf(item)}>{render(item)}</li>
          ))}
        </ul>
      )}
      {counted ? (
        <Foot
          drawn={drawn.length}
          total={rows.length}
          all={{ matching: matching.length, items: items.length }}
          note={note}
          page={page}
          onMore={() => {
            setShown(shown + page);
          }}
          explorer={explorer}
        />
      ) : null}
    </Stack>
  );
}
