import styles from "./Logo.module.css";

export interface LogoProps {
  /** The word "gnoworld" after the mark: the text a link around it is named by. */
  wordmark?: boolean;
}

/** The mark, a dotted ring round a ring, a dot and two moons, in the text's colour; with its wordmark, the header's logo. Not a
 * link: the page decides what it opens. The values are the prototype's (#hnav .brand). */
export function Logo({ wordmark = false }: LogoProps) {
  const mark = (
    <svg className={styles["mark"]} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <circle
        cx="16"
        cy="16"
        r="13.5"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.4}
        strokeDasharray="0.1 3.4"
        strokeLinecap="round"
      />
      <circle cx="16" cy="16" r="8" fill="none" stroke="currentColor" strokeWidth={1.4} />
      <circle cx="16" cy="16" r="3.4" fill="currentColor" />
      <circle cx="24" cy="16" r="1.9" fill="currentColor" />
      <circle cx="6.9" cy="25.4" r="1.6" fill="currentColor" />
    </svg>
  );
  if (!wordmark) return mark;
  return (
    <span className={styles["logo"]}>
      {mark}
      <span className={styles["word"]}>
        <b>gno</b>world
      </span>
    </span>
  );
}
