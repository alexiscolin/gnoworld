// The plate's figures every kind shares (D530): who is here, as the standing's hero, and the counts a source gave, never a zero it did not.
import type { Figure } from "@gnoworld/ui";
import type { Widget } from "./model.ts";

export const grouped = (n: number): string => n.toLocaleString("en-US");
export const noun = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** The people here now, the chat's first figure, as the proposal says it: "Here now", people in the world. */
const hereFigure = (here: number): Figure => ({
  key: "here",
  label: "Here now",
  value: Number.isFinite(here) && here > 0 ? Math.round(here) : 0,
  sub: "people in the world",
});

/** A place's one line of life: the people here (mint), else what it has. */
export const statusOf = (here: number, calm: string): { label: string; tone: "mine" | "warm" | "neutral" } =>
  here > 0 ? { label: `Live · ${grouped(here)} here now`, tone: "mine" } : { label: calm, tone: "neutral" };

const HOUR = 3_600_000;
const counted = (value: number | null) =>
  value !== null && Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
const clock = (at: number) =>
  new Date(at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

const lastHours = (hours: { hours: readonly (number | null)[] } | undefined) => hours?.hours.map(counted) ?? [];

/** The chat kinds' band (the proposal's section 9): who is here, from how many countries, the messages of this hour and of the last 24. A count no
 * source gave is left out, never a zero. */
export function chatFigures({
  here,
  countries,
  hours,
}: {
  here: number;
  countries?: number;
  hours: { hours: readonly (number | null)[] } | undefined;
}): Figure[] {
  const counts = lastHours(hours);
  const total = counts.reduce((sum, count) => sum + count, 0);
  const made: (Figure | undefined)[] = [
    hereFigure(here),
    countries === undefined || countries === 0
      ? undefined
      : { key: "countries", label: "Countries", value: countries, sub: "speaking now" },
    counts.length === 0
      ? undefined
      : { key: "hour", label: "This hour", value: counts.at(-1) ?? 0, sub: "messages so far" },
    counts.length === 0
      ? undefined
      : { key: "day", label: `Last ${String(counts.length)} h`, value: total, sub: "messages" },
  ];
  return made.filter((figure) => figure !== undefined);
}

/** The squares a chat's hours give a place: the messages of the day and its busiest hour; none when nothing was said. */
export function hourWidgets(hours: { from: number; hours: readonly (number | null)[] } | undefined): Widget[] {
  const counts = hours?.hours.map(counted) ?? [];
  const total = counts.reduce((sum, count) => sum + count, 0);
  if (hours === undefined || total === 0) return [];
  const peak = Math.max(...counts);
  return [
    { label: "Messages", value: grouped(total), detail: `last ${String(counts.length)} h` },
    {
      label: "Busiest hour",
      value: clock(hours.from + counts.indexOf(peak) * HOUR),
      detail: `${grouped(peak)} messages`,
    },
  ];
}
