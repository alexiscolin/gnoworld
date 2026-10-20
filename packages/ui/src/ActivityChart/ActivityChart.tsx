import { Cluster, Stack } from "../compositions/index.ts";
import styles from "./ActivityChart.module.css";

export interface ActivityChartProps {
  /** What the values count: the table's caption. */
  label: string;
  /** Oldest first, the last one now; a negative or missing value counts as none. */
  values: number[];
  /** One line instead of bars. */
  sparkline?: boolean;
  /** How far apart the values are: an hour unless asked. */
  unit?: "hour" | "day";
}

// The drawing's own units, stretched to its box: the bars keep the height, the line its stroke.
const HEIGHT = 48;
const BAR = 6;
const GAP = 2;
const STEP = 16;

const grouped = (n: number) => n.toLocaleString("en-US");

function when(back: number, unit: "hour" | "day") {
  if (back === 0) return unit === "hour" ? "This hour" : "Today";
  return `${String(back)} ${unit}${back === 1 ? "" : "s"} ago`;
}

/** Activity over time, in SVG for the eye: past bars muted, the current one in text; the peak and the
 * current value written beside it, and every value in a table for assistive technology. */
export function ActivityChart({ label, values, sparkline = false, unit = "hour" }: ActivityChartProps) {
  const counts = values.map((value) => (Number.isFinite(value) && value > 0 ? value : 0));
  // Each value by its place in time, which is what tells one from another.
  const points = counts.map((count, at) => ({ count, at }));
  const peak = Math.max(0, ...counts);
  const last = counts.length - 1;
  const tall = (count: number) => (peak === 0 ? 0 : Math.round((count / peak) * HEIGHT));
  const width = sparkline ? Math.max(0, last) * STEP : Math.max(0, counts.length * (BAR + GAP) - GAP);
  return (
    <Stack space="2xs">
      <svg
        className={styles["chart"]}
        viewBox={`0 0 ${String(width)} ${String(HEIGHT)}`}
        height={HEIGHT}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {sparkline ? (
          <polyline
            className={styles["line"]}
            points={counts.map((count, at) => `${String(at * STEP)},${String(HEIGHT - tall(count))}`).join(" ")}
          />
        ) : (
          points.map(({ count, at }) => (
            <rect
              key={at}
              className={styles["bar"]}
              data-hour={at}
              data-current={at === last ? "true" : undefined}
              x={at * (BAR + GAP)}
              y={HEIGHT - tall(count)}
              width={BAR}
              height={tall(count)}
            />
          ))
        )}
      </svg>
      <Cluster space="s">
        <p className={styles["figure"]}>Peak {grouped(peak)}</p>
        <p className={styles["figure"]}>Now {grouped(counts.at(-1) ?? 0)}</p>
      </Cluster>
      {/* A table is never narrower than its words: the box around it clips it. */}
      <div className="visually-hidden">
        <table>
          <caption>{label}</caption>
          <thead>
            <tr>
              <th scope="col">When</th>
              <th scope="col">Count</th>
            </tr>
          </thead>
          <tbody>
            {points.map(({ count, at }) => (
              <tr key={at}>
                <th scope="row">{when(last - at, unit)}</th>
                <td>{grouped(count)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Stack>
  );
}
