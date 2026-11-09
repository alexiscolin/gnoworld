import { useId } from "react";
import { Sidebar, Stack } from "../compositions/index.ts";
import styles from "./Switch.module.css";

export interface SwitchProps {
  /** What it turns on, drawn at its start: its name. */
  label: string;
  /** A line in the muted tone under the name, read as its description. */
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

/** An on/off setting that takes effect at once: a real checkbox in the switch role, its name and line at the start, the track at the
 * end, cream when on (docs/DESIGN-SYSTEM.md, "Colour": what is selected). Space toggles it; the name toggles it under the pointer. */
export function Switch({ label, description, checked, onChange }: SwitchProps) {
  const id = useId();
  const described = description === undefined ? undefined : `${id}-description`;
  return (
    <Sidebar side="end" align="center">
      <Stack space="3xs">
        <label htmlFor={id} className={styles["name"]}>
          {label}
        </label>
        {described === undefined ? null : (
          <span id={described} className="meta">
            {description}
          </span>
        )}
      </Stack>
      <span className={styles["switch"]}>
        <input
          id={id}
          type="checkbox"
          role="switch"
          className={styles["track"]}
          checked={checked}
          aria-describedby={described}
          onChange={(event) => {
            onChange(event.currentTarget.checked);
          }}
        />
        <span className={styles["knob"]} aria-hidden="true" />
      </span>
    </Sidebar>
  );
}
