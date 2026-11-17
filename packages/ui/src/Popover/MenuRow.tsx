import { Chip } from "../Chip/Chip.tsx";
import { Icon } from "../icons/Icon.tsx";
import soon from "../ComingSoon/ComingSoon.module.css";
import type { MenuItem } from "./Popover.tsx";
import styles from "./Popover.module.css";

// What an item does: nothing, said aloud (one to come), or its act, a radio's check and its tone.
const doing = (item: MenuItem) =>
  "soon" in item
    ? { role: "menuitem", "aria-disabled": true, "aria-label": `${item.label}, ${item.why ?? "coming soon"}` }
    : {
        role: item.checked === undefined ? "menuitem" : "menuitemradio",
        "data-tone": item.tone,
        "aria-checked": item.checked,
        // The name and its chip are two words to a screen reader, not one run together.
        ...(item.note === undefined ? {} : { "aria-label": `${item.label}, ${item.note}` }),
        onClick: () => {
          item.onSelect();
        },
      };

// A choice's check: its slot, filled for the one chosen; none for a plain act.
const checkSlot = (checked: boolean | undefined) =>
  checked === undefined ? null : (
    <span className={styles["check"]} aria-hidden="true">
      {checked ? <Icon name="check" /> : null}
    </span>
  );

// A row of the menu: an act, a choice (a radio, checked or not) or one yet to come. A function, not a component: the compiler's memo
// cache of one more component weighed 450 B gzipped on the home's first screen, and the menu's own already holds this JSX's.
export function row(item: MenuItem) {
  const waits = "soon" in item;
  const word = waits ? (item.why ?? "Soon") : item.note;
  return (
    <button
      type="button"
      tabIndex={-1}
      className={["lit", "tint", "full-start", styles["item"], waits ? soon["soon"] : undefined].join(" ")}
      {...doing(item)}
    >
      {!waits && item.tone === "danger" ? <Icon name="alert" /> : null}
      {item.icon === undefined ? null : <Icon name={item.icon} />}
      {waits ? null : checkSlot(item.checked)}
      {item.label}
      {word === undefined ? null : (
        <span className={styles["soon"]}>
          <Chip tone={waits ? "neutral" : "warm"}>{word}</Chip>
        </span>
      )}
    </button>
  );
}
