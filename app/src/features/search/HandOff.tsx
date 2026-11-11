// The palette's last row (slice 13, C): the typed words handed to the chat's search. It stands under the results and is no option of
// the list: the arrows and Enter stay with the places; a click or ⌘⇧F (SearchDialog.tsx) hands the words over.
import { Icon } from "@gnoworld/ui";
import { handOff } from "./handOff.ts";
import styles from "./SearchDialog.module.css";
import type { SearchItem } from "./types.ts";

export function HandOff({ query, go }: { query: string; go: (item: SearchItem) => void }) {
  const item = handOff(query);
  if (item === undefined) return null;
  return (
    <button
      type="button"
      className={[styles["row"], styles["handOff"]].join(" ")}
      onClick={() => {
        go(item);
      }}
    >
      <Icon name="search" />
      <span className={["truncate", styles["name"]].join(" ")}>{item.name}</span>
      <kbd>⌘⇧F</kbd>
    </button>
  );
}
