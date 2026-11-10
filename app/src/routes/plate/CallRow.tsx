// One call of the last calls (the proposal's .rc row): the function in the world's light, who called it, when; a click opens its facts in place
// (the design system's Disclosure, the plate's rows).
import { Disclosure, Stack } from "@gnoworld/ui";
import type { RealmRollup, Worlds } from "@gnoworld/schemas/indexer";
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

export function CallRow({ call, worlds }: { call: Call; worlds: Worlds["worlds"] | undefined }) {
  const { func, caller, height, success, time } = call;
  const exact = time === null ? `block ${grouped(height)}` : `${time.slice(0, 10)} ${time.slice(11, 19)} UTC`;
  return (
    <div className={styles["call"]}>
      <Disclosure
        size="s"
        title={
          <>
            <span className={styles["func"]}>{func ?? "unknown function"}</span>{" "}
            <span className={styles["who"]}>{callerName(worlds, caller)}</span>
          </>
        }
        trail={
          <span className={styles["when"]}>
            <time>{when(time, height)}</time>
            {success ? null : <span className={styles["failed"]}> failed</span>}
          </span>
        }
      >
        <Stack space="2xs">
          <span className={styles["fact"]}>{`function: ${func ?? "unknown"}`}</span>
          <span className={styles["fact"]}>{`caller: ${caller ?? "unknown"}`}</span>
          <span className={styles["fact"]}>{`time: ${exact}`}</span>
          <span className={styles["fact"]}>{`result: ${success ? "succeeded" : "failed"} (indexer)`}</span>
        </Stack>
      </Disclosure>
    </div>
  );
}
