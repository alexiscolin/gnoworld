import { Cluster, Stack } from "../compositions/index.ts";
import { grouped } from "../format.ts";
import { useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";
import { surface, usePlaced } from "../Popover/floating.ts";
import tooltip from "../Tooltip/Tooltip.module.css";
import { Bar } from "./Bar.tsx";
import { useReading } from "./useReading.ts";
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
  /** Its row of peak and now; false where the page writes them in its own words (a plate's, frames 26 and 40). */
  figures?: boolean;
}

// The drawing's own units, stretched to its box: the bars keep the height, the line its stroke.
const HEIGHT = 48;
const BAR = 6;
const GAP = 2;
// An hour with none: a dash on the baseline, so the row of hours reads even when all is quiet (Alexis, 2026-11-07, option A).
const DASH = 2;
const STEP = 16;
// Half the line's width (--line-width, 1 px, which the stroke keeps whatever the drawing's scale): its
// points sit that far inside the drawing, so neither the peak nor zero is cut in half (F337).
const INSET = 0.5;
// A value's height on the line: from zero, half a pixel above the bottom, to the peak, half below the top.
const lineY = (high: number) => HEIGHT - INSET - (high * (HEIGHT - 2 * INSET)) / HEIGHT;

export function when(back: number, unit: "hour" | "day") {
  if (back === 0) return unit === "hour" ? "This hour" : "Today";
  return `${String(back)} ${unit}${back === 1 ? "" : "s"} ago`;
}

export interface Point {
  count: number;
  at: number;
  high: number;
}

// Over the bar, placed in script as the tooltip's words are: above it, below when there is no room above, a step inside the
// screen's edges (a chart at the top of the page, or at the edge of a phone's screen, keeps its words whole).
export function Tip({
  point,
  last,
  unit,
  plot,
  words,
  pill,
}: {
  point: Point;
  last: number;
  unit: "hour" | "day";
  plot: RefObject<Element | null>;
  /** What the tip says in place of the count and its "when" (a day chart's own date). */
  words?: ReactNode;
  /** The plate's day chart's: a pill with the world's colour on its date. */
  pill?: boolean;
}) {
  const anchorRef = useRef<Element | null>(null);
  const wordsRef = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    anchorRef.current = plot.current?.querySelector(`[data-hour="${String(point.at)}"]`) ?? null;
  }, [plot, point.at]);
  usePlaced(anchorRef, wordsRef, { open: true, side: "above", align: "center", again: point.at });
  return (
    <span
      ref={wordsRef}
      className={surface([tooltip["tip"], styles["tip"]].join(" "))}
      aria-hidden="true"
      data-tip=""
      data-look={pill === true ? "pill" : undefined}
      style={{ visibility: "hidden" }}
    >
      {words ?? `${grouped(point.count)} · ${when(last - point.at, unit)}`}
    </span>
  );
}

// The bars or the line, in the drawing's own units.
function Drawing({ points, sparkline, width }: { points: Point[]; sparkline: boolean; width: number }) {
  const last = points.length - 1;
  // A line of one value is level across one step.
  const line = points.length === 1 ? points.flatMap((point) => [point, { ...point, at: 1 }]) : points;
  return (
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
          <Bar key={at} at={at} last={last} high={high} x={at * (BAR + GAP)} width={BAR} dash={DASH} base={HEIGHT} />
        ))
      )}
    </svg>
  );
}

// The drawing, its tooltip, and the polite status that says the focused bar aloud. Bars have the tooltip and the
// keyboard's group; a sparkline and a chart with no value have neither: no focus stop with nothing to walk.
function Plot({
  points,
  sparkline,
  unit,
  label,
}: {
  points: Point[];
  sparkline: boolean;
  unit: "hour" | "day";
  label: string;
}) {
  const last = points.length - 1;
  const bars = !sparkline && points.length > 0;
  const reading = useReading(bars ? points.length : 0);
  const width = sparkline ? Math.max(1, last) * STEP : Math.max(0, points.length * (BAR + GAP) - GAP);
  const shown = points[reading.shown ?? -1];
  const focused = points[reading.focusAt ?? -1];
  const plotRef = useRef<HTMLDivElement>(null);
  const group = bars ? { role: "group", "aria-label": label, tabIndex: 0, ...reading.group, ...reading.plot } : {};
  return (
    <div ref={plotRef} className={styles["plot"]} {...group}>
      <Drawing points={points} sparkline={sparkline} width={width} />
      {shown === undefined ? null : <Tip point={shown} last={last} unit={unit} plot={plotRef} />}
      {bars ? (
        <span role="status" className="visually-hidden">
          {focused === undefined ? null : `${when(last - focused.at, unit)}, ${grouped(focused.count)}`}
        </span>
      ) : null}
    </div>
  );
}

/** Activity over time, in SVG for the eye: past bars muted, the current one in text; the peak and the
 * current value written beside it, and every value in a table for assistive technology. The bars have a
 * tooltip (F304), by the pointer and by the keyboard: the chart is one group whose arrows walk them. */
export function ActivityChart({ label, values, sparkline = false, unit = "hour", figures = true }: ActivityChartProps) {
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
  return (
    <Stack space="2xs">
      <Plot points={points} sparkline={sparkline} unit={unit} label={label} />
      {figures ? (
        <Cluster space="s">
          <p className={styles["figure"]}>Peak {grouped(peak)}</p>
          <p className={styles["figure"]}>Now {grouped(counts.at(-1) ?? 0)}</p>
        </Cluster>
      ) : null}
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
