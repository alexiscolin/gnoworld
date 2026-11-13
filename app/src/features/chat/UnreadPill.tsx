import { countWords } from "./unread.ts";
import styles from "./Worlds.module.css";

/** A world's unseen lines: the number to 99, 99+ past it, and the words a screen reader hears; nothing for none. */
export function UnreadPill({ count }: { count: number }) {
  if (count < 1) return null;
  return (
    <span className={styles["pill"]} data-unread-pill="">
      <span aria-hidden="true">{countWords(count)}</span>
      <span className="visually-hidden">{`${countWords(count)} unread`}</span>
    </span>
  );
}
