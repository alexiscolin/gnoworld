import type { MouseEvent } from "react";
import { Icon, type IconName } from "../icons/Icon.tsx";
import { Tooltip } from "../Tooltip/Tooltip.tsx";
import { iconLook, iconSize, type IconControlSize } from "./control.ts";
import styles from "./Button.module.css";

// What the button draws: an icon, or an emoji in its place (a reaction).
type Face = { icon: IconName; emoji?: never } | { emoji: string; icon?: never };

export type IconButtonProps = Face & {
  // Its name without the count: the button adds the count as shown ("Notifications, 8", "Notifications,
  // over 99"), since the icon and the badge are hidden and WCAG's label in name wants the count.
  label: string;
  size?: IconControlSize;
  emphasis?: "outline" | "plain";
  /** Filled with the accent, as Button's solid look: the composer's Send. Wins over `emphasis`. */
  solid?: boolean;
  /** What it does in a form: `submit` sends it. */
  type?: "button" | "submit";
  disabled?: boolean;
  pressed?: boolean;
  /** Opens something in place: whether it is open now, said as aria-expanded. */
  expanded?: boolean;
  count?: number;
  /** What the count counts, said after it in the name only ("Rooms, 3 unread"). */
  countNoun?: string;
  /** The count's tone: the design system's mint, or its coral for what is new to the reader, the bell's alone (frames 6, 86, 87). */
  countTone?: "mine" | "new";
  /** A tool of a bar inside a box (the composer's format bar): the bar's faint ink, 24 px where the box is under 24 rem. */
  tool?: boolean;
  /** One of the tools a narrow bar goes without first (its box under 18 rem): the format bar's lists. */
  drops?: boolean;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
};

/** What the count shows and says: nothing at zero, below it or for no number; 99+, over 99, past 99. */
function shown(count: number | undefined, noun: string | undefined) {
  if (count === undefined || !(count > 0)) return null;
  const said = count > 99 ? "over 99" : String(count);
  return { badge: count > 99 ? "99+" : String(count), said: noun === undefined ? said : `${said} ${noun}` };
}

/** Button's control without its words, in the same module: the same look, square, its label in a
 * tooltip. */
export function IconButton({
  icon,
  emoji,
  label,
  size = "m",
  emphasis = "outline",
  solid,
  type = "button",
  disabled,
  pressed,
  expanded,
  count,
  countNoun,
  countTone = "mine",
  tool,
  drops,
  onClick,
}: IconButtonProps) {
  const counted = shown(count, countNoun);
  return (
    <Tooltip label={label} drops={drops}>
      <button
        type={type}
        disabled={disabled}
        aria-label={counted === null ? label : `${label}, ${counted.said}`}
        aria-pressed={pressed}
        aria-expanded={expanded}
        {...iconLook(solid === true ? "solid" : emphasis, size, tool)}
        onClick={onClick}
      >
        {icon === undefined ? <span aria-hidden="true">{emoji}</span> : <Icon name={icon} size={iconSize(size)} />}
        {counted === null ? null : (
          <span
            className={`${String(styles["badge"])} ${String(styles["count"])}`}
            data-tone={countTone === "new" ? "new" : undefined}
            aria-hidden="true"
          >
            {counted.badge}
          </span>
        )}
      </button>
    </Tooltip>
  );
}
