import { pill } from "../Button/control.ts";
import { sightRef } from "../offscreen.ts";
import styles from "./Chip.module.css";

type Tone = "neutral" | "mine" | "warm" | "signal" | "danger";

interface Mark {
  children: string;
  tone?: Tone;
  onClick?: undefined;
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
  count?: number;
  /** Its name, when its words and count do not say enough: a reaction's emoji, count and "including you". */
  label?: string;
  /** The smallest control's height, where many sit under a line (a reaction's, as Slack's and Discord's): the small one's otherwise. */
  size?: "xs" | "s";
  dot?: never;
  strong?: never;
}

export type ChipProps = Mark | Control;

/** A short word: a button at the small control's size, or a static mark at the smallest, in a tone. */
export function Chip({ children, tone = "neutral", onClick, selected, count, label, size, dot, strong }: ChipProps) {
  if (onClick === undefined) {
    return (
      <span
        className={pill(styles["chip"])}
        data-tone={tone}
        data-size="xs"
        data-strong={strong === true ? "" : undefined}
      >
        {dot === true ? (
          <i ref={sightRef} className={["disc ring", styles["dot"]].join(" ")} aria-hidden="true" />
        ) : null}
        {children}
      </span>
    );
  }
  return (
    <button
      type="button"
      className={pill(styles["chip"])}
      data-tone={tone}
      data-size={size ?? "s"}
      aria-pressed={selected}
      aria-label={label}
      onClick={() => {
        onClick();
      }}
    >
      {children}
      {count === undefined ? null : (
        <>
          {" "}
          <span className={styles["count"]}>{count}</span>
        </>
      )}
    </button>
  );
}
