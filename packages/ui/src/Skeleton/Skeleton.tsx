import styles from "./Skeleton.module.css";

export interface SkeletonProps {
  /** A card's block, an avatar's disc, or lines of text: one unless asked. */
  shape?: "line" | "card" | "disc";
  lines?: number;
}

/** What stands in for content that takes longer than 300 ms, shown only then; hidden from assistive
 * technology, while the region it stands in says aria-busy. */
export function Skeleton({ shape = "line", lines = 1 }: SkeletonProps) {
  if (shape !== "line") return <span className={styles["skeleton"]} data-shape={shape} aria-hidden="true" />;
  if (lines === 1) return <span className={styles["skeleton"]} data-shape="line" aria-hidden="true" />;
  return (
    <span className={styles["lines"]} aria-hidden="true">
      {Array.from({ length: lines }, (_, at) => (
        <span key={at} className={styles["skeleton"]} data-shape="line" />
      ))}
    </span>
  );
}
