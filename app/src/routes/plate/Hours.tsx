// Chat messages per hour (the proposal's cardChat): the chat's last 24 hours of a place with no calls to count, as the day chart draws days, a
// dot for an hour with no message. With no hour read, or none with a message, nothing is drawn (D534): no flat block, no claim the dock may contradict.
import { Card, DayChart, Stack } from "@gnoworld/ui";
import type { Hours as HoursRead } from "../../features/world/useHours.ts";
import { grouped } from "./figures.ts";
import styles from "./Chart.module.css";

const HOUR_MS = 3_600_000;
const counted = (value: number | null) =>
  value !== null && Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
// "13:00": the hour's start in UTC, as the day chart's axis words it.
const clock = (at: number) => `${new Date(at).toISOString().slice(11, 13)}:00`;

export function Hours({ hours }: { hours: HoursRead | undefined }) {
  const counts = hours?.hours.map(counted) ?? [];
  const peak = Math.max(0, ...counts);
  if (hours === undefined || peak === 0) return null;
  const labels = counts.map((_, at) => clock(hours.from + at * HOUR_MS));
  const quiet = counts.filter((count) => count === 0).length;
  return (
    <Card look="hub" fixed rises>
      <Card.Header title="Chat messages per hour" level={2} hint="last 24 h" />
      <Card.Body>
        <Stack space="s">
          <DayChart
            label="Chat messages per hour"
            scale="linear"
            values={counts}
            labels={labels}
            noun={["message", "messages"]}
            now="now"
            suffix=" UTC"
          />
          <span className={styles["foot"]}>
            {`Peak ${grouped(peak)} an hour at ${labels[counts.indexOf(peak)] ?? ""} UTC · ${String(quiet)} of ${String(counts.length)} hours without a message (small dots)`}
          </span>
        </Stack>
      </Card.Body>
    </Card>
  );
}
