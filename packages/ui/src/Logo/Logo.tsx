import { Cluster } from "../compositions/index.ts";
import styles from "./Logo.module.css";

export interface LogoProps {
  /** The word "gnoworld" after the mark: the text a link around it is named by. */
  wordmark?: boolean;
}

/** The mark, a ring with a dot at its heart, in the text's colour; with its wordmark, the header's logo. Not a link: the page decides what it opens. */
export function Logo({ wordmark = false }: LogoProps) {
  const mark = (
    <svg className={styles["mark"]} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <circle cx="16" cy="16" r="11" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="16" cy="16" r="4" fill="currentColor" />
    </svg>
  );
  if (!wordmark) return mark;
  return (
    <Cluster as="div" space="2xs">
      {mark}
      <span className={styles["word"]}>gnoworld</span>
    </Cluster>
  );
}
