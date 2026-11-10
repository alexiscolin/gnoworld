// One call of the last calls (the proposal's .rc row): the function in the world's light, who called it, when; a click opens its facts in place
// as the proposal's call card (the design system's Disclosure, the plate's rows): the labels and their values, the caller's face and full address,
// the time read in words, the result as a chip.
import type { ReactNode } from "react";
import { Avatar, Chip, Cluster, Disclosure, Grid, Stack } from "@gnoworld/ui";
import type { RealmRollup, Worlds } from "@gnoworld/schemas/indexer";
import { Fact } from "../../features/calls/index.ts";
import { dayLabel } from "./days.ts";
import { grouped } from "./figures.ts";
import { callerName } from "./names.ts";
import styles from "./CallRow.module.css";

type Call = RealmRollup["last"][number];

const HOUR = 3_600_000;
// How long ago under two days, else the day and the hour in UTC, as the proposal's exactTxt does.
function when(time: string | null, height: number): string {
  if (time === null) return `block ${grouped(height)}`;
  const age = Date.now() - Date.parse(time);
  if (age < HOUR) return `${String(Math.max(1, Math.round(age / 60_000)))} min ago`;
  if (age < 48 * HOUR) return `${String(Math.round(age / HOUR))} hours ago`;
  return `${dayLabel(time.slice(0, 10))}, ${time.slice(11, 16)} UTC`;
}

// "Oct 24, 2026, 09:36 UTC": the moment in words, to the minute.
const readable = (time: string) => `${dayLabel(time.slice(0, 10))}, ${time.slice(0, 4)}, ${time.slice(11, 16)} UTC`;

// A fact of the card, in a grid of its own: its label, then its value.
const Line = ({ label, children }: { label: string; children: ReactNode }) => (
  <Grid template="label-value" space="s">
    <Fact label={label}>{children}</Fact>
  </Grid>
);

export function CallRow({
  call,
  worlds,
  universe,
}: {
  call: Call;
  worlds: Worlds["worlds"] | undefined;
  /** The chain's name, for the card's label. */
  universe: string;
}) {
  const { func, caller, height, success, time } = call;
  const who = callerName(worlds, caller);
  return (
    <div className={styles["call"]}>
      <Disclosure
        size="m"
        title={
          <Cluster space="xs" align="baseline" wrap="no">
            <span className={styles["func"]}>{func ?? "unknown function"}</span>
            <span className={["truncate", styles["who"]].join(" ")}>{who}</span>
          </Cluster>
        }
        trail={
          <span className={styles["when"]}>
            <time>{when(time, height)}</time>
            {success ? null : <span className={styles["failed"]}> failed</span>}
          </span>
        }
      >
        <div className={styles["card"]}>
          <div className={styles["inside"]}>
            <Stack space="s">
              <span className="label">{`Call · ${universe}`}</span>
              <h5 className={styles["name"]}>{func ?? "Unknown function"}</h5>
              <Stack as="dl" space="xs">
                <Line label="Function">{func ?? "unknown"}</Line>
                <Line label="Caller">
                  {caller === null ? (
                    "unknown"
                  ) : (
                    <Stack space="3xs">
                      <Cluster space="xs" wrap="no">
                        <Avatar address={caller} name={who} size="s" decorative />
                        <span>{who}</span>
                      </Cluster>
                      <span className={styles["address"]}>{caller}</span>
                    </Stack>
                  )}
                </Line>
                <Line label="Time">{time === null ? "not read" : readable(time)}</Line>
                <Line label="Block">{grouped(height)}</Line>
                <Line label="Result">
                  <Chip tone={success ? "mine" : "danger"}>{success ? "Succeeded" : "Failed"}</Chip>
                </Line>
              </Stack>
            </Stack>
          </div>
        </div>
      </Disclosure>
    </div>
  );
}
