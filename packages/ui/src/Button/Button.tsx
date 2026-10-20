import type { MouseEvent, ReactNode } from "react";
import { Icon, type IconName } from "../icons/Icon.tsx";
import { iconSize, type ControlSize } from "./control.ts";
import styles from "./Button.module.css";

export interface ButtonProps {
  children: ReactNode;
  emphasis?: "solid" | "outline" | "quiet";
  tone?: "neutral" | "danger";
  size?: ControlSize;
  icon?: IconName;
  type?: "button" | "submit";
  disabled?: boolean;
  busy?: boolean;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
}

// A busy button keeps the focus, so it is not disabled: it refuses the click, and with it the form's
// submission, which Enter would otherwise send again.
function refuse(event: MouseEvent<HTMLButtonElement>) {
  event.preventDefault();
}

/** The one button (docs/DESIGN-SYSTEM.md): solid and neutral is the primary, one per region. */
export function Button({
  children,
  emphasis = "outline",
  tone = "neutral",
  size = "m",
  icon,
  type = "button",
  disabled,
  busy,
  onClick,
}: ButtonProps) {
  return (
    <button
      type={type}
      className={styles["button"]}
      data-emphasis={emphasis}
      data-tone={tone}
      data-size={size}
      disabled={disabled}
      aria-busy={busy}
      aria-disabled={busy}
      onClick={busy === true ? refuse : onClick}
    >
      {icon === undefined ? null : <Icon name={icon} size={iconSize(size)} />}
      {children}
      {busy === true ? <span className={styles["spinner"]} aria-hidden="true" /> : null}
    </button>
  );
}
