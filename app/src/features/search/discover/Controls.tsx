// Above the cards: the style chips on a phone, the filters and the sort. Filters that need what the file does not give yet (the first block) are
// not offered.
import { STYLES, type FilterId, type SortId } from "@gnoworld/core";
import { Chip, Select, Stack } from "@gnoworld/ui";
import { FilterRow, ToggleChips } from "../ToggleChips.tsx";
import styles from "./Discover.module.css";
import type { Discovery } from "./useDiscover.ts";

const FILTERS: readonly { id: FilterId; label: string; first?: true }[] = [
  { id: "active", label: "Active in 24 h" },
  { id: "fresh", label: "New", first: true },
  { id: "page", label: "Has a page" },
  { id: "named", label: "Known author" },
  { id: "unseen", label: "Not visited" },
  { id: "heads", label: "Latest versions only" },
  { id: "hideLab", label: "Hide lab" },
];
const SORTS: readonly { value: SortId; label: string; first?: true }[] = [
  { value: "trend", label: "Recently active" },
  { value: "callers", label: "Most callers" },
  { value: "calls", label: "Most calls" },
  { value: "newest", label: "Newest", first: true },
  { value: "az", label: "A–Z" },
];

export function Controls({ discovery }: { discovery: Discovery }) {
  const { shelf, filters, sort, store, show, toggle, order } = discovery;
  const sorts = SORTS.filter((each) => each.first !== true || store.hasFirst);
  return (
    <div role="group" aria-label="Styles and filters">
      <Stack space="2xs">
        {/* The styles' chips are a phone's way to the styles' shelves, which the column at the left offers on a computer (Alexis,
            2026-11-08: "une répétition de la colonne"). */}
        <div className={styles["styleChips"]}>
          <div className="scroll-row">
            {STYLES.filter(({ id }) => id !== "lab").map(({ id, label }) => (
              <span key={id}>
                <Chip
                  selected={shelf === id}
                  onClick={() => {
                    show(shelf === id ? "today" : id);
                  }}
                >
                  {label}
                </Chip>
              </span>
            ))}
          </div>
        </div>
        <FilterRow
          chips={
            <ToggleChips
              items={FILTERS.filter((each) => each.first !== true || store.hasFirst)}
              selected={filters}
              onToggle={toggle}
            />
          }
          sort={
            <Select
              label="Sort by"
              value={sorts.some((each) => each.value === sort) ? sort : "trend"}
              options={sorts}
              onChange={(value) => {
                order(sorts.find((each) => each.value === value)?.value ?? "trend");
              }}
            />
          }
        />
      </Stack>
    </div>
  );
}
