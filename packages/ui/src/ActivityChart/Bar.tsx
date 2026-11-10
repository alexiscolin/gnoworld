import styles from "./ActivityChart.module.css";

/** One bar of a chart's drawing, on the baseline: at least `dash` high (a day with none is a dash), the last one in the text colour. */
export function Bar({
  at,
  last,
  high,
  x,
  width,
  dash,
  base,
}: {
  at: number;
  last: number;
  high: number;
  x: number;
  width: number;
  dash: number;
  base: number;
}) {
  const height = Math.max(high, dash);
  return (
    <rect
      className={styles["bar"]}
      data-hour={at}
      data-current={at === last ? "true" : undefined}
      data-empty={high === 0 ? "" : undefined}
      x={x}
      y={base - height}
      width={width}
      height={height}
    />
  );
}
