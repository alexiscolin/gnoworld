import type { MouseEvent } from "react";
import { Icon, type IconName } from "../icons/Icon.tsx";
import { Tooltip } from "../Tooltip/Tooltip.tsx";
import { iconLook, iconSize, type IconControlSize } from "./control.ts";
import styles from "./Button.module.css";

export interface IconButtonProps {
  icon: IconName;
  // Its name without the count: the button adds the count as shown ("Notifications, 8", "Notifications,
  // over 99"), since the icon and the badge are hidden and WCAG's label in name wants the count.
  label: string;
  size?: IconControlSize;
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

/** Button's control without its words, in the same module: the same look, square, its label in a
 * tooltip. */
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
    <Tooltip label={label}>
      <button
        type="button"
        aria-label={counted === null ? label : `${label}, ${counted.said}`}
        aria-pressed={pressed}
        {...iconLook(emphasis, size)}
        onClick={onClick}
      >
        <Icon name={icon} size={iconSize(size)} />
        {counted === null ? null : (
          <span className={`${String(styles["badge"])} ${String(styles["count"])}`} aria-hidden="true">
            {counted.badge}
          </span>
        )}
      </button>
    </Tooltip>
  );
}
