import { Cluster } from "../compositions/index.ts";
import { surface } from "../Popover/floating.ts";
import styles from "./Listbox.module.css";

export interface ListboxOption {
  /** What onPick is given, and the option's id in the page: unique there. */
  id: string;
  label: string;
  /** Read after the label, muted at the row's end: a use, an address. */
  hint?: string | undefined;
}

export interface ListboxProps {
  /** What the list is, for assistive technology. */
  label: string;
  /** The list's id, which a field names with aria-controls. */
  id: string;
  options: readonly ListboxOption[];
  /** The picked option's place: it is marked, and the field names it with aria-activedescendant. */
  active: number;
  onPick: (id: string) => void;
}

/** A list of words that complete what a field holds, on the floating surface; the field keeps the focus and the keys, a press on
 * a row picks it without taking the focus. Its place is its container's. */
export function Listbox({ label, id, options, active, onPick }: ListboxProps) {
  return (
    <ul id={id} role="listbox" aria-label={label} className={surface(styles["list"])}>
      {options.map((option, at) => (
        <li
          key={option.id}
          id={option.id}
          role="option"
          aria-selected={at === active}
          className={styles["option"]}
          onMouseDown={(event) => {
            event.preventDefault();
            onPick(option.id);
          }}
        >
          <Cluster justify="between" align="baseline" wrap="no">
            <span className="truncate">{option.label}</span>
            {option.hint === undefined ? null : (
              <span className={["truncate", styles["hint"]].join(" ")}>{option.hint}</span>
            )}
          </Cluster>
        </li>
      ))}
    </ul>
  );
}
