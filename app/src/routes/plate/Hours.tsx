// Chat messages per hour (the proposal's cardChat): the chat's last 24 hours of a place with no calls to count, as the day chart draws days, a
// dot for an hour with no message: a flat chart of dots when nobody spoke, which is a count (D534 was: no block). With no read of the hours, nothing is drawn.
import { Card, DayChart, Stack, useAlone } from "@gnoworld/ui";
import type { Hours as HoursRead } from "../../features/world/useHours.ts";
import { grouped, hourCounts } from "./figures.ts";
import styles from "./Chart.module.css";

const HOUR_MS = 3_600_000;
// "13:00": the hour's start in UTC, as the day chart's axis words it.
const clock = (at: number) => `${new Date(at).toISOString().slice(11, 13)}:00`;

export function Hours({ hours }: { hours: HoursRead | undefined }) {
  const expand = useAlone("hours");
  const counts = hourCounts(hours);
  if (hours === undefined || counts === undefined) return null;
  const peak = Math.max(0, ...counts);
  const labels = counts.map((_, at) => clock(hours.from + at * HOUR_MS));
  const quiet = counts.filter((count) => count === 0).length;
  return (
    <Card look="hub" fixed rises open={expand.open}>
      <Card.Header icon="chat" title="Chat messages per hour" level={2} hint="last 24 h" expand={expand} />
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
            {peak === 0
              ? `No message in the last ${String(counts.length)} hours (small dots).`
              : `Peak ${grouped(peak)} an hour at ${labels[counts.indexOf(peak)] ?? ""} UTC · ${String(quiet)} of ${String(counts.length)} hours without a message (small dots)`}
          </span>
        </Stack>
      </Card.Body>
    </Card>
  );
}
