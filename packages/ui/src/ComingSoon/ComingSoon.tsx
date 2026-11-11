import type { ReactNode } from "react";
import { buttonLook, iconLook, iconSize, type ControlSize } from "../Button/control.ts";
import { Icon, type IconName } from "../icons/Icon.tsx";
import { Tooltip } from "../Tooltip/Tooltip.tsx";
import styles from "./ComingSoon.module.css";

export interface ComingSoonProps {
  /** What it will be: assistive technology reads "<name>, coming soon". A face of your own says the same words, as the name must hold what is seen. */
  name: string;
  /** Its face as a control, as the video draws it: an icon, words, or both. */
  icon?: IconName;
  /** The words on its face; none draws the icon alone, square. */
  words?: string;
  size?: ControlSize;
  /** A face that is no control (a quest's step, a row): drawn as it is, greyed. Takes the place of `icon` and `words`. */
  children?: ReactNode;
}

/** What a later slice brings, shown where the video draws it: greyed, inert, "Coming soon" under the pointer and the focus, and said so to
 * a screen reader. It stays focusable, so the keyboard finds it too; a click does nothing. */
export function ComingSoon({ name, icon, words, size = "m", children }: ComingSoonProps) {
  const face =
    children === undefined ? (
      <>
        {icon === undefined ? null : <Icon name={icon} size={iconSize(size)} />}
        {words}
      </>
    ) : (
      children
    );
  // An icon alone wears an IconButton's own look, so it stands at the same size beside them (the chat's header).
  const look =
    children !== undefined
      ? { className: styles["plain"] }
      : words === undefined
        ? iconLook("outline", size)
        : buttonLook("outline", "neutral", size);
  return (
    <Tooltip label="Coming soon">
      <button
        type="button"
        {...look}
        className={[look.className, styles["soon"]].join(" ")}
        aria-disabled="true"
        aria-label={`${name}, coming soon`}
      >
        {face}
      </button>
    </Tooltip>
  );
}
