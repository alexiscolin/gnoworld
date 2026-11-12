// One call of the last calls (the proposal's .rc row): the function in the world's light, who called it, when; a click opens its facts in place
// as the proposal's call card (the design system's Disclosure, the plate's rows): the labels and their values, the caller's face and full address,
// the time read in words, the result as a chip.
import type { ReactNode } from "react";
import { Avatar, Chip, Cluster, Disclosure, Grid, grouped, Stack } from "@gnoworld/ui";
import type { RealmRollup, Worlds } from "@gnoworld/schemas/indexer";
import { PersonLink } from "../../features/chat/index.ts";
import { Fact } from "../../features/calls/index.ts";
import { agoText, HOUR_MS, utcMoment } from "../../lib/days.ts";
import { callerName } from "./names.ts";
import styles from "./CallRow.module.css";

type Call = RealmRollup["last"][number];

// How long ago under two days, else the day and the hour in UTC, as the proposal's exactTxt does.
function when(time: string | null, height: number): string {
  if (time === null) return `block ${grouped(height)}`;
  const age = Date.now() - Date.parse(time);
  return age < 48 * HOUR_MS ? agoText(Date.parse(time), Date.now()) : utcMoment(new Date(time), new Date());
}

// "24 Oct 2026, 09:36 UTC": the moment in words, to the minute, the year always.
const readable = (time: string) => utcMoment(new Date(time));

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
                      <PersonLink address={caller}>
                        <Cluster space="xs" wrap="no">
                          <Avatar address={caller} name={who} size="s" decorative />
                          <span>{who}</span>
                        </Cluster>
                      </PersonLink>
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
