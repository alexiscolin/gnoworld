import { Chip } from "../Chip/Chip.tsx";
import { Icon } from "../icons/Icon.tsx";
import soon from "../ComingSoon/ComingSoon.module.css";
import type { MenuItem } from "./Popover.tsx";
import styles from "./Popover.module.css";

// A row of the menu: an act, a choice (a radio, checked or not, busy while its act is read) or one yet to come.
export function Row({ item, onAct }: { item: MenuItem; onAct: (act: () => void) => void }) {
  const words = (
    <>
      {"onSelect" in item && item.tone === "danger" ? <Icon name="alert" /> : null}
      {item.icon === undefined ? null : <Icon name={item.icon} />}
      {item.label}
    </>
  );
  const look = ["lit", "tint", "full-start", styles["item"]];
  if ("soon" in item)
    return (
      <button
        type="button"
        role="menuitem"
        tabIndex={-1}
        className={[...look, soon["soon"]].join(" ")}
        aria-disabled
        aria-label={`${item.label}, ${item.why ?? "coming soon"}`}
      >
        {words}
        <span className={styles["soon"]}>
          <Chip>{item.why ?? "Soon"}</Chip>
        </span>
      </button>
    );
  return (
    <button
      type="button"
      role={item.checked === undefined ? "menuitem" : "menuitemradio"}
      tabIndex={-1}
      className={look.join(" ")}
      data-tone={item.tone}
      aria-checked={item.checked}
      aria-busy={item.busy === true ? true : undefined}
      onClick={() => {
        onAct(item.onSelect);
      }}
    >
      {words}
      {item.note === undefined ? null : (
        <span className={styles["soon"]}>
          <Chip tone="warm">{item.note}</Chip>
        </span>
      )}
    </button>
  );
}
