import { useId } from "react";
import styles from "./Sparkline.module.css";

export interface SparklineProps {
  /** Oldest first, the last one now: a price's day, read between its lowest and its highest. A value that is no finite number is left out. */
  values: readonly number[];
  /** Which way it went, which colours it: up in mint, down in coral, flat in the muted grey (frame 6's markets row). */
  tone: "up" | "down" | "flat";
  /** Where the line's height starts: between its lowest and its highest (a price), or from nothing to its highest (a count). */
  from?: "range" | "zero";
  /** Its box's own size, never the row's 58 by 22: the plate's figure and its cards set it. */
  fills?: boolean;
  /** The line draws itself and its area fades in on arrival (the plate's), and a dot marks the last value. */
  arrives?: boolean;
}

// The drawing's own units, stretched to its box; the line half its stroke inside, so neither the peak nor the low is cut in half (F337's rule).
const WIDTH = 100;
const HEIGHT = 32;
const INSET = 1;

/** Where a count's line stands in its box, 0 at the top to 1 at the foot, for a share of its highest (the proposal's 92 and 84): a mark at its last value reads it too. */
export const zeroHeight = (share: number) => 0.92 - share * 0.84;

/** A small line of how a value moved, its area shaded under it, for the eye alone: the words beside it say the change (a price's 24 h). Fewer
 * than two values draw nothing. */
export function Sparkline({ values, tone, from = "range", fills = false, arrives = false }: SparklineProps) {
  const fillId = useId();
  const shown = values.filter((value) => Number.isFinite(value));
  if (shown.length < 2) return null;
  const low = from === "zero" ? 0 : Math.min(...shown);
  const span = Math.max(...shown) - low;
  const step = WIDTH / (shown.length - 1);
  // A level line sits in the middle; else each value between the low, at the foot, and the high, at the top.
  const y = (value: number) =>
    from === "zero"
      ? HEIGHT * zeroHeight(value / Math.max(1, ...shown))
      : span === 0
        ? HEIGHT / 2
        : INSET + (1 - (value - low) / span) * (HEIGHT - 2 * INSET);
  const points = shown.map((value, at) => `${(at * step).toFixed(2)},${y(value).toFixed(2)}`);
  // Paths, not polylines: the browser animates a path's `d` as CSS, so a fresh read moves the line from where it stands (the same number of
  // values; with another count it swaps).
  const line = `M${points.join(" L")}`;
  const area = `M0,${String(HEIGHT)} L${points.join(" L")} L${String(WIDTH)},${String(HEIGHT)} Z`;
  return (
    <svg
      className={styles["spark"]}
      data-tone={tone}
      data-fills={fills ? "" : undefined}
      data-arrives={arrives ? "" : undefined}
      viewBox={`0 0 ${String(WIDTH)} ${String(HEIGHT)}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className={styles["top"]} />
          <stop offset="1" className={styles["foot"]} />
        </linearGradient>
      </defs>
      <path className={styles["area"]} d={area} style={{ d: `path("${area}")` }} fill={`url(#${fillId})`} />
      <path
        className={styles["line"]}
        d={line}
        style={{ d: `path("${line}")` }}
        pathLength={arrives ? 1 : undefined}
        fill="none"
        strokeLinejoin="round"
      />
    </svg>
  );
}
