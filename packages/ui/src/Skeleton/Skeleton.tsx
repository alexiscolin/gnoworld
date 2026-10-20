import styles from "./Skeleton.module.css";

export interface SkeletonProps {
  /** A card's block, or lines of text: one unless asked. */
  shape?: "line" | "card";
  lines?: number;
}

/** What stands in for content that takes longer than 300 ms, shown only then; hidden from assistive
 * technology, while the region it stands in says aria-busy. */
export function Skeleton({ shape = "line", lines = 1 }: SkeletonProps) {
  if (shape === "card") return <span className={styles["skeleton"]} data-shape="card" aria-hidden="true" />;
  if (lines === 1) return <span className={styles["skeleton"]} data-shape="line" aria-hidden="true" />;
  return (
    <span className={styles["lines"]} aria-hidden="true">
      {Array.from({ length: lines }, (_, at) => (
        <span key={at} className={styles["skeleton"]} data-shape="line" />
      ))}
    </span>
  );
}
