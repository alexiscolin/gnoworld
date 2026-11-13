// The palette's first part, once words are typed: the chips, the results in the room left and the keys' hints.
import { Chip, Cluster, Select, Sidebar } from "@gnoworld/ui";
import type { ReactNode } from "react";
import styles from "./SearchDialog.module.css";
import type { usePalette } from "./usePalette.ts";
import { ToggleChips } from "./ToggleChips.tsx";
import { FILTERS, RANKED, SORTS, TABS } from "./types.ts";

const HINTS: readonly [string, string][] = [
  ["↑↓", "choose"],
  ["↵", "go"],
  ["⇧↵", "chat"],
  ["⌘C", "copy link"],
  ["tab", "filters"],
];

export function PaletteLeft({ palette, children }: { palette: ReturnType<typeof usePalette>; children: ReactNode }) {
  const { ranked, query, filters, toggle, namespace, namespaces, only, sort, order, tab, counts, pick } = palette;
  // The chips narrow places alone: they show where places are asked for.
  const sorts = SORTS.filter(({ value }) => ranked || !RANKED.some((each) => each === value));
  const chips = tab === "all" || tab === "places";
  return (
    <div className={styles["left"]}>
      <div className={styles["head"]}>
        {/* The sort ends the kinds' row; the chips wrap freely under it. */}
        <Sidebar side="end" space="2xs" align="center">
          <div role="group" aria-label="Kinds">
            {counts === undefined ? null : (
              <Cluster space="2xs">
                {TABS.map(({ id, label }) => (
                  <Chip
                    key={id}
                    selected={tab === id}
                    count={id === "all" ? counts.places + counts.rooms + counts.people : counts[id]}
                    onClick={() => {
                      pick(id);
                    }}
                  >
                    {label}
                  </Chip>
                ))}
              </Cluster>
            )}
          </div>
          <Select
            label="Sort by"
            value={sort}
            options={sorts}
            onChange={(value) => {
              order(sorts.find((each) => each.value === value)?.value ?? "relevance");
            }}
          />
        </Sidebar>
        {chips ? (
          <div role="group" aria-label="Filters">
            <Cluster space="2xs">
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
            </Cluster>
          </div>
        ) : null}
      </div>
      <div className={styles["results"]}>{children}</div>
      <div className={["meta", styles["hints"]].join(" ")}>
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
