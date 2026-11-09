// The palette's first part, once words are typed: the chips, the results in the room left and the keys' hints.
import { Chip, Cluster, Select } from "@gnoworld/ui";
import type { ReactNode } from "react";
import styles from "./SearchDialog.module.css";
import type { usePalette } from "./usePalette.ts";
import { FilterRow, ToggleChips } from "./ToggleChips.tsx";
import { FILTERS, SORTS } from "./types.ts";

const HINTS: readonly [string, string][] = [
  ["↑↓", "choose"],
  ["↵", "go"],
  ["⇧↵", "chat"],
  ["⌘C", "copy link"],
  ["tab", "filters"],
];

export function PaletteLeft({ palette, children }: { palette: ReturnType<typeof usePalette>; children: ReactNode }) {
  const { query, filters, toggle, namespace, namespaces, only, sort, order } = palette;
  return (
    <div className={styles["left"]}>
      <div role="group" aria-label="Filters">
        <FilterRow
          chips={
            <>
              <ToggleChips items={FILTERS} selected={filters} onToggle={toggle} />
              {(query.trimStart().startsWith("@") || namespace !== undefined ? namespaces : []).map((name) => (
                <Chip
                  key={name}
                  selected={namespace === name}
                  onClick={() => {
                    only(name);
                  }}
                >
                  {`@${name}`}
                </Chip>
              ))}
            </>
          }
          sort={
            <Select
              label="Sort by"
              value={sort}
              options={SORTS}
              onChange={(value) => {
                order(SORTS.find((each) => each.value === value)?.value ?? "relevance");
              }}
            />
          }
        />
      </div>
      <div className={styles["results"]}>{children}</div>
      <div className={styles["hints"]}>
        <Cluster space="xs">
          {HINTS.map(([key, what]) => (
            <span key={key}>
              <kbd>{key}</kbd> {what}
            </span>
          ))}
        </Cluster>
      </div>
    </div>
  );
}
