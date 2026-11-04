// A plate's activity (frames 26, 40, 93): "ACTIVITY · LAST 24 H" and the rate now over the bars, "24 H AGO", the peak with its hour and
// "NOW" under them, as the frames write them; the bars are the chart's, which writes no figure of its own here. With no history the words
// say so and no chart is drawn: a chart of nothing would read as a quiet world. An hour no sample read is drawn as none. The block keeps the
// chart's room while its hours are read and when it has none, so nothing under it moves as they come (Alexis, 2026-11-04).
import { Cluster, Stack } from "@gnoworld/ui";
import { lazy, Suspense } from "react";
import type { Hours } from "./useHours.ts";
import styles from "./Activity.module.css";

// The bars come in their own chunk, once a world has a history: the first screen of a page with none does not pay for them.
const Bars = lazy(() => import("./Bars.tsx"));

const HOUR = 3_600_000;
const counted = (value: number | null) =>
  value !== null && Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
const grouped = (n: number) => n.toLocaleString("en-US");
// The hour of the peak in the reader's own clock, as the frame's "15:30".
const clock = (at: number) =>
  new Date(at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

export function Activity({ hours }: { hours?: Hours | undefined }) {
  if (hours === undefined || hours.hours.length === 0) {
    return (
      <div className={styles["activity"]}>
        <p className="label">No activity recorded yet</p>
      </div>
    );
  }
  const counts = hours.hours.map(counted);
  const peak = Math.max(...counts);
  const peakAt = hours.from + counts.indexOf(peak) * HOUR;
  const now = hours.now === null ? (counts.at(-1) ?? 0) : Math.round(hours.now);
  return (
    <div className={styles["activity"]}>
      <Stack space="2xs">
        <div className="label">
          <Cluster justify="between" space="s">
            <span>Activity · last {counts.length} h</span>
            <span>{grouped(now)} msgs/h now</span>
          </Cluster>
        </div>
        <Suspense fallback={<div className={styles["bars"]} />}>
          <Bars values={counts} />
        </Suspense>
        {/* "24 H AGO" stands at the left edge, where the first bar begins; the tooltip names that bar by its own hour, 23 h ago. */}
        <div className="label">
          <Cluster justify="between" space="s">
            <span>{counts.length} h ago</span>
            <span>
              Peak {grouped(peak)}/h · <time dateTime={new Date(peakAt).toISOString()}>{clock(peakAt)}</time>
            </span>
            <span>Now</span>
          </Cluster>
        </div>
      </Stack>
    </div>
  );
}
