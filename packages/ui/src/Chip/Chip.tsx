import { pill } from "../Button/control.ts";
import styles from "./Chip.module.css";

type Tone = "neutral" | "mine" | "warm" | "signal" | "danger";

interface Mark {
  children: string;
  tone?: Tone;
  onClick?: undefined;
  selected?: never;
  count?: never;
  label?: never;
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
}

export type ChipProps = Mark | Control;

/** A short word: a button at the small control's size, or a static mark at the smallest, in a tone. */
export function Chip({ children, tone = "neutral", onClick, selected, count, label }: ChipProps) {
  if (onClick === undefined) {
    return (
      <span className={pill(styles["chip"])} data-tone={tone} data-size="xs">
        {children}
      </span>
    );
  }
  return (
    <button
      type="button"
      className={pill(styles["chip"])}
      data-tone={tone}
      data-size="s"
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
