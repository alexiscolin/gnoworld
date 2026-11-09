import type { MouseEvent, ReactNode } from "react";
import { Icon, type IconName } from "../icons/Icon.tsx";
import { Anchor } from "../link.tsx";
import { buttonLook, iconSize, type ControlSize } from "./control.ts";
import styles from "./Button.module.css";

interface Look {
  children: ReactNode;
  emphasis?: "solid" | "outline" | "quiet";
  tone?: "neutral" | "danger";
  size?: ControlSize;
  icon?: IconName;
}

interface Pressed extends Look {
  href?: undefined;
  type?: "button" | "submit";
  disabled?: boolean;
  busy?: boolean;
  /** What the button's short words stand for, whole: its description to a screen reader and its title on hover. */
  description?: string;
  /** The key that does the same, for a screen reader (aria-keyshortcuts); never drawn on the button. */
  keys?: string;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
}

// A link with the button's look goes where its href says: it is never disabled, busy or a handler.
interface Linked extends Look {
  href: string;
  /** Loads the document again, past the page's link: an error page's way out, the app being what
   * may have failed (F325). */
  reload?: boolean;
  type?: never;
  disabled?: never;
  busy?: never;
  keys?: never;
  onClick?: never;
}

export type ButtonProps = Pressed | Linked;

// A busy button keeps the focus, so it is not disabled: it refuses the click, and with it the form's
// submission, which Enter would otherwise send again.
function refuse(event: MouseEvent<HTMLButtonElement>) {
  event.preventDefault();
}

/** The one button (docs/DESIGN-SYSTEM.md): solid and neutral is the primary, one per region. */
export function Button(props: ButtonProps) {
  const { children, emphasis = "outline", tone = "neutral", size = "m", icon } = props;
  const look = buttonLook(emphasis, tone, size);
  const face = (
    <>
      {icon === undefined ? null : <Icon name={icon} size={iconSize(size)} />}
      {children}
    </>
  );
  if (props.href !== undefined) {
    return (
      <Anchor href={props.href} reload={props.reload === true} {...look}>
        {face}
      </Anchor>
    );
  }
  const { type = "button", disabled, busy, onClick, description, keys } = props;
  return (
    <button
      type={type}
      {...look}
      disabled={disabled}
      aria-busy={busy}
      aria-disabled={busy}
      aria-description={description}
      aria-keyshortcuts={keys}
      title={description}
      onClick={busy === true ? refuse : onClick}
    >
      {face}
      {busy === true ? <span className={styles["spinner"]} aria-hidden="true" /> : null}
    </button>
  );
}
