import { Cluster, Stack } from "../compositions/index.ts";
import { grouped } from "../format.ts";
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
// Half the line's width (--line-width, 1 px, which the stroke keeps whatever the drawing's scale): its
// points sit that far inside the drawing, so neither the peak nor zero is cut in half (F337).
const INSET = 0.5;
// A value's height on the line: from zero, half a pixel above the bottom, to the peak, half below the top.
const lineY = (high: number) => HEIGHT - INSET - (high * (HEIGHT - 2 * INSET)) / HEIGHT;

function when(back: number, unit: "hour" | "day") {
  if (back === 0) return unit === "hour" ? "This hour" : "Today";
  return `${String(back)} ${unit}${back === 1 ? "" : "s"} ago`;
}

/** Activity over time, in SVG for the eye: past bars muted, the current one in text; the peak and the
 * current value written beside it, and every value in a table for assistive technology. */
export function ActivityChart({ label, values, sparkline = false, unit = "hour" }: ActivityChartProps) {
  const counts = values.map((value) => (Number.isFinite(value) && value > 0 ? value : 0));
  const peak = Math.max(0, ...counts);
  const last = counts.length - 1;
  // Each value by its place in time, which tells one from another, and its height in the drawing: a
  // pixel at least for a value that is not none.
  const points = counts.map((count, at) => ({
    count,
    at,
    high: count === 0 ? 0 : Math.max(1, Math.round((count / peak) * HEIGHT)),
  }));
  // A line of one value is level across one step.
  const line = points.length === 1 ? points.flatMap((point) => [point, { ...point, at: 1 }]) : points;
  const width = sparkline ? Math.max(1, last) * STEP : Math.max(0, counts.length * (BAR + GAP) - GAP);
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
            points={line.map(({ at, high }) => `${String(at * STEP)},${String(lineY(high))}`).join(" ")}
          />
        ) : (
          points.map(({ at, high }) => (
            <rect
              key={at}
              className={styles["bar"]}
              data-hour={at}
              data-current={at === last ? "true" : undefined}
              x={at * (BAR + GAP)}
              y={HEIGHT - high}
              width={BAR}
              height={high}
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
