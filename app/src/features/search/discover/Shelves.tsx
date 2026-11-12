// The left column: the shelves as a listbox, each with how many realms it holds under the filters; the arrows move among them.
import { STYLES } from "@gnoworld/core";
import type { KeyboardEvent } from "react";
import styles from "./Discover.module.css";
import { SHELF_IDS, type Discovery, type Shelf } from "./useDiscover.ts";

const NAMES: Readonly<Record<string, string>> = {
  today: "Today",
  trending: "Recently active",
  new: "New this week",
  live: "Live now",
  gems: "Hidden gems",
  unseen: "Never visited",
  visited: "Visited",
  following: "Following",
  ...Object.fromEntries(STYLES.map(({ id, label }) => [id, label])),
};
export const nameOfShelf = (id: Shelf): string => NAMES[id] ?? id;

const GROUPS: readonly (readonly [string, readonly Shelf[]])[] = [
  ["Discover", ["today", "trending", "new", "live", "gems", "unseen", "following"]],
  ["Styles", STYLES.map(({ id }) => id)],
  ["Your travels", ["visited"]],
];

// Up and down choose the shelf before or after, Home and End the first and the last; the focus and the shelf go together.
function move(event: KeyboardEvent<HTMLElement>, shelf: Shelf, show: (id: Shelf) => void) {
  const at = SHELF_IDS.indexOf(shelf);
  const to = { ArrowDown: at + 1, ArrowUp: at - 1, Home: 0, End: SHELF_IDS.length - 1 }[event.key];
  if (to === undefined || event.altKey || event.ctrlKey || event.metaKey) return;
  event.preventDefault();
  const next = SHELF_IDS[(to + SHELF_IDS.length) % SHELF_IDS.length];
  if (next === undefined) return;
  show(next);
  event.currentTarget.querySelector<HTMLElement>(`[data-shelf="${next}"]`)?.focus();
}

export function Shelves({ discovery }: { discovery: Discovery }) {
  const { shelf, counts, show } = discovery;
  return (
    <div
      role="listbox"
      aria-label="Shelves"
      aria-orientation="vertical"
      className={styles["shelves"]}
      onKeyDown={(event) => {
        move(event, shelf, show);
      }}
    >
      {GROUPS.map(([group, ids]) => (
        <div key={group} role="group" aria-label={group} className={styles["group"]}>
          <div className={styles["groupName"]}>{group}</div>
          {ids.map((id) => (
            <button
              key={id}
              type="button"
              role="option"
              aria-selected={shelf === id}
              tabIndex={shelf === id ? 0 : -1}
              data-shelf={id}
              data-style={STYLES.some((style) => style.id === id) ? id : undefined}
              className={["column-item", styles["shelf"]].join(" ")}
              onClick={() => {
                show(id);
              }}
            >
              {STYLES.some((style) => style.id === id) ? <span className={styles["dot"]} /> : null}
              <span className={["truncate", styles["name"]].join(" ")}>{nameOfShelf(id)}</span>
              {id === "today" ? null : <span className={styles["count"]}>{counts.get(id)}</span>}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
