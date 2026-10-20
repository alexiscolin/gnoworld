import type { MouseEvent } from "react";
import { Icon, type IconName } from "../icons/Icon.tsx";
import { iconSize, type ControlSize } from "./control.ts";
import styles from "./Button.module.css";

export interface IconButtonProps {
  icon: IconName;
  // Its name without the count: the button adds the count as shown ("Notifications, 8", "Notifications,
  // over 99"), since the icon and the badge are hidden and WCAG's label in name wants the count.
  label: string;
  size?: ControlSize;
  emphasis?: "outline" | "plain";
  pressed?: boolean;
  count?: number;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
}

/** What the count shows and says: nothing at zero, below it or for no number; 99+, over 99, past 99. */
function shown(count: number | undefined) {
  if (count === undefined || !(count > 0)) return null;
  return count > 99 ? { badge: "99+", said: "over 99" } : { badge: String(count), said: String(count) };
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
  const counted = shown(count);
  return (
    <button
      type="button"
      aria-label={counted === null ? label : `${label}, ${counted.said}`}
      aria-pressed={pressed}
      className={[styles["button"], styles["square"]].join(" ")}
      data-emphasis={emphasis}
      data-tone="neutral"
      data-size={size}
      onClick={onClick}
    >
      <Icon name={icon} size={iconSize(size)} />
      {counted === null ? null : (
        <span className={styles["count"]} aria-hidden="true">
          {counted.badge}
        </span>
      )}
    </button>
  );
}
