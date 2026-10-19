import type { MouseEvent } from "react";
import { Icon, type IconName } from "../icons/Icon.tsx";
import styles from "./Button.module.css";

export interface IconButtonProps {
  icon: IconName;
  // Its whole name, with the count as shown ("Notifications, 8 unread", "over 99"): the icon and the
  // count are hidden, and a name that lacks the visible count fails WCAG's label in name.
  label: string;
  size?: "s" | "m" | "l";
  emphasis?: "outline" | "plain";
  pressed?: boolean;
  count?: number;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
}

/** What the count shows: nothing at zero, below it or for no number; 99+ past 99. */
function shown(count: number | undefined) {
  if (count === undefined || !(count > 0)) return null;
  return count > 99 ? "99+" : String(count);
}

/** Button's control without its words, in the same module: the same look, square. */
export function IconButton({
  icon,
  label,
  size = "m",
  emphasis = "outline",
  pressed,
  count,
  onClick,
}: IconButtonProps) {
  const badge = shown(count);
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      className={[styles["button"], styles["square"]].join(" ")}
      data-emphasis={emphasis}
      data-tone="neutral"
      data-size={size}
      onClick={onClick}
    >
      <Icon name={icon} size={size === "l" ? "l" : "m"} />
      {badge === null ? null : (
        <span className={styles["count"]} aria-hidden="true">
          {badge}
        </span>
      )}
    </button>
  );
}
