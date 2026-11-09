import { Chip, Cluster, Sidebar } from "@gnoworld/ui";
import type { ReactNode } from "react";

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

/** The chips wrapping whole, never cut (Alexis, 2026-11-08: "c'est coupé"), the sort at the row's end: the palette's filters and
 * Discover's. */
export function FilterRow({ chips, sort }: { chips: ReactNode; sort: ReactNode }) {
  return (
    <Sidebar side="end" space="2xs" align="center">
      <Cluster space="2xs">{chips}</Cluster>
      {sort}
    </Sidebar>
  );
}
