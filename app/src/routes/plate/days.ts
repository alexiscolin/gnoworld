// A rollup's days as a line of days: the rollup holds the days that had a call, the chart wants every day from the first to the last.
import type { RealmRollup } from "@gnoworld/schemas/indexer";

const DAY_MS = 86_400_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-10-03" as "Oct 3". */
export function dayLabel(day: string): string {
  const [, month, date] = day.split("-");
  const name = MONTHS[Number(month) - 1];
  return name === undefined || date === undefined ? day : `${name} ${String(Number(date))}`;
}

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

const MINUTE = 60_000;

/** How long ago `at` was from `now`, in the proposal's words: minutes under an hour, hours under two days, days after. */
export function ago(at: number, now: number): { value: number; unit: string } {
  const minutes = Math.max(0, Math.round((now - at) / MINUTE));
  if (minutes < 60) return { value: minutes, unit: "min ago" };
  const hours = Math.round(minutes / 60);
  return hours < 48 ? { value: hours, unit: "hours ago" } : { value: Math.round(hours / 24), unit: "days ago" };
}
