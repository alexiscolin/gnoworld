import { useId, useState, type ReactNode } from "react";
import { Icon } from "../icons/Icon.tsx";
import styles from "./Disclosure.module.css";

export interface DisclosureProps {
  /** Before the words: a planet, a tag. */
  lead?: ReactNode;
  /** The row's words, cut at the end of the line. */
  title: ReactNode;
  /** After the words, before the chevron: a count, a time. */
  trail?: ReactNode;
  /** 44 px, the default, or 36. */
  size?: "m" | "s";
  /** Open from the start, or opened from outside: it opens when this turns true. */
  open?: boolean;
  /** Told, with the state it now has, when the person opens or shuts the row (not when `open` opens it from outside). */
  onToggle?: (open: boolean) => void;
  /** What opens under it. */
  children: ReactNode;
}

/** A row that opens in place: a line with a chevron that turns, and under it, once open, what it holds, grown from nothing to its height.
 * Its body is always drawn and held shut, so what is in it can be reached by a test and costs no second render. */
export function Disclosure({
  lead,
  title,
  trail,
  size = "m",
  open: asked = false,
  onToggle,
  children,
}: DisclosureProps) {
  const [open, setOpen] = useState(asked);
  const [was, setWas] = useState(asked);
  const bodyId = useId();
  // Opened from outside: when the ask turns true the row opens, and the person may shut it again.
  if (asked !== was) {
    setWas(asked);
    if (asked) setOpen(true);
  }
  return (
    <div className={styles["disclosure"]}>
      <button
        type="button"
        className={[styles["row"], lead === undefined ? "text-meta" : "icon-text-meta", "pointer"].join(" ")}
        data-size={size}
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => {
          setOpen(!open);
          onToggle?.(!open);
        }}
      >
        {lead === undefined ? null : <span>{lead}</span>}
        <span className="truncate">{title}</span>
        <span className={[styles["trail"], "row-center"].join(" ")}>
          {trail}
          <span className={styles["chevron"]}>
            <Icon name="chevron" />
          </span>
        </span>
      </button>
      <div id={bodyId} className={styles["body"]} data-open={open ? "" : undefined} inert={!open}>
        <div className={styles["inner"]}>{children}</div>
      </div>
    </div>
  );
}
