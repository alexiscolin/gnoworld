import styles from "./Logo.module.css";

export interface LogoProps {
  /** The word "gnoworld" after the mark: the text a link around it is named by. */
  wordmark?: boolean;
  /** Loading, how far from 0 to 1: the moons turn, one each way, and a mint arc fills the dotted ring, as a loader shows (still under reduced
   * motion, the arc alone). None draws the plain mark. */
  progress?: number;
}

// Loading, the rings are drawn thinner than the header's mark (Alexis, 2026-11-07).
const THIN = 0.9;

// The dotted ring's length, r = 13.5: the arc over it is dashed to its whole and offset by what is left.
const RING = 85;

/** The mark, a dotted ring round a ring, a dot and two moons, in the text's colour; with its wordmark, the header's logo. Not a
 * link: the page decides what it opens. The values are the prototype's (#hnav .brand). */
export function Logo({ wordmark = false, progress }: LogoProps) {
  const loading = progress !== undefined;
  const left = 1 - Math.min(Math.max(progress ?? 0, 0), 1);
  const mark = (
    <svg className={styles["mark"]} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <circle
        cx="16"
        cy="16"
        r="13.5"
        fill="none"
        stroke="currentColor"
        strokeWidth={loading ? THIN : 1.4}
        strokeDasharray="0.1 3.4"
        strokeLinecap="round"
        opacity={loading ? 0.5 : undefined}
      />
      {loading ? (
        <circle
          cx="16"
          cy="16"
          r="13.5"
          fill="none"
          className={styles["arc"]}
          stroke="var(--color-mine)"
          strokeWidth={THIN}
          strokeLinecap="round"
          strokeDasharray={RING}
          strokeDashoffset={RING * left}
          transform="rotate(-90 16 16)"
        />
      ) : null}
      <circle cx="16" cy="16" r="8" fill="none" stroke="currentColor" strokeWidth={loading ? THIN : 1.4} />
      <circle cx="16" cy="16" r="3.4" fill="currentColor" />
      <g className={loading ? styles["moon"] : undefined}>
        <circle cx="24" cy="16" r="1.9" fill="currentColor" />
      </g>
      <g className={loading ? styles["moonFar"] : undefined}>
        <circle cx="6.9" cy="25.4" r="1.6" fill="currentColor" />
      </g>
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
