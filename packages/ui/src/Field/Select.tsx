import type { Ref } from "react";
import { Icon } from "../icons/Icon.tsx";
import styles from "./Select.module.css";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  /** Its name for assistive technology: what stands above it says it to the eye. */
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly SelectOption[];
  ref?: Ref<HTMLSelectElement>;
}

/** The browser's own list, for a choice among many fixed rows, where a phone's picker does better than a list of ours. Its module is its own: the
 * field's or a chip's, shared with the first screen, put a world's page 8 B and 116 B past its cap (177,152 B). */
export function Select({ label, value, onChange, options, ref }: SelectProps) {
  // The browser's arrow is drawn as each browser likes, glued to the edge: ours, a step in, as every box's icon (Alexis, 2026-11-08).
  return (
    <span className={styles["wrap"]}>
      <select
        ref={ref}
        className={["tint", styles["select"]].join(" ")}
        aria-label={label}
        value={value}
        onChange={({ target }) => {
          onChange(target.value);
        }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <span className={["box-end", styles["arrow"]].join(" ")}>
        <Icon name="chevron" size="s" />
      </span>
    </span>
  );
}
