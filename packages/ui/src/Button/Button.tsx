import type { MouseEvent, ReactNode } from "react";
import { Icon, type IconName } from "../icons/Icon.tsx";
import { Anchor } from "../link.tsx";
import { buttonLook, iconSize, toolMark, type ControlSize } from "./control.ts";
import styles from "./Button.module.css";

interface Look {
  children: ReactNode;
  /** `link`: no box, the words' own size, in the link's ink and underlined, for a button that reads as a link (it does something, not goes). */
  emphasis?: "solid" | "outline" | "quiet" | "link";
  /** `signal`: the violet of what a machine says, Jarvis's (the composer's Ask Jarvis). */
  tone?: "neutral" | "danger" | "signal";
  size?: ControlSize;
  icon?: IconName;
  /** `close`: its start a step tighter, so its icon stands close to the control before it, as one group with it. */
  lead?: "close";
  /** `wide`: its words 20 px in, the plate's buttons with words (a large button keeps its own). */
  pad?: "wide";
  /** Its press covers its nearest positioned box, whose hover it answers as its own: a bar whose one link is the whole bar. */
  stretch?: boolean;
  /** A tool of a bar inside a box (the composer's format bar): the bar's faint ink, 24 px where the box is under 24 rem. */
  tool?: boolean;
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
  /** Opens or folds something in place: whether it is open now, said as aria-expanded. */
  expanded?: boolean;
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
  expanded?: never;
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
  const { children, emphasis = "outline", tone = "neutral", size = "m", icon, lead, pad, stretch, tool } = props;
  const look = {
    ...buttonLook(emphasis, tone, size),
    ...toolMark(tool),
    "data-lead": lead,
    "data-pad": pad,
    "data-stretch": stretch === true ? "" : undefined,
  };
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
  const { type = "button", disabled, busy, onClick, description, keys, expanded } = props;
  return (
    <button
      type={type}
      {...look}
      disabled={disabled}
      aria-busy={busy}
      aria-disabled={busy}
      aria-description={description}
      aria-keyshortcuts={keys}
      aria-expanded={expanded}
      title={description}
      onClick={busy === true ? refuse : onClick}
    >
      {face}
      {busy === true ? <span className={styles["spinner"]} aria-hidden="true" /> : null}
    </button>
  );
}
