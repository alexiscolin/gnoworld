import type { ReactNode } from "react";
import { buttonLook, iconLook, iconSize, type ControlSize } from "../Button/control.ts";
import { Icon, type IconName } from "../icons/Icon.tsx";
import { Tooltip } from "../Tooltip/Tooltip.tsx";
import styles from "./ComingSoon.module.css";

export interface ComingSoonProps {
  /** What it will be: assistive technology reads "<name>, coming soon". A face of your own says the same words, as the name must hold what is seen. */
  name: string;
  /** Its face as a control, as the design draws it: an icon, words, or both. */
  icon?: IconName;
  /** The words on its face; none draws the icon alone, square. */
  words?: string;
  size?: ControlSize;
  /** A face that is no control (a quest's step, a row): drawn as it is, greyed. Takes the place of `icon` and `words`. */
  children?: ReactNode;
}

/** What is not built yet, shown where the design draws it: greyed, inert, "Coming soon" under the pointer and the focus, and said so to
 * a screen reader. It stays focusable, so the keyboard finds it too; a click does nothing. */
export function ComingSoon(props: ComingSoonProps) {
  return <Soon {...props} />;
}

/** ComingSoon with a class of the caller's, next to the greyed one: for the package's own parts (a NavItem that is yet to come lays itself
 * out as its siblings do), never the entry's, which takes no class (docs/DESIGN-SYSTEM.md, "No outside styling"). */
export function Soon({ name, icon, words, size = "m", children, className }: ComingSoonProps & { className?: string }) {
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
      ? { className: className ?? "bare" }
      : words === undefined
        ? iconLook("outline", size)
        : buttonLook("outline", "neutral", size);
  return (
    <Tooltip label="Coming soon">
      <button
        type="button"
        {...look}
        className={[look.className, styles["soon"], children === undefined ? className : undefined].join(" ")}
        aria-disabled="true"
        aria-label={`${name}, coming soon`}
      >
        {face}
      </button>
    </Tooltip>
  );
}
