// A plate's activity (frames 26, 40, 93; D530): "CHAT · LAST 24 H" over the bars of the chat's messages an hour, never a realm's calls,
// the current hour's count at the right, "24 H AGO", the peak with its hour and "NOW" under them. With no message counted, or no hours
// read, nothing is drawn: no flat block (it was one, Alexis, 2026-11-06), no claim the dock may contradict (D534). An hour no sample
// read is drawn as none.
import { Cluster, Icon, Stack } from "@gnoworld/ui";
import { lazy, Suspense, useSyncExternalStore } from "react";
import type { Hours } from "./useHours.ts";
import styles from "./Activity.module.css";

// The bars come in their own chunk: the first screen does not pay for them.
const Bars = lazy(() => import("./Bars.tsx"));

const unchanging = () => () => undefined;
const HOUR = 3_600_000;
const DAY = 24;
const counted = (value: number | null) =>
  value !== null && Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
const grouped = (n: number) => n.toLocaleString("en-US");
// The hour of the peak in the reader's own clock, as the frame's "15:30".
const clock = (at: number) =>
  new Date(at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

export function Activity({ hours }: { hours?: Hours | undefined }) {
  // false in the pre-render and while hydrating (a suspended chart would write a script the CSP refuses), true after.
  const running = useSyncExternalStore(
    unchanging,
    () => true,
    () => false,
  );
  const known = hours !== undefined && hours.hours.length > 0;
  const counts = known ? hours.hours.map(counted) : Array.from({ length: DAY }, () => 0);
  const peak = Math.max(...counts);
  const peakAt = hours === undefined ? null : hours.from + counts.indexOf(peak) * HOUR;
  // The current hour's count so far, the last bar's own figure, never a separate pace that can read 0 beside a bar of 48 (D374).
  const now = counts.at(-1) ?? 0;
  // Hours the server gave none of (or not yet) draw nothing: nobody counted holds no place.
  if (!known) return null;
  // No message counted: the server's hours may not hold what the dock lists (a sim's), so nothing is claimed, nothing drawn (D534).
  if (peak === 0) return null;
  return (
    <div className={styles["activity"]}>
      <Stack space="xs">
        <div className="label">
          <Cluster justify="between" space="s">
            {/* The section's kicker, with the dot every kicker of the plate has; the rate after its icon, as a figure's caption. */}
            <span>
              <span className="dot" data-tone="world" aria-hidden="true" />
              Chat · last {counts.length} h
            </span>
            <Cluster space="2xs">
              <Icon name="chat" size="s" />
              <span>{grouped(now)} msgs/h now</span>
            </Cluster>
          </Cluster>
        </div>
        {running ? (
          <Suspense fallback={<div className={styles["bars"]} />}>
            <Bars values={counts} />
          </Suspense>
        ) : (
          <div className={styles["bars"]} />
        )}
        {/* "24 H AGO" stands at the left edge, where the first bar begins; the tooltip names that bar by its own hour, 23 h ago. */}
        <div className="label">
          <Cluster justify="between" space="s">
            <span>{counts.length} h ago</span>
            <span>
              Peak {grouped(peak)}/h
              {peakAt === null ? null : (
                <>
                  {" · "}
                  <time dateTime={new Date(peakAt).toISOString()}>{clock(peakAt)}</time>
                </>
              )}
            </span>
            <span>Now</span>
          </Cluster>
        </div>
      </Stack>
    </div>
  );
}
