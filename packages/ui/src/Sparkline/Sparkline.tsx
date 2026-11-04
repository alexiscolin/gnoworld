import { useId } from "react";
import styles from "./Sparkline.module.css";

export interface SparklineProps {
  /** Oldest first, the last one now: a price's day, read between its lowest and its highest. A value that is no finite number is left out. */
  values: readonly number[];
  /** Which way it went, which colours it: up in mint, down in coral, flat in the muted grey (frame 6's markets row). */
  tone: "up" | "down" | "flat";
}

// The drawing's own units, stretched to its box; the line half its stroke inside, so neither the peak nor the low is cut in half (F337's rule).
const WIDTH = 100;
const HEIGHT = 32;
const INSET = 1;

/** A small line of how a value moved, its area shaded under it, for the eye alone: the words beside it say the change (a price's 24 h). Fewer
 * than two values draw nothing. */
export function Sparkline({ values, tone }: SparklineProps) {
  const fillId = useId();
  const shown = values.filter((value) => Number.isFinite(value));
  if (shown.length < 2) return null;
  const low = Math.min(...shown);
  const span = Math.max(...shown) - low;
  const step = WIDTH / (shown.length - 1);
  // A level line sits in the middle; else each value between the low, at the foot, and the high, at the top.
  const y = (value: number) => (span === 0 ? HEIGHT / 2 : INSET + (1 - (value - low) / span) * (HEIGHT - 2 * INSET));
  const line = shown.map((value, at) => `${(at * step).toFixed(2)},${y(value).toFixed(2)}`).join(" ");
  return (
    <svg
      className={styles["spark"]}
      data-tone={tone}
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
      <polygon points={`0,${String(HEIGHT)} ${line} ${String(WIDTH)},${String(HEIGHT)}`} fill={`url(#${fillId})`} />
      <polyline className={styles["line"]} points={line} fill="none" strokeLinejoin="round" />
    </svg>
  );
}
