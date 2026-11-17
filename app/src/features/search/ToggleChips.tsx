import { Chip, Cluster, Sidebar } from "@gnoworld/ui";
import type { ReactNode } from "react";
import styles from "./SearchDialog.module.css";

/** One chip per filter, lit while `selected` holds it; shared by the palette's filters and Discover's. */
export function ToggleChips<Id extends string>({
  items,
  selected,
  onToggle,
}: {
  items: readonly { id: Id; label: string }[];
  selected: ReadonlySet<Id>;
  onToggle: (id: Id) => void;
}) {
  return items.map(({ id, label }) => (
    <Chip
      key={id}
      selected={selected.has(id)}
      onClick={() => {
        onToggle(id);
      }}
    >
      {label}
    </Chip>
  ));
}

/** The chips wrapping whole, never cut, the sort at the row's end: the palette's filters and
 * Discover's. On a phone the chips are one row that scrolls across (Cluster's own phone rule). */
export function FilterRow({ chips, sort }: { chips: ReactNode; sort: ReactNode }) {
  return (
    <Sidebar side="end" space="2xs" align="center" className={styles["filterRow"]}>
      <Cluster space="2xs" wrap="scroll">
        {chips}
      </Cluster>
      {sort}
    </Sidebar>
  );
}
