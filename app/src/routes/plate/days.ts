// A rollup's days as a line of days: the rollup holds the days that had a call, the chart wants every day from the first to the last.
import { DAY_MS, utcDay } from "../../lib/days.ts";
import type { RealmRollup } from "@gnoworld/schemas/indexer";

/** "2026-10-03" as "3 Oct" ("3 Oct 2025" before this year), the day being the chain's (UTC). */
export const dayLabel = (day: string): string => utcDay(new Date(`${day}T12:00:00Z`), new Date());

/** Every UTC day from the first with a call to the day of `until` (a moment), none counted as zero: oldest first, the last one is today. */
export function dayValues(days: RealmRollup["days"], until: string): { day: string; calls: number; callers: number }[] {
  const first = days[0];
  if (first === undefined) return [];
  const held = new Map(days.map((each) => [each.day, each]));
  const end = Math.max(Date.parse(until.slice(0, 10)), Date.parse(days.at(-1)?.day ?? ""));
  const out: { day: string; calls: number; callers: number }[] = [];
  for (let at = Date.parse(first.day); at <= end; at += DAY_MS) {
    const day = new Date(at).toISOString().slice(0, 10);
    out.push({ day, calls: held.get(day)?.calls ?? 0, callers: held.get(day)?.callers ?? 0 });
  }
  return out;
}
