import type { Ref } from "react";
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
  return (
    <select
      ref={ref}
      className={styles["select"]}
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
  );
}
