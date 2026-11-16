import { pill } from "../Button/control.ts";
import { Pressable } from "../Pressable.tsx";
import { sightRef } from "../offscreen.ts";
import styles from "./Chip.module.css";

type Tone = "neutral" | "mine" | "warm" | "signal" | "danger" | "new";

interface Mark {
  children: string;
  tone?: Tone;
  onClick?: undefined;
  href?: never;
  tabIndex?: never;
  popup?: never;
  selected?: never;
  count?: never;
  label?: never;
  size?: never;
  /** A dot in its ink before the words: what is live or quiet (the plate's status). */
  dot?: boolean;
  /** The words in the weight of a plate's pills (500). */
  strong?: boolean;
}

// A chip that does something: a filter or a choice says whether it is selected, an action does not.
// The space before its count is for its name: the flex row draws none, and keeps its gap.
interface Control {
  children: string;
  tone?: Tone;
  onClick: () => void;
  selected?: boolean;
  count?: number | string;
  /** Its name, when its words and count do not say enough: a reaction's emoji, count and "including you". */
  label?: string;
  /** The smallest control's height, where many sit under a line (a reaction's, as Slack's and Discord's): the small one's otherwise; "chip", the dock's pill. */
  size?: "xs" | "s" | "chip";
  /** What it opens, where it opens a dialog. */
  popup?: "dialog";
  /** Out of the Tab order, where a list is one tab stop (a line's chips). */
  tabIndex?: number;
  href?: never;
  dot?: never;
  strong?: never;
}

// A chip that goes somewhere: a link, the one in view `selected` (aria-current), as a row of rooms' shortcuts.
interface Go {
  children: string;
  tone?: Tone;
  href: string;
  selected?: boolean;
  count?: number | string;
  /** Its name, when its words and count do not say enough: the unseen count, in words. */
  label?: string;
  size?: "xs" | "s" | "chip";
  onClick?: never;
  tabIndex?: never;
  popup?: never;
  dot?: never;
  strong?: never;
}

export type ChipProps = Mark | Control | Go;

// The words, and the count after them: the flex row draws no space before it, so the name keeps one.
function Words({ children, count }: { children: string; count: number | string | undefined }) {
  return (
    <>
      {children}
      {count === undefined ? null : (
        <>
          {" "}
          <span className={styles["count"]}>{count}</span>
        </>
      )}
    </>
  );
}

// A chip that does nothing: a static mark at the smallest size, its dot before the words.
function Static({
  children,
  tone,
  dot,
  strong,
}: {
  children: string;
  tone: Tone;
  dot: boolean | undefined;
  strong: boolean | undefined;
}) {
  return (
    <span
      className={pill(styles["chip"])}
      data-tone={tone}
      data-size="xs"
      data-strong={strong === true ? "" : undefined}
    >
      {dot === true ? (
        <i key={children} ref={sightRef} className={["disc ring", styles["dot"]].join(" ")} aria-hidden="true" />
      ) : null}
      {children}
    </span>
  );
}

/** A short word: a button at the small control's size, or a static mark at the smallest, in a tone. */
export function Chip({
  children,
  tone = "neutral",
  onClick,
  href,
  tabIndex,
  popup,
  selected,
  count,
  label,
  size,
  dot,
  strong,
}: ChipProps) {
  if (href === undefined && onClick === undefined)
    return (
      <Static dot={dot} strong={strong} tone={tone}>
        {children}
      </Static>
    );
  return (
    <Pressable
      href={href}
      onClick={onClick}
      className={pill(styles["chip"], size === "chip" ? undefined : "hit")}
      data-tone={tone}
      data-size={size ?? "s"}
      aria-pressed={href === undefined ? selected : undefined}
      aria-current={href !== undefined && selected === true ? "true" : undefined}
      aria-label={label}
      aria-haspopup={popup}
      tabIndex={tabIndex}
    >
      <Words count={count}>{children}</Words>
    </Pressable>
  );
}
